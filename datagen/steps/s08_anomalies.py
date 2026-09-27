"""
Step 5 — injected anomalies and their ground truth.

Four things make this evaluable rather than decorative:

  1. Hard negatives. Legitimate events that look anomalous -- genuine
     below-cost clearance, a real stocktake write-off, a 3am wholesale order --
     are injected and labelled 0. Without them precision is meaningless, because
     a detector that flags every below-cost line scores perfectly.
  2. Ranking, not classification. At a ~1.5% base rate accuracy is useless, so
     the labels are shaped for precision@k and AUC-PR.
  3. A detectability split. Over half these types are caught at ~100% precision
     by deterministic integrity checks, not ML. That belongs in a validation
     layer, and saying so is more honest than promising a model for all of it.
  4. Contamination flags. Anomalous lines are marked so the ML label builder can
     exclude them; otherwise 1.5% of deliberate garbage lands in the velocity
     and dead-stock labels.

`is_positive = 0` rows in truth/anomaly_labels.csv are the hard negatives.
"""

from __future__ import annotations

import datetime as dt

from .. import constants as C
from ..config import calendar_in as CAL
from ..config import params as P
from ..world import World


def _day_after_purchase(w: World, row: dict, lo: int, hi: int) -> dt.date:
    """A date inside the unit's shelf life.

    Drawing freely from the whole window could place an event before the unit
    was received, which silently reorders its movement chain.
    """
    purchased = dt.date.fromisoformat(row["purchase_date"])
    earliest = purchased + dt.timedelta(days=1)
    if earliest >= w.profile.end:
        return earliest
    span = (w.profile.end - earliest).days
    return earliest + dt.timedelta(days=int(w.rng.randint(0, min(span, hi - lo))))

# Types a deterministic rule catches, versus those needing a statistical model.
RULE_DETECTABLE = {
    "BILL_DISCOUNT_MISMATCH", "BILL_TAX_OFF_SLAB", "BILL_TOTAL_MISMATCH",
    "BILL_PAYMENT_MISMATCH", "BILL_OFF_HOURS", "BILL_DUPLICATE_INVOICE",
    "INV_DOUBLE_SALE", "INV_PHANTOM_STOCK", "INV_SOLD_BEFORE_RECEIVED",
    "INV_STATUS_INCONSISTENT", "INV_RETURN_NO_SALE",
}


def run(w: World) -> None:
    rng = w.rng
    invoices = w.rows["invoices"]
    if not invoices:
        return

    scale = len(invoices) / max(P.TARGET_INVOICES, 1)

    def n(key: str) -> int:
        return max(1, int(round(P.ANOMALY_COUNTS[key] * scale)))

    picked: set[str] = set()

    def pick_invoices(count: int) -> list[dict]:
        out = []
        for _ in range(count * 4):
            if len(out) >= count:
                break
            inv = invoices[int(rng.randint(0, len(invoices) - 1))]
            if inv["id"] in picked:
                continue
            picked.add(inv["id"])
            out.append(inv)
        return out

    _below_cost(w, pick_invoices(n("BILL_BELOW_COST")))
    _excess_discount(w, pick_invoices(n("BILL_EXCESS_DISCOUNT")))
    _discount_mismatch(w, pick_invoices(n("BILL_DISCOUNT_MISMATCH")))
    _tax_off_slab(w, pick_invoices(n("BILL_TAX_OFF_SLAB")))
    _total_mismatch(w, pick_invoices(n("BILL_TOTAL_MISMATCH")))
    _payment_mismatch(w, pick_invoices(n("BILL_PAYMENT_MISMATCH")))
    _off_hours(w, pick_invoices(n("BILL_OFF_HOURS")))
    _duplicate_invoices(w, pick_invoices(n("BILL_DUPLICATE_INVOICE")))
    _cashier_drift(w)

    _double_sale(w, n("INV_DOUBLE_SALE"))
    _phantom_stock(w, n("INV_PHANTOM_STOCK"))
    _shrinkage_burst(w, n("INV_SHRINKAGE_BURST"))
    _sold_before_received(w, n("INV_SOLD_BEFORE_RECEIVED"))
    _cost_outlier(w, n("INV_COST_OUTLIER"))
    _status_inconsistent(w, n("INV_STATUS_INCONSISTENT"))
    _return_no_sale(w, n("INV_RETURN_NO_SALE"))

    _hard_negatives(w, scale)
    _reconcile(w)


