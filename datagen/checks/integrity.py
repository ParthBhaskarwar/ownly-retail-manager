"""
Integrity assertions over the generated rows.

These are the invariants a real Postgres schema would enforce plus the ones it
cannot -- a unit appearing on two invoices, a sale dated before its purchase,
a broken movement chain. Every failure here is a generator bug.

Injected anomalies deliberately violate several of these, so each check skips
the entities the anomaly ledger claims responsibility for. That coupling is the
point: an anomaly that is not exempted here is one the integrity layer would
catch for free, which tells you it belongs in a validation rule rather than in
a model.
"""

from __future__ import annotations

import datetime as dt
import re
from collections import Counter, defaultdict

from .. import constants as C
from ..tables import ENUM_COLUMNS, FOREIGN_KEYS


def _exempt(w, *kinds: str) -> set[str]:
    return {row["entity_id"] for row in w.truth["anomaly_labels"]
            if row["anomaly_type"] in kinds and row["is_positive"] == 1}


def run(w) -> list[str]:
    R = w.rows
    fail: list[str] = []

    def check(ok: bool, message: str) -> None:
        if not ok:
            fail.append(message)

    items = R["inventory_items"]

    # ── barcodes ─────────────────────────────────────────────────────────────
    barcodes = [r["barcode"] for r in items]
    dupes = [b for b, n in Counter(barcodes).items() if n > 1]
    check(not dupes, f"duplicate barcodes: {len(dupes)} (e.g. {dupes[:3]})")
    check(len(barcodes) == len(items), "barcode count != inventory item count")
    bad = [b for b in barcodes if not C.BARCODE_RE.match(b)]
    check(not bad, f"malformed barcodes: {len(bad)} (e.g. {bad[:3]})")

    # ── one unit, one sale ───────────────────────────────────────────────────
    # A unit may legitimately sell more than once if it was returned to stock
    # in between. What must never happen is two sales with no return between.
    dup_inv = _exempt(w, "BILL_DUPLICATE_INVOICE")
    lines = [l for l in R["invoice_items"] if l["invoice_id"] not in dup_inv]
    used = Counter(l["inventory_item_id"] for l in lines)
    returned_back = Counter(
        r["inventory_item_id"] for r in R["return_items"]
        if r["inventory_action"] == "RETURN_TO_STOCK")
    twice = [i for i, n in used.items() if n > returned_back.get(i, 0) + 1]
    check(not twice, f"units sold twice with no return in between: {len(twice)}")

    item_ids = {r["id"] for r in items}
    orphan = [l["id"] for l in R["invoice_items"]
              if l["inventory_item_id"] not in item_ids]
    check(not orphan, f"invoice lines pointing at unknown units: {len(orphan)}")

    # ── no sale before the unit was received ─────────────────────────────────
    early_ok = _exempt(w, "INV_SOLD_BEFORE_RECEIVED")
    purchase_on = {r["id"]: r["purchase_date"] for r in items}
    early = [l["id"] for l in R["invoice_items"]
             if l["inventory_item_id"] not in early_ok
             and l["created_at"][:10] < purchase_on.get(l["inventory_item_id"], "")]
    check(not early, f"units sold before their purchase_date: {len(early)}")

    # ── movement chain continuity ────────────────────────────────────────────
    broken_ok = _exempt(w, "INV_DOUBLE_SALE", "INV_RETURN_NO_SALE",
                        "INV_STATUS_INCONSISTENT", "INV_PHANTOM_STOCK")
    chains: dict[str, list[dict]] = defaultdict(list)
    for m in R["inventory_movements"]:
        chains[m["inventory_item_id"]].append(m)

    broken = 0
    for item_id, moves in chains.items():
        if item_id in broken_ok:
            continue
        moves = sorted(moves, key=lambda m: m["performed_at"])
        if any(m["id"] in broken_ok for m in moves):
            continue
        for prev, nxt in zip(moves, moves[1:]):
            if prev["to_status"] != nxt["from_status"]:
                broken += 1
                break
    check(broken == 0, f"units with a discontinuous movement chain: {broken}")

    first_bad = 0
    for item_id, moves in chains.items():
        if item_id in broken_ok or any(m["id"] in broken_ok for m in moves):
            continue
        if sorted(moves, key=lambda m: m["performed_at"])[0]["movement_type"]                 != "PURCHASE":
            first_bad += 1
    check(first_bad == 0, f"units whose first movement is not PURCHASE: {first_bad}")

    # ── invoice arithmetic ───────────────────────────────────────────────────
    money_ok = _exempt(w, "BILL_TOTAL_MISMATCH", "BILL_TAX_OFF_SLAB",
                       "BILL_DISCOUNT_MISMATCH", "BILL_EXCESS_DISCOUNT",
                       "BILL_CASHIER_DRIFT")
    pay_ok = _exempt(w, "BILL_PAYMENT_MISMATCH") | money_ok

    paid = defaultdict(float)
    for p in R["payments"]:
        paid[p["invoice_id"]] += p["amount"]

    bad_total = bad_pay = 0
    for inv in R["invoices"]:
        if inv["id"] in money_ok:
            continue
        expected = round(inv["subtotal"] - inv["discount_amount"]
                         + inv["tax_amount"], 2)
        if abs(expected - inv["grand_total"]) > 0.02:
            bad_total += 1
        if inv["id"] not in pay_ok and \
                paid[inv["id"]] + 0.02 < inv["grand_total"]:
            bad_pay += 1
    check(bad_total == 0,
          f"invoices where grand_total != subtotal - discount + tax: {bad_total}")
    check(bad_pay == 0, f"invoices underpaid by their payments: {bad_pay}")

    # ── returns, exchanges, credit notes ─────────────────────────────────────
    line_ids = {l["id"] for l in R["invoice_items"]}
    bad_ret = [r["id"] for r in R["return_items"]
               if r["original_invoice_item_id"] not in line_ids]
    check(not bad_ret, f"return lines pointing at unknown invoice lines: {len(bad_ret)}")

    return_ids = {r["id"] for r in R["returns"]}
    invoice_ids = {r["id"] for r in R["invoices"]}
    bad_exc = [e["id"] for e in R["exchanges"]
               if e["return_id"] not in return_ids
               or e["replacement_invoice_id"] not in invoice_ids]
    check(not bad_exc, f"exchanges missing a return or replacement invoice: {len(bad_exc)}")

    bad_cn = [c["id"] for c in R["credit_notes"]
              if c["remaining_amount"] > c["original_amount"] + 0.01]
    check(not bad_cn, f"credit notes with remaining > original: {len(bad_cn)}")

    # ── enums ────────────────────────────────────────────────────────────────
    for (table, column), allowed in ENUM_COLUMNS.items():
        seen = {r.get(column) for r in R[table]} - {None, ""}
        bad_vals = seen - set(allowed)
        check(not bad_vals, f"{table}.{column} has values outside the schema enum: {bad_vals}")

    # ── foreign keys ─────────────────────────────────────────────────────────
    index = {t: {r["id"] for r in R[t]} for t in R if R[t] and "id" in R[t][0]}
    for child, col, parent, _ in FOREIGN_KEYS:
        parent_ids = index.get(parent, set())
        if not parent_ids:
            continue
        missing = sum(1 for r in R[child]
                      if r.get(col) not in (None, "") and r[col] not in parent_ids)
        check(missing == 0, f"{child}.{col} -> {parent}: {missing} broken references")

    return fail


def summarise(w) -> str:
    failures = run(w)
    if not failures:
        return "integrity: all checks passed"
    return "integrity FAILED:\n  - " + "\n  - ".join(failures)
