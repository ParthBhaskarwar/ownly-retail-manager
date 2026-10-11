"""
Returns, exchanges and credit notes.

Return probability is driven by three *distinct* causes so a model has to
disentangle them rather than learn one dominant proxy:

  * fit  -- 15% of products "run small" (2.2x on S/M); edge sizes 1.5x
  * lot quality -- supplier defect rates, one of which degrades from month 14,
    so the signal is a change-point rather than a constant
  * impulse -- units sold at more than 35% off come back 1.8x as often

Offline apparel returns run about 3.5% of units, far below online, and the mix
is exchange-heavy. Recording everything as a cash refund would leave the
EXCHANGE movement type and the exchanges table unused.
"""

from __future__ import annotations

import datetime as dt

import numpy as np

from ..config import calendar_in as CAL
from ..config import params as P
from ..world import World

_EDGE_SIZES = {"XS", "XXL", "XXXL"}
_SMALL_SIZES = {"S", "M"}


def _supplier_of(w: World, product):
    return next(s for s in w.suppliers if s.id == product.supplier_id)


def _return_probability(w: World, day: dt.date, product, size: str,
                        markdown: float) -> float:
    p = P.RETURN_RATE_BY_CATEGORY.get(product.category, 0.03)

    if product.runs_small and size in _SMALL_SIZES:
        p *= P.RUNS_SMALL_MULT
    if size in _EDGE_SIZES:
        p *= P.EDGE_SIZE_MULT
    if markdown > P.IMPULSE_DISCOUNT_THRESHOLD:
        p *= P.IMPULSE_RETURN_MULT

    supplier = _supplier_of(w, product)
    defect = supplier.defect_rate
    if supplier.degrades:
        months = (day.year - w.profile.start.year) * 12 + \
                 (day.month - w.profile.start.month)
        if months >= P.DEGRADING_SUPPLIER_MONTH:
            defect *= P.DEGRADING_SUPPLIER_MULT
    p *= (1.0 + defect * 4.0)

    # Impulse buying right after a major festive peak comes back more often.
    if CAL.is_major_festive_window(day):
        p *= P.RETURN_POST_FESTIVE_MULT

    return float(min(p * P.RETURN_CALIBRATION, 0.5))


def maybe_schedule(w: World, st, day: dt.date, lines: list[dict],
                   basket: list[dict], invoice_id: str,
                   customer: dict | None) -> None:
    rng = w.rng
    for line, ev in zip(lines, basket):
        product, item = ev["product"], ev["item"]
        markdown = ev["markdown"]
        if not rng.chance(_return_probability(w, day, product, item.size, markdown)):
            continue

        delay = int(rng.randint(*P.RETURN_WINDOW_DAYS))
        due = day + dt.timedelta(days=delay)
        if due > w.profile.end:
            continue

        outcomes = list(P.RETURN_OUTCOME_MIX.keys())
        probs = np.array(list(P.RETURN_OUTCOME_MIX.values()))
        outcome = str(rng.choice(outcomes, p=probs / probs.sum()))

        st.return_queue.setdefault(due, []).append({
            "line": line, "item": item, "product": product,
            "invoice_id": invoice_id, "customer": customer,
            "outcome": outcome, "sold_on": day,
        })


def process_due(w: World, st, day: dt.date) -> None:
    for entry in st.return_queue.pop(day, []):
        if entry["outcome"] == "exchange":
            _exchange(w, st, day, entry)
        else:
            _refund(w, st, day, entry)


# ── shared bookkeeping ───────────────────────────────────────────────────────

def _condition_and_action(w: World, outcome: str) -> tuple[str, str, str]:
    """(condition, inventory_action, resulting item status)."""
    rng = w.rng
    if outcome == "damaged_defective":
        cond = "DEFECTIVE" if rng.chance(0.45) else "DAMAGED"
        return cond, "RETURN_DAMAGED", "RETURNED_DAMAGED"
    if rng.chance(0.12):
        # Tried on and visibly worn: held aside rather than put back on the rail.
        return "OPENED_USED", "RETURN_TO_STOCK", "EXCHANGED"
    return "RESELLABLE", "RETURN_TO_STOCK", "RETURNED_TO_STOCK"