def _reconcile(w: World) -> None:
    """Final sweep: every invoice NOT carrying an injected billing anomaly must
    still balance.

    Anomalies are applied independently and a few can land on the same invoice
    (cashier drift runs across every bill, including ones another injector
    already touched). Rather than forbid that, restate the invariant once at the
    end so the only unbalanced bills are the ones deliberately labelled as such.
    """
    labelled = {r["entity_id"] for r in w.truth["anomaly_labels"]
                if r["is_positive"] == 1
                and r["anomaly_type"].startswith("BILL_")
                and r["anomaly_type"] != "BILL_CASHIER_DRIFT"}

    pays_by_invoice: dict[str, list[dict]] = {}
    for pay in w.rows["payments"]:
        pays_by_invoice.setdefault(pay["invoice_id"], []).append(pay)

    for inv in w.rows["invoices"]:
        if inv["id"] in labelled:
            continue
        pays = pays_by_invoice.get(inv["id"])
        if not pays:
            # A zero-balance exchange starts with no payment row; if another
            # injector later moved its total off zero it needs one.
            if inv["grand_total"] <= 0.01:
                continue
            pays = [w.add("payments", {
                "id": w.rng.uuid(), "invoice_id": inv["id"],
                "payment_method": "UPI", "amount": inv["grand_total"],
                "transaction_reference": f"UPI{w.rng.randint(10**9, 10**10 - 1)}",
                "status": "COMPLETED", "created_at": inv["created_at"],
            })]
        total = round(sum(p["amount"] for p in pays), 2)
        if total + 0.02 < inv["grand_total"]:
            pays[0]["amount"] = round(pays[0]["amount"]
                                      + inv["grand_total"] - total, 2)
            total = round(sum(p["amount"] for p in pays), 2)
        inv["amount_paid"] = total
        inv["change_given"] = round(max(total - inv["grand_total"], 0.0), 2)


def _log(w: World, kind: str, entity_type: str, entity_id: str, desc: str,
         *, severity="medium", aggregate=0, positive=1, start=None, end=None):
    w.log_anomaly(
        kind, entity_type, entity_id,
        severity=severity, is_aggregate_only=aggregate, is_positive=positive,
        detectability="easy" if kind in RULE_DETECTABLE else "hard",
        description=desc, window_start=start, window_end=end)


def _lines(w: World, inv: dict) -> list[dict]:
    return w.lines_by_invoice.get(inv["id"], [])


def _recompute(inv: dict, lines: list[dict]) -> None:
    inv["subtotal"] = round(sum(l["final_price"] for l in lines), 2)
    inv["grand_total"] = round(
        inv["subtotal"] - inv["discount_amount"] + inv["tax_amount"], 2)


# ── billing ──────────────────────────────────────────────────────────────────

def _below_cost(w: World, invs: list[dict]) -> None:
    for inv in invs:
        lines = _lines(w, inv)
        if not lines:
            continue
        line = lines[0]
        item = w.items.get(line["inventory_item_id"])
        if not item:
            continue
        line["final_price"] = round(item.cost * float(w.rng.uniform(0.55, 0.85)), 2)
        line["discount_amount"] = round(line["unit_price"] - line["final_price"], 2)
        _recompute(inv, lines)
        line["_anomalous"] = True
        _log(w, "BILL_BELOW_COST", "invoice_item", line["id"],
             "Line sold below unit cost outside any clearance window")


def _excess_discount(w: World, invs: list[dict]) -> None:
    for inv in invs:
        day = dt.date.fromisoformat(inv["created_at"][:10])
        if CAL.is_eoss(day):
            continue
        inv["discount_type"] = "PERCENTAGE"
        pct = float(w.rng.uniform(62, 85))
        inv["discount_value"] = round(pct, 2)
        inv["discount_amount"] = round(inv["subtotal"] * pct / 100.0, 2)
        _recompute(inv, _lines(w, inv))
        inv["amount_paid"] = inv["grand_total"]
        _log(w, "BILL_EXCESS_DISCOUNT", "invoice", inv["id"],
             f"{pct:.0f}% bill discount outside EOSS", severity="high")


