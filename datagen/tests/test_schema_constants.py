"""
Guards against drift between constants.py and the TypeScript schema.

The generator writes CSVs shaped for a Postgres schema defined in another
language, in another directory, maintained by other people. If a migration
widens an enum or the seed adds a subcategory, nothing would fail at generation
time -- the mismatch would surface as a rejected \\copy weeks later, or worse,
as rows that load but mean the wrong thing.

These tests parse the actual .ts files and assert the Python mirror still
matches. They are skipped (not failed) if the backend is not on disk, so the
datagen package stays usable on its own.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from datagen import constants as C

BACKEND = Path(__file__).resolve().parents[2] / "Backend" / "src" / "db"
MIGRATIONS = BACKEND / "migrations"
SEEDS = BACKEND / "seeds"

pytestmark = pytest.mark.skipif(
    not MIGRATIONS.exists(), reason="Backend/src/db not present")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _string_list(text: str, start: int) -> list[str]:
    """Pull the string literals out of the array literal starting at `start`."""
    depth, end = 0, start
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                end = i
                break
    return re.findall(r"'([^']*)'", text[start:end + 1])


def _array_after(text: str, marker: str) -> list[str]:
    """Resolve a `const X = [...]` array, following one level of spread.

    Migration 004 widens each enum as `[...X_BEFORE, 'NEW', ...]`, so reading
    only the literals would return just the additions.
    """
    idx = text.index(f"const {marker}")
    start = text.index("[", idx)
    body = text[start:start + text[start:].index("]") + 1]

    values: list[str] = []
    spread = re.search(r"\.\.\.(\w+)", body)
    if spread:
        values.extend(_array_after(text, spread.group(1)))
    values.extend(re.findall(r"'([^']*)'", body))
    return values


def test_inventory_statuses_match_migration_004():
    text = _read(MIGRATIONS / "004_inventory_status_alignment.ts")
    assert _array_after(text, "ITEM_STATUSES_AFTER") == C.INVENTORY_STATUSES


def test_movement_types_match_migration_004():
    text = _read(MIGRATIONS / "004_inventory_status_alignment.ts")
    assert _array_after(text, "MOVEMENT_TYPES_AFTER") == C.MOVEMENT_TYPES


@pytest.mark.parametrize("column,expected", [
    ("discount_type", C.DISCOUNT_TYPES),
    ("payment_method", C.PAYMENT_METHODS),
    ("refund_method", C.REFUND_METHODS),
    ("condition", C.RETURN_CONDITIONS),
    ("inventory_action", C.INVENTORY_ACTIONS),
])
def test_billing_enums_match_migration(column, expected):
    text = _read(MIGRATIONS / "002_billing_returns_schema.ts")
    match = re.search(rf"t\.enu\('{column}',\s*(\[[^\]]*\])", text)
    assert match, f"{column} not found in the billing migration"
    assert re.findall(r"'([^']*)'", match.group(1)) == expected


def test_roles_match_initial_schema():
    text = _read(MIGRATIONS / "001_initial_schema.ts")
    match = re.search(r"t\.enu\('role',\s*(\[[^\]]*\])", text, re.S)
    assert re.findall(r"'([^']*)'", match.group(1)) == C.ROLES


def test_taxonomy_matches_seed():
    """8 categories and 55 subcategories, with the exact names."""
    text = _read(SEEDS / "001_clothing_template.ts")
    for category, subs in C.TAXONOMY.items():
        assert f"'{category}'" in text, f"category {category!r} missing from seed"
        for sub in subs:
            assert f"'{sub}'" in text, f"subcategory {sub!r} missing from seed"
    assert C.N_SUBCATEGORIES == 55


def test_size_values_match_seed():
    text = _read(SEEDS / "001_clothing_template.ts")
    idx = text.index("Size")
    assert _string_list(text, text.index("[", idx)) == C.SIZES


def test_template_id_matches_seed():
    text = _read(SEEDS / "001_clothing_template.ts")
    assert f"'{C.CLOTHING_TEMPLATE_ID}'" in text


def test_barcode_format_matches_service():
    """Barcode shape, and that uniqueness rides on the sequence alone.

    Defect D2 in the app was two sibling variants whose SKUs truncated to the
    same 8 characters receiving the same barcode. The sequence is store-scoped
    for exactly that reason, so the SKU segment must stay cosmetic here too.
    """
    service = (BACKEND.parent / "services" / "inventory.service.ts")
    if service.exists():
        text = _read(service)
        assert "padStart(5, '0')" in text
        assert "slice(0, 8)" in text

    a = C.make_barcode("ABC123", "BLUDENJA-M", 1)
    b = C.make_barcode("ABC123", "BLUDENJA-L", 2)
    assert a == "ABC123-BLUDENJA-00001"
    assert a != b, "sibling variants must not collide"
    assert C.BARCODE_RE.match(a) and C.BARCODE_RE.match(b)
