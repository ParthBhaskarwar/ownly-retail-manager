"""
Schema constants mirrored from the Ownly backend.

Every value here is a transcription of something that exists in the TypeScript
source. `tests/test_schema_constants.py` parses those files and asserts this
module has not drifted from them — if a migration widens an enum, that test
fails rather than the generator silently emitting rows Postgres will reject.

Sources:
  Backend/src/db/migrations/001_initial_schema.ts
  Backend/src/db/migrations/002_billing_returns_schema.ts
  Backend/src/db/migrations/004_inventory_status_alignment.ts
  Backend/src/db/seeds/001_clothing_template.ts
  Backend/src/services/inventory.service.ts   (barcode format)
"""

from __future__ import annotations

import re

# ─── Retail template ──────────────────────────────────────────────────────────

CLOTHING_TEMPLATE_ID = "tpl_clothing"
RETAIL_TYPE = "CLOTHING_FASHION"
CURRENCY = "INR"

# ─── Enums ────────────────────────────────────────────────────────────────────
# 001_initial_schema.ts
ROLES = [
    "OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF", "ACCOUNTANT", "VIEWER",
]
ATTRIBUTE_DATA_TYPES = ["TEXT", "NUMBER", "BOOLEAN", "ENUM"]
PRODUCT_STATUSES = ["ACTIVE", "INACTIVE", "DISCONTINUED"]

# 004_inventory_status_alignment.ts — the widened sets (11 and 12 values)
INVENTORY_STATUSES = [
    "IN_STOCK", "RESERVED", "SOLD", "RETURNED_TO_STOCK", "RETURNED_DAMAGED",
    "DAMAGED", "LOST", "TRANSFERRED_OUT", "EXCHANGED", "DEFECTIVE",
    "SUPPLIER_RETURN",
]
MOVEMENT_TYPES = [
    "PURCHASE", "SALE", "RETURN_TO_STOCK", "RETURN_DAMAGED", "DAMAGE_WRITE_OFF",
    "LOSS_WRITE_OFF", "TRANSFER_OUT", "TRANSFER_IN", "MANUAL_ADJUSTMENT",
    "EXCHANGE", "DEFECT_WRITE_OFF", "SUPPLIER_RETURN",
]
# Statuses that count as physically sellable stock (domain.ts IN_STOCK_STATUSES)
IN_STOCK_STATUSES = ["IN_STOCK", "RETURNED_TO_STOCK"]

# 002_billing_returns_schema.ts
INVOICE_STATUSES = [
    "COMPLETED", "PARTIALLY_RETURNED", "FULLY_RETURNED", "EXCHANGED", "CANCELLED",
]
INVOICE_ITEM_STATUSES = ["ACTIVE", "RETURNED", "EXCHANGED"]
DISCOUNT_TYPES = ["PERCENTAGE", "FIXED"]
PAYMENT_METHODS = ["CASH", "UPI", "CARD", "CREDIT_NOTE"]
PAYMENT_STATUSES = ["COMPLETED", "REFUNDED"]
REFUND_METHODS = ["CASH", "UPI", "CARD", "CREDIT_NOTE", "EXCHANGE"]
RETURN_CONDITIONS = ["RESELLABLE", "DAMAGED", "DEFECTIVE", "OPENED_USED", "OTHER"]
INVENTORY_ACTIONS = ["RETURN_TO_STOCK", "RETURN_DAMAGED"]
EXCHANGE_PAYMENT_STATUSES = [
    "BALANCED", "CUSTOMER_PAID", "REFUND_ISSUED", "CREDIT_NOTE_ISSUED",
]
CREDIT_NOTE_STATUSES = ["ACTIVE", "REDEEMED", "EXPIRED"]

# Movement reference types (domain.ts MovementReferenceType, plus the two the
# Week-4 routers actually emit, which are outside that union — see README).
MOVEMENT_REFERENCE_TYPES = [
    "INVOICE", "RETURN_TRANSACTION", "MANUAL_ADJUSTMENT", "PURCHASE_ENTRY",
    "RETURN", "EXCHANGE",
]

# ─── Attribute definitions (seeds/001_clothing_template.ts) ───────────────────
# (name, data_type, is_required, is_variant_level, enum_values, display_order)
SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"]
PATTERNS = [
    "Solid", "Striped", "Checked", "Printed", "Embroidered", "Floral", "Abstract",
]
FITS = ["Slim Fit", "Regular Fit", "Relaxed Fit", "Oversized"]
SLEEVES = ["Sleeveless", "Short Sleeve", "3/4 Sleeve", "Full Sleeve"]
NECKS = [
    "Round Neck", "V-Neck", "Collared", "Turtle Neck", "Square Neck", "Boat Neck",
]