def _discount_mismatch(w: World, invs: list[dict]) -> None:
    """discount_amount no longer follows from discount_type and value."""
    for inv in invs:
        inv["discount_type"] = "PERCENTAGE"
        inv["discount_value"] = 10.0
        inv["discount_amount"] = round(inv["subtotal"] * 0.10
                                       + float(w.rng.uniform(25, 180)), 2)
        _recompute(inv, _lines(w, inv))
        inv["amount_paid"] = inv["grand_total"]
        _log(w, "BILL_DISCOUNT_MISMATCH", "invoice", inv["id"],
             "discount_amount inconsistent with discount_type and value")


def _tax_off_slab(w: World, invs: list[dict]) -> None:
    for inv in invs:
        inv["tax_amount"] = round(inv["tax_amount"] * float(w.rng.uniform(1.8, 3.0))
                                  + 15, 2)
        _recompute(inv, _lines(w, inv))
        inv["amount_paid"] = inv["grand_total"]
        _log(w, "BILL_TAX_OFF_SLAB", "invoice", inv["id"],
             "tax_amount does not match the GST slab for these lines")


def _total_mismatch(w: World, invs: list[dict]) -> None:
    for inv in invs:
        inv["grand_total"] = round(inv["grand_total"]
                                   + float(w.rng.uniform(40, 300)), 2)
        _log(w, "BILL_TOTAL_MISMATCH", "invoice", inv["id"],
             "grand_total != subtotal - discount + tax", severity="high")


def _payment_mismatch(w: World, invs: list[dict]) -> None:
    for inv in invs:
        pays = [p for p in w.rows["payments"] if p["invoice_id"] == inv["id"]]
        if not pays:
            continue
        pays[0]["amount"] = round(pays[0]["amount"] * float(w.rng.uniform(0.55, 0.85)), 2)
        inv["amount_paid"] = round(sum(p["amount"] for p in pays), 2)
        _log(w, "BILL_PAYMENT_MISMATCH", "invoice", inv["id"],
             "sum of payments is less than grand_total", severity="high")


def _off_hours(w: World, invs: list[dict]) -> None:
    for inv in invs:
        day = inv["created_at"][:10]
        hour = int(w.rng.choice([2, 3, 4, 5, 23]))
        stamp = f"{day}T{hour:02d}:{int(w.rng.randint(0, 59)):02d}:00"
        inv["created_at"] = inv["updated_at"] = stamp
        for line in _lines(w, inv):
            line["created_at"] = stamp
        _log(w, "BILL_OFF_HOURS", "invoice", inv["id"],
             f"Invoice raised at {hour:02d}:00, outside trading hours")


def _duplicate_invoices(w: World, invs: list[dict]) -> None:
    """The same basket billed twice within five minutes."""
    rng = w.rng
    for inv in invs:
        lines = _lines(w, inv)
        if not lines:
            continue
        clone_id = rng.uuid()
        base = dt.datetime.fromisoformat(inv["created_at"])
        stamp = (base + dt.timedelta(minutes=int(rng.randint(1, 5)))).isoformat()
        seq = w.next_number(f"dup-{inv['invoice_number']}")

        clone = dict(inv)
        clone.update({"id": clone_id, "created_at": stamp, "updated_at": stamp,
                      "invoice_number": f"{inv['invoice_number']}-D{seq}"})
        w.add("invoices", clone)
        for line in lines:
            dup = dict(line)
            dup.update({"id": rng.uuid(), "invoice_id": clone_id,
                        "created_at": stamp})
            dup["_anomalous"] = True
            w.add("invoice_items", dup)
        w.add("payments", {
            "id": rng.uuid(), "invoice_id": clone_id, "payment_method": "CASH",
            "amount": clone["grand_total"], "transaction_reference": None,
            "status": "COMPLETED", "created_at": stamp,
        })
        _log(w, "BILL_DUPLICATE_INVOICE", "invoice", clone_id,
             f"Duplicate of {inv['invoice_number']} within 5 minutes")


