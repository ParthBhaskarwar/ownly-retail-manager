"""
Sales: baskets, invoices, payments and the SALE movements.

Called from the day loop in s03_simulate. Every line is quantity 1 because
inventory is serialized -- one physical garment, one barcode, one invoice line.
That is a schema fact, not a simplification.

Money is computed the way the backend's checkout route computes it:
    grand_total = subtotal - discount_amount + tax_amount
so checks/integrity.py can assert the identity holds on every non-anomalous
invoice.
"""

from __future__ import annotations

import datetime as dt

import numpy as np

from .. import constants as C
from ..config import calendar_in as CAL
from ..config import params as P
from ..config import vocab as V
from ..world import World

_HOUR_WEIGHTS = np.array([0.04, 0.05, 0.06, 0.07, 0.08, 0.09,
                          0.10, 0.12, 0.13, 0.12, 0.09, 0.05])


def _draw_basket_size(w: World, festive: bool) -> int:
    rng = w.rng
    if festive:
        return int(max(1, rng.poisson(P.BASKET_FESTIVE_MEAN - 1) + 1))
    sizes = list(P.BASKET_SIZE_PROBS.keys())
    probs = np.array(list(P.BASKET_SIZE_PROBS.values()))
    return int(rng.choice(sizes, p=probs / probs.sum()))


def _payment_mix(w: World, day: dt.date, ticket: float) -> dict[str, float]:
    """Payment shares on a day, drifting across the window and by ticket size."""
    span = max((w.profile.end - w.profile.start).days, 1)
    t = (day - w.profile.start).days / span
    mix = {
        k: P.PAYMENT_MIX_START[k] + t * (P.PAYMENT_MIX_END[k]
                                        - P.PAYMENT_MIX_START[k])
        for k in P.PAYMENT_MIX_START
    }
    if ticket > P.CARD_TICKET_THRESHOLD:
        mix["CARD"] *= P.CARD_TICKET_MULTIPLIER
    mix["CASH"] *= (1.0 - P.CASH_TICKET_DECAY * min(ticket / 5000.0, 1.0))
    mix["CREDIT_NOTE"] = 0.0        # only issued against a real credit note
    total = sum(mix.values())
    return {k: v / total for k, v in mix.items()}


def _bill_discount(w: World, day: dt.date, subtotal: float
                   ) -> tuple[str | None, float, float]:
    """Return (discount_type, discount_value, discount_amount).

    55% of discounts are round-rupee-off, which is how Indian small retail
    actually discounts and which the FIXED discount_type exists to express.
    """
    rng = w.rng
    if CAL.is_eoss(day):
        share = P.DISCOUNT_BILL_SHARE["eoss"]
    elif CAL.is_major_festive_window(day):
        share = P.DISCOUNT_BILL_SHARE["festive"]
    else:
        share = P.DISCOUNT_BILL_SHARE["regular"]

    if not rng.chance(share):
        # A small share of bills get a rupee-level cash rounding instead.
        if rng.chance(P.CASH_ROUNDING_SHARE):
            amt = float(rng.randint(1, 9))
            return "FIXED", amt, min(amt, subtotal)
        return None, 0.0, 0.0

    if rng.chance(P.DISCOUNT_ROUND_OFF_SHARE):
        amt = float(rng.choice(P.ROUND_OFF_AMOUNTS))
        amt = min(amt, round(subtotal * 0.5, 2))
        return "FIXED", amt, amt

    pct = P.DISCOUNT_PCT_BASE + float(rng.gamma(*P.DISCOUNT_PCT_GAMMA))
    pct = min(pct, P.DISCOUNT_PCT_CAP)
    return "PERCENTAGE", round(pct, 2), round(subtotal * pct / 100.0, 2)


def _pick_customer(w: World, day: dt.date) -> dict | None:
    rng = w.rng
    if not rng.chance(P.CUSTOMER_CAPTURE_RATE):
        return None
    existing = w.rows["customers"]
    if existing and rng.chance(P.CUSTOMER_REPEAT_RATE):
        cust = existing[int(rng.randint(0, len(existing) - 1))]
        cust["total_purchases"] += 1
        return cust

    name = f"{rng.choice(V.FIRST_NAMES)} {rng.choice(V.LAST_NAMES)}"
    ts = dt.datetime.combine(day, dt.time(12, 0)).isoformat()
    return w.add("customers", {
        "id": rng.uuid(), "store_id": w.store_id, "name": name,
        "phone": f"9{rng.randint(100000000, 999999999)}",
        "email": None, "total_purchases": 1,
        "created_at": ts, "updated_at": ts,
    })


def _group_baskets(w: World, day: dt.date, events: list[dict]) -> list[list[dict]]:
    """Group the day's sale events into baskets, with topwear/bottomwear lift.

    Co-purchase is not decoration: it is what makes basket-level features
    (n_lines, basket value) carry information for the return-risk model.
    """
    rng = w.rng
    festive = CAL.is_major_festive_window(day)
    pool = rng.shuffled(events)

    tops = [e for e in pool if e["product"].category == "Topwear"]
    bottoms = [e for e in pool if e["product"].category == "Bottomwear"]
    rest = [e for e in pool if e["product"].category not in ("Topwear", "Bottomwear")]

    baskets: list[list[dict]] = []
    pair_prob = min(0.9, 0.12 * P.COPURCHASE_LIFT)

    while tops or bottoms or rest:
        n = _draw_basket_size(w, festive)
        basket: list[dict] = []

        if n >= 2 and tops and bottoms and rng.chance(pair_prob):
            basket.append(tops.pop())
            basket.append(bottoms.pop())

        while len(basket) < n:
            remaining = [lst for lst in (tops, bottoms, rest) if lst]
            if not remaining:
                break
            src = remaining[int(rng.randint(0, len(remaining) - 1))]
            basket.append(src.pop())

        if basket:
            baskets.append(basket)
    return baskets


