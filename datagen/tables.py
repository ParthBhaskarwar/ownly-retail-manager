"""
CSV column orders, load order and the foreign-key map.

Column order is column-for-column against the live Postgres schema so that

    \\copy <table> FROM 'x.csv' WITH (FORMAT csv, HEADER true, NULL '')

works without a column list. Load order respects referential integrity.
"""

from __future__ import annotations

COLUMNS: dict[str, list[str]] = {
    "users": [
        "id", "store_id", "name", "email", "phone", "password_hash", "role",
        "is_active", "verified_at", "last_login_at", "created_at", "updated_at",
        "verification_code",
    ],
    "stores": [
        "id", "owner_id", "name", "address", "phone", "gst_number", "currency",
        "tax_settings", "invoice_settings", "logo_url", "retail_type",
        "setup_completed", "created_at", "updated_at",
    ],
    "suppliers": [
        "id", "store_id", "name", "code", "gstin", "address", "payment_terms",
        "notes", "is_active", "created_at", "updated_at",
    ],
    "categories": [
        "id", "retail_template_id", "store_id", "name", "is_system", "is_active",
        "sort_order", "created_at",
    ],
    "subcategories": [
        "id", "category_id", "store_id", "name", "is_system", "is_active",
        "sort_order", "created_at",
    ],
    "attribute_definitions": [
        "id", "retail_template_id", "name", "data_type", "is_required",
        "is_variant_level", "enum_values", "display_order", "is_active",
        "created_at",
    ],
    "products": [
        "id", "store_id", "retail_template_id", "category_id", "subcategory_id",
        "supplier_id", "name", "base_sku", "description", "base_selling_price",
        "base_cost_price", "status", "image_urls", "created_by", "updated_by",
        "created_at", "updated_at",
    ],
    "product_attribute_values": [
        "id", "product_id", "attribute_definition_id", "value",
    ],
    "product_variants": [
        "id", "product_id", "sku", "display_name", "selling_price_override",
        "cost_price_override", "is_active", "sort_order", "created_at",
        "updated_at",
    ],
    "variant_attribute_values": [
        "id", "variant_id", "attribute_definition_id", "value",
    ],
    "inventory_items": [
        "id", "store_id", "variant_id", "barcode", "purchase_cost_price",
        "purchase_date", "status", "created_by", "created_at", "updated_at",
    ],
    "inventory_movements": [
        "id", "store_id", "inventory_item_id", "movement_type", "from_status",
        "to_status", "reference_type", "reference_id", "performed_by",
        "performed_at", "notes",
    ],
    "customers": [
        "id", "store_id", "name", "phone", "email", "total_purchases",
        "created_at", "updated_at",
    ],
    "invoices": [
        "id", "store_id", "invoice_number", "customer_id", "customer_name",
        "customer_phone", "cashier_id", "subtotal", "discount_type",
        "discount_value", "discount_amount", "discount_applied_by", "tax_amount",
        "grand_total", "amount_paid", "change_given", "status", "notes",
        "created_at", "updated_at",
    ],
    "invoice_items": [
        "id", "invoice_id", "product_id", "variant_id", "inventory_item_id",
        "barcode", "product_name", "variant_name", "quantity", "unit_price",
        "discount_amount", "final_price", "status", "created_at",
    ],
    "payments": [
        "id", "invoice_id", "payment_method", "amount", "transaction_reference",
        "status", "created_at",
    ],
    "returns": [
        "id", "return_number", "store_id", "original_invoice_id", "customer_id",
        "processed_by", "total_refund_amount", "refund_method", "notes",
        "created_at",
    ],
    "return_items": [
        "id", "return_id", "original_invoice_item_id", "inventory_item_id",
        "condition", "reason", "refund_amount", "inventory_action", "created_at",
    ],
    "exchanges": [
        "id", "exchange_number", "store_id", "original_invoice_id", "return_id",
        "replacement_invoice_id", "processed_by", "returned_value",
        "replacement_value", "difference_amount", "payment_status", "created_at",
    ],
    "credit_notes": [
        "id", "credit_note_number", "store_id", "original_invoice_id",
        "return_id", "customer_id", "original_amount", "remaining_amount",
        "status", "expiry_date", "created_at",
    ],
}

# Order for \copy. users before stores (users.store_id is filled in the CSV
# already, so a real load needs the FK deferred or users loaded with NULL
# store_id first — documented in the README).
LOAD_ORDER = [
    "users", "stores", "suppliers", "categories", "subcategories",
    "attribute_definitions", "products", "product_attribute_values",
    "product_variants", "variant_attribute_values", "inventory_items",
    "inventory_movements", "customers", "invoices", "invoice_items", "payments",
    "returns", "return_items", "credit_notes", "exchanges",
]