def _cashier_drift(w: World) -> None:
    """One cashier drifts to 3.5x average discount over months 15-20.

    Aggregate-only: no single bill here is anomalous, which is the point. A
    per-transaction detector cannot find this, and saying so is part of the
    honest story about what anomaly detection can and cannot do.
    """
    if len(w.cashier_ids) < 2:
        return
    cashier = w.cashier_ids[1]
    start = w.profile.start + dt.timedelta(days=30 * P.CASHIER_DRIFT_MONTHS[0])
    end = w.profile.start + dt.timedelta(days=30 * P.CASHIER_DRIFT_MONTHS[1])
    if start >= w.profile.end:
        return

    pays_by_invoice: dict[str, list[dict]] = {}
    for pay in w.rows["payments"]:
        pays_by_invoice.setdefault(pay["invoice_id"], []).append(pay)

    touched = 0
    for inv in w.rows["invoices"]:
        if inv["cashier_id"] != cashier:
            continue
        day = dt.date.fromisoformat(inv["created_at"][:10])
        if not (start <= day <= end):
            continue
        pays = pays_by_invoice.get(inv["id"])
        if not pays:
            continue          # zero-balance exchange: nothing to discount
        base = inv["discount_amount"] or 0.0
        boosted = round(min(base * P.CASHIER_DRIFT_DISCOUNT_MULT
                            + float(w.rng.uniform(20, 90)),
                            inv["subtotal"] * 0.6), 2)
        inv["discount_type"] = inv["discount_type"] or "FIXED"
        inv["discount_value"] = boosted
        inv["discount_amount"] = boosted
        _recompute(inv, _lines(w, inv))

        # This anomaly is aggregate-only: each individual bill must stay
        # internally consistent, or a trivial arithmetic rule would flag it and
        # it would stop testing what it is meant to test.
        pays[0]["amount"] = round(pays[0]["amount"]
                                  - (inv["amount_paid"] - inv["grand_total"]), 2)
        if pays[0]["amount"] < 0:
            pays[0]["amount"] = inv["grand_total"]
            for extra in pays[1:]:
                extra["amount"] = 0.0
        inv["amount_paid"] = round(sum(p["amount"] for p in pays), 2)
        inv["change_given"] = round(max(inv["amount_paid"] - inv["grand_total"],
                                        0.0), 2)
        touched += 1

    if touched:
        _log(w, "BILL_CASHIER_DRIFT", "cashier_month", cashier,
             f"Cashier discount rate {P.CASHIER_DRIFT_DISCOUNT_MULT}x baseline "
             f"across {touched} bills", severity="high", aggregate=1,
             start=start.isoformat(), end=end.isoformat())


# ── inventory ────────────────────────────────────────────────────────────────

def _sold_items(w: World) -> list[dict]:
    return [r for r in w.rows["inventory_items"] if r["status"] == "SOLD"]


def _double_sale(w: World, count: int) -> None:
    """A SALE movement on a unit that was already sold."""
    rng = w.rng
    sold = _sold_items(w)
    for row in rng.choice(sold, size=min(count, len(sold)), replace=False):
        mv_id = rng.uuid()
        stamp = (dt.datetime.fromisoformat(row["updated_at"])
                 + dt.timedelta(days=int(rng.randint(2, 40)))).isoformat()
        w.add("inventory_movements", {
            "id": mv_id, "store_id": w.store_id, "inventory_item_id": row["id"],
            "movement_type": "SALE", "from_status": "SOLD", "to_status": "SOLD",
            "reference_type": "INVOICE", "reference_id": rng.uuid(),
            "performed_by": str(rng.choice(w.cashier_ids)),
            "performed_at": stamp, "notes": None,
        })
        _log(w, "INV_DOUBLE_SALE", "movement", mv_id,
             "SALE movement recorded against an already-sold unit",
             severity="high")


