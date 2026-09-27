"""
Step 1 — store, staff, suppliers and the reference taxonomy.

The taxonomy rows (categories, subcategories, attribute_definitions) mirror
what seeds/001_clothing_template.ts already puts in the database with
store_id = NULL. They are emitted so the CSV set is self-contained and can be
loaded into an empty schema; when loading into a database that already ran the
seed, skip those three files.
"""

from __future__ import annotations

import datetime as dt
import json

from .. import constants as C
from ..config import params as P
from ..config import vocab as V
from ..world import Supplier, World


def _ts(day: dt.date, hour: int = 9) -> str:
    return dt.datetime.combine(day, dt.time(hour, 0)).isoformat()


def run(w: World) -> None:
    rng = w.rng
    start = w.profile.start
    created = _ts(start - dt.timedelta(days=7))

    # ── owner + staff ────────────────────────────────────────────────────────
    w.store_id = rng.uuid()
    w.store_code = C.derive_store_code(w.store_id)
    w.owner_id = rng.uuid()

    staff_defs = V.STAFF_NAMES[: 1 + P.N_STAFF]
    for i, (name, role) in enumerate(staff_defs):
        uid = w.owner_id if role == "OWNER" else rng.uuid()
        slug = name.lower().replace(" ", ".")
        w.add("users", {
            "id": uid,
            "store_id": w.store_id,
            "name": name,
            "email": f"{slug}@vastrabazaar.demo",
            "phone": f"9{rng.randint(100000000, 999999999)}",
            # Placeholder, not a usable credential: synthetic rows must never
            # carry a hash that could authenticate against the real app.
            "password_hash": "$2a$10$syntheticdemodatanotarealpasswordhash00000000000000",
            "role": role,
            "is_active": True,
            "verified_at": created,
            "last_login_at": _ts(w.profile.end),
            "created_at": created,
            "updated_at": created,
            "verification_code": None,
        })
        w.staff.append({"id": uid, "name": name, "role": role})
        if role in ("OWNER", "MANAGER", "CASHIER"):
            w.cashier_ids.append(uid)

    w.add("stores", {
        "id": w.store_id,
        "owner_id": w.owner_id,
        "name": V.STORE_NAME,
        "address": f"Shop 14, MG Road, {V.STORE_CITY} 411001",
        "phone": f"9{rng.randint(100000000, 999999999)}",
        "gst_number": "27AABCU9603R1ZX",
        "currency": C.CURRENCY,
        "tax_settings": json.dumps({
            "mode": "GST_SLAB",
            "slabs": [{"upto": C.GST_THRESHOLD, "rate": C.GST_LOW_RATE},
                      {"upto": None, "rate": C.GST_HIGH_RATE}],
        }),
        "invoice_settings": json.dumps({"prefix": "INV", "footer": "Thank you!"}),
        "logo_url": None,
        "retail_type": C.RETAIL_TYPE,
        "setup_completed": True,
        "created_at": created,
        "updated_at": created,
    })

    # ── taxonomy ─────────────────────────────────────────────────────────────
    for ci, (cat, subs) in enumerate(C.TAXONOMY.items()):
        cid = rng.uuid()
        w.category_ids[cat] = cid
        w.add("categories", {
            "id": cid,
            "retail_template_id": C.CLOTHING_TEMPLATE_ID,
            "store_id": None,
            "name": cat,
            "is_system": True,
            "is_active": True,
            "sort_order": ci,
            "created_at": created,
        })
        for si, sub in enumerate(subs):
            sid = rng.uuid()
            w.subcategory_ids[(cat, sub)] = sid
            w.add("subcategories", {
                "id": sid,
                "category_id": cid,
                "store_id": None,
                "name": sub,
                "is_system": True,
                "is_active": True,
                "sort_order": si,
                "created_at": created,
            })

    for name, dtype, required, variant_level, enum_values, order in \
            C.ATTRIBUTE_DEFINITIONS:
        aid = rng.uuid()
        w.attribute_ids[name] = aid
        w.add("attribute_definitions", {
            "id": aid,
            "retail_template_id": C.CLOTHING_TEMPLATE_ID,
            "name": name,
            "data_type": dtype,
            "is_required": required,
            "is_variant_level": variant_level,
            "enum_values": json.dumps(enum_values) if enum_values else None,
            "display_order": order,
            "is_active": True,
            "created_at": created,
        })

    # ── suppliers ────────────────────────────────────────────────────────────
    # Differentiated on non-collinear axes. If cost, speed, defects and
    # sell-through all move together the supplier score collapses to one
    # dimension and the feature is trivial.
    n = min(w.profile.n_suppliers, len(V.SUPPLIER_NAMES))
    archetypes = [
        # (quality, defect, lead_time, price_tier, degrades)
        (0.35, 0.055, P.SUPPLIER_LEAD_TIME, 0.86, False),   # A cheap, poor
        (0.90, 0.006, P.SUPPLIER_LEAD_TIME, 1.18, False),   # B premium
        (0.75, 0.010, P.UNRELIABLE_SUPPLIER_LEAD_TIME, 1.00, False),  # C slow
        (0.80, 0.012, P.SUPPLIER_LEAD_TIME, 1.05, True),    # D degrades
    ]
    cats = C.CATEGORIES
    for i in range(n):
        if i < len(archetypes):
            quality, defect, lead, tier, degrades = archetypes[i]
        else:
            quality = float(rng.uniform(0.4, 0.9))
            defect = float(rng.uniform(*P.SUPPLIER_DEFECT_BASE))
            lead = P.SUPPLIER_LEAD_TIME
            tier = float(rng.uniform(0.90, 1.12))
            degrades = False

        # Every supplier covers >= 2 categories and every category has >= 2
        # suppliers, so supplier_id cannot memorise the category or the label.
        assigned = rng.choice(cats, size=int(rng.randint(2, 4)), replace=False)

        w.suppliers.append(Supplier(
            id=rng.uuid(),
            name=V.SUPPLIER_NAMES[i],
            code=f"SUP{i + 1:03d}",
            quality=quality,
            defect_rate=defect,
            lead_time=lead,
            short_ship_rate=(P.UNRELIABLE_SHORT_SHIP_RATE
                             if lead is P.UNRELIABLE_SUPPLIER_LEAD_TIME else 0.02),
            price_tier=tier,
            degrades=degrades,
            categories=list(assigned),
        ))

    for s in w.suppliers:
        w.add("suppliers", {
            "id": s.id,
            "store_id": w.store_id,
            "name": s.name,
            "code": s.code,
            "gstin": f"27{rng.randint(10000, 99999)}{s.code}1ZP",
            "address": f"{V.STORE_CITY}, Maharashtra",
            "payment_terms": rng.choice(["Net 15", "Net 30", "Net 45", "Advance"]),
            "notes": None,
            "is_active": True,
            "created_at": created,
            "updated_at": created,
        })

    # ── closed days ──────────────────────────────────────────────────────────
    # Structural zeros. A naive velocity of units/calendar-day is wrong when the
    # shop was shut, which is what the in-stock-open-day exposure offset fixes.
    per_year = int(rng.randint(*P.CLOSED_DAYS_PER_YEAR))
    n_closed = max(1, int(per_year * w.profile.n_days / 365))
    w.closed_days = set(rng.choice(w.days, size=n_closed, replace=False))