# (child_table, child_column) -> (parent_table, parent_column).
# Nullable columns are allowed to be empty; checks/integrity.py skips blanks.
FOREIGN_KEYS: list[tuple[str, str, str, str]] = [
    ("users", "store_id", "stores", "id"),
    ("stores", "owner_id", "users", "id"),
    ("suppliers", "store_id", "stores", "id"),
    ("subcategories", "category_id", "categories", "id"),
    ("products", "store_id", "stores", "id"),
    ("products", "category_id", "categories", "id"),
    ("products", "subcategory_id", "subcategories", "id"),
    ("products", "supplier_id", "suppliers", "id"),
    ("products", "created_by", "users", "id"),
    ("products", "updated_by", "users", "id"),
    ("product_attribute_values", "product_id", "products", "id"),
    ("product_attribute_values", "attribute_definition_id",
     "attribute_definitions", "id"),
    ("product_variants", "product_id", "products", "id"),
    ("variant_attribute_values", "variant_id", "product_variants", "id"),
    ("variant_attribute_values", "attribute_definition_id",
     "attribute_definitions", "id"),
    ("inventory_items", "store_id", "stores", "id"),
    ("inventory_items", "variant_id", "product_variants", "id"),
    ("inventory_items", "created_by", "users", "id"),
    ("inventory_movements", "store_id", "stores", "id"),
    ("inventory_movements", "inventory_item_id", "inventory_items", "id"),
    ("inventory_movements", "performed_by", "users", "id"),
    ("customers", "store_id", "stores", "id"),
    ("invoices", "store_id", "stores", "id"),
    ("invoices", "customer_id", "customers", "id"),
    ("invoices", "cashier_id", "users", "id"),
    ("invoices", "discount_applied_by", "users", "id"),
    ("invoice_items", "invoice_id", "invoices", "id"),
    ("invoice_items", "product_id", "products", "id"),
    ("invoice_items", "variant_id", "product_variants", "id"),
    ("invoice_items", "inventory_item_id", "inventory_items", "id"),
    ("payments", "invoice_id", "invoices", "id"),
    ("returns", "store_id", "stores", "id"),
    ("returns", "original_invoice_id", "invoices", "id"),
    ("returns", "customer_id", "customers", "id"),
    ("returns", "processed_by", "users", "id"),
    ("return_items", "return_id", "returns", "id"),
    ("return_items", "original_invoice_item_id", "invoice_items", "id"),
    ("return_items", "inventory_item_id", "inventory_items", "id"),
    ("exchanges", "store_id", "stores", "id"),
    ("exchanges", "original_invoice_id", "invoices", "id"),
    ("exchanges", "return_id", "returns", "id"),
    ("exchanges", "replacement_invoice_id", "invoices", "id"),
    ("exchanges", "processed_by", "users", "id"),
    ("credit_notes", "store_id", "stores", "id"),
    ("credit_notes", "original_invoice_id", "invoices", "id"),
    ("credit_notes", "return_id", "returns", "id"),
    ("credit_notes", "customer_id", "customers", "id"),
]

# (table, column) -> allowed values. Asserted by checks/integrity.py.
from . import constants as C  # noqa: E402

ENUM_COLUMNS: dict[tuple[str, str], list[str]] = {
    ("users", "role"): C.ROLES,
    ("attribute_definitions", "data_type"): C.ATTRIBUTE_DATA_TYPES,
    ("products", "status"): C.PRODUCT_STATUSES,
    ("inventory_items", "status"): C.INVENTORY_STATUSES,
    ("inventory_movements", "movement_type"): C.MOVEMENT_TYPES,
    ("invoices", "status"): C.INVOICE_STATUSES,
    ("invoices", "discount_type"): C.DISCOUNT_TYPES,
    ("invoice_items", "status"): C.INVOICE_ITEM_STATUSES,
    ("payments", "payment_method"): C.PAYMENT_METHODS,
    ("payments", "status"): C.PAYMENT_STATUSES,
    ("returns", "refund_method"): C.REFUND_METHODS,
    ("return_items", "condition"): C.RETURN_CONDITIONS,
    ("return_items", "inventory_action"): C.INVENTORY_ACTIONS,
    ("exchanges", "payment_status"): C.EXCHANGE_PAYMENT_STATUSES,
    ("credit_notes", "status"): C.CREDIT_NOTE_STATUSES,
}
