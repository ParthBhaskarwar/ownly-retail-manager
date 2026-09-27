"""
Step 4 — shrinkage: lost, damaged, defective and supplier-return units.

Runs after the simulation and only touches units that never sold, so it can
never contradict a sale that already happened. Write-off dates are drawn inside
each unit's shelf life, which keeps the movement chain monotonic.

Rates are expressed as a share of *units purchased* rather than an annual rate
on average inventory. Annual-rate-on-inventory is the textbook definition but
is ambiguous here, and the share of units is what the resulting counts are
actually judged against.

This step is also what populates DEFECTIVE and SUPPLIER_RETURN, two of the
three statuses the spec requires that the original schema was missing.
"""

from __future__ import annotations

import datetime as dt

from ..config import params as P
from ..world import World


def _supplier_of(w: World, product_id: str):
    product = next(p for p in w.products if p.id == product_id)
    return next(s for s in w.suppliers if s.id == product.supplier_id)


def run(w: World) -> None:
    rng = w.rng
    st = w._sim_state

    unsold = [it for it in w.items.values() if it.status == "IN_STOCK"]
    if not unsold:
        return

    purchased = len(w.items)
    plan = [
        ("LOST", "LOSS_WRITE_OFF", int(purchased * P.SHRINKAGE_LOST_SHARE)),
        ("DAMAGED", "DAMAGE_WRITE_OFF", int(purchased * P.SHRINKAGE_DAMAGED_SHARE)),
        ("DEFECTIVE", "DEFECT_WRITE_OFF", int(purchased * P.SHRINKAGE_DEFECT_SHARE)),
    ]
    total_needed = sum(n for _, _, n in plan)
    pool = list(rng.choice(unsold, size=min(total_needed, len(unsold)),
                           replace=False)) if total_needed else []

    cursor = 0
    defective: list = []
    for status, movement, count in plan:
        chunk = pool[cursor:cursor + count]
        cursor += count
        for item in chunk:
            # Defect risk tracks the supplier that shipped the unit, so the
            # supplier score has something real to pick up.
            if status == "DEFECTIVE":
                supplier = _supplier_of(w, item.product_id)
                if not rng.chance(min(0.25 + supplier.defect_rate * 6, 0.95)):
                    continue
            written = _write_off(w, st, item, status, movement)
            if status == "DEFECTIVE" and written is not None:
                defective.append((item, written))

    # A share of defective stock goes back to the supplier rather than being
    # scrapped -- this is the only thing that populates SUPPLIER_RETURN.
    for item, defect_day in defective:
        if rng.chance(P.SUPPLIER_RETURN_SHARE):
            _write_off(w, st, item, "SUPPLIER_RETURN", "SUPPLIER_RETURN",
                       from_status="DEFECTIVE", not_before=defect_day)


def _write_off(w: World, st, item, status: str, movement: str,
               from_status: str | None = None,
               not_before: dt.date | None = None) -> dt.date | None:
    rng = w.rng
    earliest = item.purchase_date + dt.timedelta(days=7)
    if not_before is not None:
        earliest = max(earliest, not_before + dt.timedelta(days=1))
    if earliest >= w.profile.end:
        return None
    span = (w.profile.end - earliest).days
    day = earliest + dt.timedelta(days=int(rng.randint(0, max(span, 0))))
    iso = dt.datetime.combine(day, dt.time(17, 0)).isoformat()

    prev = from_status or item.status
    item.status = status
    row = w.by_id["inventory_items"].get(item.id)
    if row is not None:
        row["status"] = status
        row["updated_at"] = iso

    # Remove it from sellable stock so nothing sells a written-off unit later.
    bucket = st.on_hand.get(item.variant_id)
    if bucket and item in bucket:
        bucket.remove(item)

    w.add("inventory_movements", {
        "id": rng.uuid(), "store_id": w.store_id, "inventory_item_id": item.id,
        "movement_type": movement,
        "from_status": prev, "to_status": status,
        "reference_type": "MANUAL_ADJUSTMENT", "reference_id": rng.uuid(),
        "performed_by": w.owner_id, "performed_at": iso,
        "notes": {
            "LOST": "Stock count shortfall",
            "DAMAGED": "Damaged in store",
            "DEFECTIVE": "Manufacturing defect found on inspection",
            "SUPPLIER_RETURN": "Returned to supplier as defective",
        }[status],
    })
    return day