def build_invoices(w: World, st, day: dt.date, events: list[dict]) -> None:
    rng = w.rng
    for basket in _group_baskets(w, day, events):
        _make_invoice(w, st, day, basket)


def _make_invoice(w: World, st, day: dt.date, basket: list[dict]) -> None:
    rng = w.rng
    hour = int(rng.choice(list(range(P.STORE_OPEN_HOUR[0], P.STORE_OPEN_HOUR[1] + 1)),
                          p=_HOUR_WEIGHTS / _HOUR_WEIGHTS.sum()))
    ts = dt.datetime.combine(
        day, dt.time(hour, int(rng.randint(0, 59)), int(rng.randint(0, 59))))
    iso = ts.isoformat()

    invoice_id = rng.uuid()
    cashier_id = str(rng.choice(w.cashier_ids))
    customer = _pick_customer(w, day)

    lines, subtotal, tax_base = [], 0.0, 0.0
    for ev in basket:
        p, item = ev["product"], ev["item"]
        final_price = round(ev["unit_price"] - ev["line_discount"], 2)
        subtotal += final_price
        tax_base += final_price * C.gst_rate_for(p.mrp)

        line_id = rng.uuid()
        prior_status = item.status          # RETURNED_TO_STOCK when resold
        item.status = "SOLD"
        item.sold_on = day
        item.invoice_item_id = line_id
        row = w.by_id["inventory_items"][item.id]
        row["status"] = "SOLD"
        row["updated_at"] = iso

        lines.append({
            "id": line_id, "invoice_id": invoice_id, "product_id": p.id,
            "variant_id": item.variant_id, "inventory_item_id": item.id,
            "barcode": item.barcode, "product_name": p.name,
            "variant_name": f"{p.name} / {item.size}",
            "quantity": 1,
            "unit_price": round(ev["unit_price"], 2),
            "discount_amount": round(ev["line_discount"], 2),
            "final_price": final_price,
            "status": "ACTIVE", "created_at": iso,
            "_from_status": prior_status,
        })
        st.sold[p.id] = st.sold.get(p.id, 0) + 1
        st.day_sales[p.id] = st.day_sales.get(p.id, 0) + 1

    subtotal = round(subtotal, 2)
    dtype, dvalue, damount = _bill_discount(w, day, subtotal)
    damount = round(min(damount, subtotal), 2)

    # Tax on the post-discount base, using the blended slab rate of the lines.
    blended = (tax_base / subtotal) if subtotal > 0 else 0.0
    tax_amount = round((subtotal - damount) * blended, 2)
    grand_total = round(subtotal - damount + tax_amount, 2)

    mix = _payment_mix(w, day, grand_total)
    methods = list(mix.keys())
    probs = np.array([mix[m] for m in methods])
    method = str(rng.choice(methods, p=probs / probs.sum()))

    if method == "CASH":
        # Cash customers hand over a round note.
        tendered = float(np.ceil(grand_total / 10.0) * 10)
    else:
        tendered = grand_total
    change = round(max(tendered - grand_total, 0.0), 2)

    payments = [{
        "id": rng.uuid(), "invoice_id": invoice_id, "payment_method": method,
        "amount": round(tendered if method == "CASH" else grand_total, 2),
        "transaction_reference": (None if method == "CASH"
                                  else f"{method}{rng.randint(10**9, 10**10 - 1)}"),
        "status": "COMPLETED", "created_at": iso,
    }]
    # Occasional split payment across two methods.
    if grand_total > 1500 and rng.chance(0.08):
        first = round(grand_total * float(rng.uniform(0.3, 0.7)), 2)
        payments[0]["amount"] = first
        payments[0]["payment_method"] = "CASH"
        payments[0]["transaction_reference"] = None
        payments.append({
            "id": rng.uuid(), "invoice_id": invoice_id, "payment_method": "UPI",
            "amount": round(grand_total - first, 2),
            "transaction_reference": f"UPI{rng.randint(10**9, 10**10 - 1)}",
            "status": "COMPLETED", "created_at": iso,
        })
        change = 0.0

    seq = w.next_number(f"inv-{day.isoformat()}")
    w.add("invoices", {
        "id": invoice_id, "store_id": w.store_id,
        "invoice_number": f"INV-{day.strftime('%Y%m%d')}-{seq:04d}",
        "customer_id": customer["id"] if customer else None,
        "customer_name": customer["name"] if customer else None,
        "customer_phone": customer["phone"] if customer else None,
        "cashier_id": cashier_id,
        "subtotal": subtotal,
        "discount_type": dtype, "discount_value": dvalue,
        "discount_amount": damount,
        "discount_applied_by": cashier_id if damount > 0 else None,
        "tax_amount": tax_amount, "grand_total": grand_total,
        "amount_paid": round(sum(p["amount"] for p in payments), 2),
        "change_given": change,
        "status": "COMPLETED", "notes": None,
        "created_at": iso, "updated_at": iso,
    })

    for line in lines:
        w.add("invoice_items", line)
    for pay in payments:
        w.add("payments", pay)

    for line, ev in zip(lines, basket):
        w.add("inventory_movements", {
            "id": rng.uuid(), "store_id": w.store_id,
            "inventory_item_id": line["inventory_item_id"],
            "movement_type": "SALE",
            "from_status": line["_from_status"], "to_status": "SOLD",
            "reference_type": "INVOICE", "reference_id": invoice_id,
            "performed_by": cashier_id, "performed_at": iso, "notes": None,
        })

    from . import s06_returns
    s06_returns.maybe_schedule(w, st, day, lines, basket, invoice_id, customer)