def _write_return(w: World, st, day: dt.date, entry: dict, *,
                  refund_method: str, movement_type: str) -> tuple[str, str, float]:
    rng = w.rng
    line, item, product = entry["line"], entry["item"], entry["product"]
    iso = dt.datetime.combine(day, dt.time(13, 30)).isoformat()

    cond, action, new_status = _condition_and_action(w, entry["outcome"])
    refund_amount = round(float(line["final_price"]), 2)

    return_id = rng.uuid()
    seq = w.next_number(f"ret-{day.isoformat()}")
    processed_by = str(rng.choice(w.cashier_ids))

    w.add("returns", {
        "id": return_id,
        "return_number": f"RET-{day.strftime('%Y%m%d')}-{seq:04d}",
        "store_id": w.store_id,
        "original_invoice_id": entry["invoice_id"],
        "customer_id": entry["customer"]["id"] if entry["customer"] else None,
        "processed_by": processed_by,
        "total_refund_amount": refund_amount,
        "refund_method": refund_method,
        "notes": None, "created_at": iso,
    })
    w.add("return_items", {
        "id": rng.uuid(), "return_id": return_id,
        "original_invoice_item_id": line["id"],
        "inventory_item_id": item.id,
        "condition": cond,
        "reason": _reason_for(w, cond, product, item.size),
        "refund_amount": refund_amount,
        "inventory_action": action, "created_at": iso,
    })

    prev_status = item.status
    item.status = new_status
    _set_item_status(w, item.id, new_status, iso)
    w.add("inventory_movements", {
        "id": rng.uuid(), "store_id": w.store_id, "inventory_item_id": item.id,
        "movement_type": movement_type,
        "from_status": prev_status, "to_status": new_status,
        "reference_type": "RETURN_TRANSACTION", "reference_id": return_id,
        "performed_by": processed_by, "performed_at": iso, "notes": cond,
    })

    # Resellable stock goes back on the rail and can sell again.
    if new_status == "RETURNED_TO_STOCK":
        st.on_hand[item.variant_id].append(item)

    return return_id, processed_by, refund_amount


def _reason_for(w: World, condition: str, product, size: str) -> str:
    if condition in ("DAMAGED", "DEFECTIVE"):
        return w.rng.choice(["Stitching defect", "Colour bleed", "Torn seam",
                             "Button missing"])
    if product.runs_small and size in _SMALL_SIZES:
        return "Size too small"
    return w.rng.choice(["Size issue", "Changed mind", "Fit not right",
                         "Colour not as expected"])


def _set_item_status(w: World, item_id: str, status: str, iso: str) -> None:
    row = w.by_id["inventory_items"].get(item_id)
    if row is not None:
        row["status"] = status
        row["updated_at"] = iso


def _mark_invoice_item(w: World, line_id: str, status: str) -> None:
    row = w.by_id["invoice_items"].get(line_id)
    if row is not None:
        row["status"] = status


def _refresh_invoice_status(w: World, invoice_id: str, exchanged: bool) -> None:
    lines = w.lines_by_invoice.get(invoice_id, [])
    if not lines:
        return
    touched = [r for r in lines if r["status"] != "ACTIVE"]
    if exchanged:
        status = "EXCHANGED"
    elif len(touched) == len(lines):
        status = "FULLY_RETURNED"
    else:
        status = "PARTIALLY_RETURNED"
    row = w.by_id["invoices"].get(invoice_id)
    if row is not None:
        row["status"] = status


# ── refund path ──────────────────────────────────────────────────────────────

def _refund(w: World, st, day: dt.date, entry: dict) -> None:
    rng = w.rng
    iso = dt.datetime.combine(day, dt.time(13, 30)).isoformat()

    # Credit notes are issued against real returns and redeemed later, never
    # sampled independently -- otherwise the reconciliation checks are hollow.
    method = "CREDIT_NOTE" if rng.chance(0.22) else \
        str(rng.choice(["CASH", "UPI", "CARD"], p=np.array([0.5, 0.35, 0.15])))

    return_id, processed_by, amount = _write_return(
        w, st, day, entry, refund_method=method, movement_type=(
            "RETURN_DAMAGED" if entry["outcome"] == "damaged_defective"
            else "RETURN_TO_STOCK"))

    _mark_invoice_item(w, entry["line"]["id"], "RETURNED")
    _refresh_invoice_status(w, entry["invoice_id"], exchanged=False)

    if method == "CREDIT_NOTE":
        seq = w.next_number(f"cn-{day.isoformat()}")
        w.add("credit_notes", {
            "id": rng.uuid(),
            "credit_note_number": f"CN-{day.strftime('%Y%m%d')}-{seq:04d}",
            "store_id": w.store_id,
            "original_invoice_id": entry["invoice_id"],
            "return_id": return_id,
            "customer_id": entry["customer"]["id"] if entry["customer"] else None,
            "original_amount": amount, "remaining_amount": amount,
            "status": "ACTIVE",
            "expiry_date": (day + dt.timedelta(days=90)).isoformat(),
            "created_at": iso,
        })


# ── exchange path ────────────────────────────────────────────────────────────