ATTRIBUTE_DEFINITIONS = [
    ("Size",     "ENUM", True,  True,  SIZES,    1),
    ("Colour",   "TEXT", False, False, None,     2),
    ("Material", "TEXT", False, False, None,     3),
    ("Pattern",  "ENUM", False, False, PATTERNS, 4),
    ("Brand",    "TEXT", False, False, None,     5),
    ("Fit",      "ENUM", False, False, FITS,     6),
    ("Sleeve",   "ENUM", False, False, SLEEVES,  7),
    ("Neck",     "ENUM", False, False, NECKS,    8),
]

# ─── Taxonomy: 8 categories, 55 subcategories ─────────────────────────────────
TAXONOMY: dict[str, list[str]] = {
    "Topwear": [
        "T-Shirts", "Shirts", "Sweatshirts & Hoodies", "Jackets", "Blazers",
        "Kurtas & Kurtis", "Blouses", "Crop Tops", "Sweaters", "Vests & Waistcoats",
    ],
    "Bottomwear": [
        "Jeans", "Trousers", "Shorts", "Skirts", "Leggings", "Palazzos",
        "Track Pants", "Salwar & Churidars",
    ],
    "Ethnic Wear": [
        "Sarees", "Salwar Suits", "Lehengas", "Sherwanis", "Kurta Sets",
        "Dupattas", "Ethnic Jackets",
    ],
    "Dresses & Jumpsuits": [
        "Casual Dresses", "Formal Dresses", "Party Dresses", "Jumpsuits",
        "Rompers", "Co-ord Sets",
    ],
    "Activewear": [
        "Sports T-Shirts", "Track Pants", "Yoga Wear", "Sports Shorts",
        "Cycling Wear", "Sports Bras",
    ],
    "Innerwear & Sleepwear": [
        "Innerwear", "Bras", "Briefs & Trunks", "Sleepwear", "Loungewear",
        "Thermals",
    ],
    "Winter Wear": [
        "Overcoats", "Leather Jackets", "Puffer Jackets", "Shawls & Wraps",
        "Mufflers & Scarves",
    ],
    "Accessories": [
        "Belts", "Ties & Bow Ties", "Handkerchiefs", "Pocket Squares", "Socks",
        "Caps & Hats", "Scarves",
    ],
}
CATEGORIES = list(TAXONOMY.keys())
N_SUBCATEGORIES = sum(len(v) for v in TAXONOMY.values())  # 55

# ─── Barcode ──────────────────────────────────────────────────────────────────
# inventory.service.ts:67
#   `${deriveStoreCode(storeId)}-${skuPart}-${String(seq).padStart(5,'0')}`
# where skuPart = sku stripped to [A-Z0-9], first 8 chars, uppercased,
# and deriveStoreCode = storeId with '-' removed, first 6 chars, uppercased.
BARCODE_RE = re.compile(r"^[A-Z0-9]{6}-[A-Z0-9]{1,8}-\d{5}$")


def derive_store_code(store_id: str) -> str:
    """Port of deriveStoreCode (inventory.service.ts:63)."""
    return store_id.replace("-", "")[:6].upper()


def make_barcode(store_code: str, variant_sku: str, sequence: int) -> str:
    """Port of generateBarcode (inventory.service.ts:67).

    Uniqueness depends only on `sequence`, which is store-scoped. The store and
    SKU segments are cosmetic — that is the fix for defect D2, where two sibling
    variants whose SKUs truncated identically were issued the same barcode.
    """
    sku_part = re.sub(r"[^A-Z0-9]", "", variant_sku.upper())[:8]
    return f"{store_code}-{sku_part}-{sequence:05d}"


# ─── GST slabs ────────────────────────────────────────────────────────────────
# One consistent regime, so an off-slab tax amount is a detectable anomaly.
GST_LOW_RATE = 0.05          # MRP <= 1000
GST_HIGH_RATE = 0.12         # MRP  > 1000
GST_THRESHOLD = 1000.0


def gst_rate_for(mrp: float) -> float:
    return GST_LOW_RATE if mrp <= GST_THRESHOLD else GST_HIGH_RATE