def _phantom_stock(w: World, count: int) -> None:
    """IN_STOCK units with no PURCHASE movement behind them."""
    rng = w.rng
    for _ in range(count):
        product = w.products[int(rng.randint(0, len(w.products) - 1))]
        size = product.sizes[int(rng.randint(0, len(product.sizes) - 1))]
        vid = product.variant_ids[size]
        day = w.profile.end - dt.timedelta(days=int(rng.randint(10, 300)))
        iid = rng.uuid()
        seq = w.next_barcode_seq()
        w.add("inventory_items", {
            "id": iid, "store_id": w.store_id, "variant_id": vid,
            "barcode": C.make_barcode(w.store_code, f"{product.base_sku}-{size}", seq),
            "purchase_cost_price": round(product.unit_cost, 2),
            "purchase_date": day.isoformat(), "status": "IN_STOCK",
            "created_by": w.owner_id,
            "created_at": dt.datetime.combine(day, dt.time(11, 0)).isoformat(),
            "updated_at": dt.datetime.combine(day, dt.time(11, 0)).isoformat(),
        })
        _log(w, "INV_PHANTOM_STOCK", "inventory_item", iid,
             "Unit is IN_STOCK but has no PURCHASE movement")


def _shrinkage_burst(w: World, count: int) -> None:
    """15 units lost in a single week against a baseline near zero."""
    rng = w.rng
    pool = [r for r in w.rows["inventory_items"] if r["status"] == "IN_STOCK"]
    for _ in range(count):
        if len(pool) < 15:
            return
        batch = rng.choice(pool, size=15, replace=False)
        # Anchor the burst after the last unit in it was received, so no
        # write-off predates its own purchase.
        latest_purchase = max(dt.date.fromisoformat(r["purchase_date"])
                              for r in batch)
        anchor = max(latest_purchase + dt.timedelta(days=1),
                     min(latest_purchase + dt.timedelta(days=int(rng.randint(1, 30))),
                         w.profile.end - dt.timedelta(days=7)))
        for row in batch:
            if row in pool:
                pool.remove(row)
            day = anchor + dt.timedelta(days=int(rng.randint(0, 6)))
            iso = dt.datetime.combine(day, dt.time(18, 0)).isoformat()
            prev = row["status"]
            row["status"] = "LOST"
            row["updated_at"] = iso
            w.add("inventory_movements", {
                "id": rng.uuid(), "store_id": w.store_id,
                "inventory_item_id": row["id"],
                "movement_type": "LOSS_WRITE_OFF",
                "from_status": prev, "to_status": "LOST",
                "reference_type": "MANUAL_ADJUSTMENT", "reference_id": rng.uuid(),
                "performed_by": w.owner_id, "performed_at": iso, "notes": None,
            })
        _log(w, "INV_SHRINKAGE_BURST", "movement_window", anchor.isoformat(),
             "15 units written off as LOST in one week", severity="high",
             aggregate=1, start=anchor.isoformat(),
             end=(anchor + dt.timedelta(days=6)).isoformat())


def _sold_before_received(w: World, count: int) -> None:
    rng = w.rng
    sold = _sold_items(w)
    for row in rng.choice(sold, size=min(count, len(sold)), replace=False):
        sold_day = dt.date.fromisoformat(row["updated_at"][:10])
        row["purchase_date"] = (sold_day + dt.timedelta(
            days=int(rng.randint(3, 25)))).isoformat()
        _log(w, "INV_SOLD_BEFORE_RECEIVED", "inventory_item", row["id"],
             "purchase_date is after the date the unit was sold", severity="high")


def _cost_outlier(w: World, count: int) -> None:
    rng = w.rng
    pool = w.rows["inventory_items"]
    for row in rng.choice(pool, size=min(count, len(pool)), replace=False):
        row["purchase_cost_price"] = round(row["purchase_cost_price"] * 2.5, 2)
        _log(w, "INV_COST_OUTLIER", "inventory_item", row["id"],
             "Purchase cost 2.5x the usual cost for this variant")


def _status_inconsistent(w: World, count: int) -> None:
    """Status contradicts the last movement recorded for the unit."""
    rng = w.rng
    sold = _sold_items(w)
    for row in rng.choice(sold, size=min(count, len(sold)), replace=False):
        row["status"] = "IN_STOCK"
        _log(w, "INV_STATUS_INCONSISTENT", "inventory_item", row["id"],
             "Status is IN_STOCK but the last movement was a SALE",
             severity="high")