def _exchange(w: World, st, day: dt.date, entry: dict) -> None:
    """A return plus a replacement invoice, linked by an exchanges row.

    Most exchanges are size swaps, so the replacement is preferentially another
    size of the same product. If nothing is in stock the exchange degrades to a
    refund, which is what actually happens at a counter.
    """
    rng = w.rng
    product, item = entry["product"], entry["item"]
    iso = dt.datetime.combine(day, dt.time(14, 0)).isoformat()

    replacement = _find_replacement(w, st, product, item.size)
    if replacement is None:
        entry["outcome"] = "refund_resellable"
        _refund(w, st, day, entry)
        return

    return_id, processed_by, returned_value = _write_return(
        w, st, day, entry, refund_method="EXCHANGE", movement_type="EXCHANGE")
    _mark_invoice_item(w, entry["line"]["id"], "EXCHANGED")

    replacement_value = round(product.mrp, 2)
    difference = round(replacement_value - returned_value, 2)
    # The credit applied can never exceed the replacement's own value; any
    # excess is refunded separately rather than making grand_total negative.
    credit_applied = round(min(returned_value, replacement_value), 2)

    rep_invoice_id = rng.uuid()
    seq = w.next_number(f"inv-{day.isoformat()}")
    tax = round(max(replacement_value - credit_applied, 0.0)
                * _blended_rate(product), 2)
    grand_total = round(replacement_value - credit_applied + tax, 2)

    w.add("invoices", {
        "id": rep_invoice_id, "store_id": w.store_id,
        "invoice_number": f"INV-{day.strftime('%Y%m%d')}-{seq:04d}",
        "customer_id": entry["customer"]["id"] if entry["customer"] else None,
        "customer_name": entry["customer"]["name"] if entry["customer"] else None,
        "customer_phone": entry["customer"]["phone"] if entry["customer"] else None,
        "cashier_id": processed_by,
        "subtotal": replacement_value,
        "discount_type": "FIXED", "discount_value": credit_applied,
        "discount_amount": credit_applied, "discount_applied_by": processed_by,
        "tax_amount": tax,
        "grand_total": grand_total,
        "amount_paid": grand_total, "change_given": 0.0,
        "status": "COMPLETED", "notes": f"Exchange against {return_id}",
        "created_at": iso, "updated_at": iso,
    })

    rep_line_id = rng.uuid()
    replacement_prior = replacement.status
    replacement.status = "SOLD"
    replacement.sold_on = day
    replacement.invoice_item_id = rep_line_id
    _set_item_status(w, replacement.id, "SOLD", iso)

    w.add("invoice_items", {
        "id": rep_line_id, "invoice_id": rep_invoice_id, "product_id": product.id,
        "variant_id": replacement.variant_id, "inventory_item_id": replacement.id,
        "barcode": replacement.barcode, "product_name": product.name,
        "variant_name": f"{product.name} / {replacement.size}",
        "quantity": 1, "unit_price": replacement_value,
        "discount_amount": 0.0, "final_price": replacement_value,
        "status": "ACTIVE", "created_at": iso,
    })
    w.add("inventory_movements", {
        "id": rng.uuid(), "store_id": w.store_id,
        "inventory_item_id": replacement.id, "movement_type": "SALE",
        "from_status": replacement_prior, "to_status": "SOLD",
        "reference_type": "INVOICE", "reference_id": rep_invoice_id,
        "performed_by": processed_by, "performed_at": iso, "notes": "Exchange",
    })
    st.sold[product.id] = st.sold.get(product.id, 0) + 1
    st.day_sales[product.id] = st.day_sales.get(product.id, 0) + 1

    if grand_total > 0:
        w.add("payments", {
            "id": rng.uuid(), "invoice_id": rep_invoice_id,
            "payment_method": "UPI", "amount": grand_total,
            "transaction_reference": f"UPI{rng.randint(10**9, 10**10 - 1)}",
            "status": "COMPLETED", "created_at": iso,
        })
        payment_status = "CUSTOMER_PAID"
    elif difference < 0:
        payment_status = "REFUND_ISSUED"
    else:
        payment_status = "BALANCED"

    seq_x = w.next_number(f"exc-{day.isoformat()}")
    w.add("exchanges", {
        "id": rng.uuid(),
        "exchange_number": f"EXC-{day.strftime('%Y%m%d')}-{seq_x:04d}",
        "store_id": w.store_id,
        "original_invoice_id": entry["invoice_id"],
        "return_id": return_id,
        "replacement_invoice_id": rep_invoice_id,
        "processed_by": processed_by,
        "returned_value": returned_value,
        "replacement_value": replacement_value,
        "difference_amount": difference,
        "payment_status": payment_status,
        "created_at": iso,
    })
    _refresh_invoice_status(w, entry["invoice_id"], exchanged=True)


def _blended_rate(product) -> float:
    from .. import constants as C
    return C.gst_rate_for(product.mrp)


def _find_replacement(w: World, st, product, original_size: str):
    """Prefer a different size of the same product -- most exchanges are fit."""
    for size, vid in product.variant_ids.items():
        if size != original_size and st.on_hand.get(vid):
            return st.on_hand[vid].pop()
    for size, vid in product.variant_ids.items():
        if st.on_hand.get(vid):
            return st.on_hand[vid].pop()
    return None