def _return_no_sale(w: World, count: int) -> None:
    rng = w.rng
    pool = [r for r in w.rows["inventory_items"] if r["status"] == "IN_STOCK"]
    if not pool:
        return
    for row in rng.choice(pool, size=min(count, len(pool)), replace=False):
        day = _day_after_purchase(w, row, 5, 200)
        iso = dt.datetime.combine(day, dt.time(15, 0)).isoformat()
        mv_id = rng.uuid()
        w.add("inventory_movements", {
            "id": mv_id, "store_id": w.store_id, "inventory_item_id": row["id"],
            "movement_type": "RETURN_TO_STOCK",
            "from_status": "SOLD", "to_status": "RETURNED_TO_STOCK",
            "reference_type": "RETURN_TRANSACTION", "reference_id": rng.uuid(),
            "performed_by": str(rng.choice(w.cashier_ids)),
            "performed_at": iso, "notes": None,
        })
        row["status"] = "RETURNED_TO_STOCK"
        _log(w, "INV_RETURN_NO_SALE", "movement", mv_id,
             "Return movement with no matching sale for the unit")


# ── hard negatives ───────────────────────────────────────────────────────────

def _hard_negatives(w: World, scale: float) -> None:
    """Legitimate events that look anomalous, labelled 0.

    A detector that flags every below-cost line or every odd-hour bill will look
    perfect without these, so precision only becomes a meaningful number once
    they exist.
    """
    rng = w.rng
    invoices = w.rows["invoices"]

    n_clear = max(1, int(P.HARD_NEGATIVE_COUNTS["LEGIT_CLEARANCE_BELOW_COST"] * scale))
    eoss = [inv for inv in invoices
            if CAL.is_eoss(dt.date.fromisoformat(inv["created_at"][:10]))]
    for inv in rng.choice(eoss, size=min(n_clear, len(eoss)), replace=False) \
            if eoss else []:
        lines = _lines(w, inv)
        if not lines:
            continue
        line = lines[0]
        item = w.items.get(line["inventory_item_id"])
        if not item:
            continue
        line["final_price"] = round(item.cost * 0.9, 2)
        line["discount_amount"] = round(line["unit_price"] - line["final_price"], 2)
        _recompute(inv, lines)
        inv["amount_paid"] = inv["grand_total"]
        _log(w, "LEGIT_CLEARANCE_BELOW_COST", "invoice_item", line["id"],
             "Genuine end-of-season clearance sold below cost", positive=0,
             severity="low")

    # A real annual stocktake: a cluster of write-offs with a paper trail.
    pool = [r for r in w.rows["inventory_items"] if r["status"] == "IN_STOCK"]
    if len(pool) >= 12:
        batch = rng.choice(pool, size=12, replace=False)
        latest = max(dt.date.fromisoformat(r["purchase_date"]) for r in batch)
        day = min(latest + dt.timedelta(days=int(rng.randint(1, 45))),
                  w.profile.end - dt.timedelta(days=1))
        iso = dt.datetime.combine(day, dt.time(20, 0)).isoformat()
        for row in batch:
            prev = row["status"]
            row["status"] = "DAMAGED"
            row["updated_at"] = iso
            w.add("inventory_movements", {
                "id": rng.uuid(), "store_id": w.store_id,
                "inventory_item_id": row["id"],
                "movement_type": "DAMAGE_WRITE_OFF",
                "from_status": prev, "to_status": "DAMAGED",
                "reference_type": "MANUAL_ADJUSTMENT", "reference_id": rng.uuid(),
                "performed_by": w.owner_id, "performed_at": iso,
                "notes": "Annual stocktake write-off, approved by owner",
            })
        _log(w, "LEGIT_STOCKTAKE_WRITEOFF", "movement_window", day.isoformat(),
             "Scheduled annual stocktake write-off, approved and documented",
             positive=0, aggregate=1, severity="low",
             start=day.isoformat(), end=day.isoformat())

    # A genuine early-morning bulk order for a wholesale customer.
    big = sorted(invoices, key=lambda r: -r["grand_total"])[:40]
    if big:
        inv = big[int(rng.randint(0, len(big) - 1))]
        stamp = f"{inv['created_at'][:10]}T06:40:00"
        inv["created_at"] = inv["updated_at"] = stamp
        inv["notes"] = "Pre-opening wholesale pickup, arranged with owner"
        _log(w, "LEGIT_WHOLESALE_BULK_ORDER", "invoice", inv["id"],
             "Large pre-opening order agreed with the owner in advance",
             positive=0, severity="low")
