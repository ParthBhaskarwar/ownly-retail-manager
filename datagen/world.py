"""
Shared mutable state passed between generation steps.

`rows` holds one list of plain dicts per database table, written out verbatim
by export/csv_writer.py. Everything else on World is scaffolding the steps need
but which never reaches the database: product metadata, latent parameters,
per-day demand series, and the anomaly ledger.

The separation matters. `truth` is the evaluation key — latents, uncensored
demand, injected anomalies. It must never be joined into a feature table, and
keeping it on a different attribute than `rows` makes that mistake visible in
code review.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

from .config.profiles import Profile
from .rng import Rng
from .tables import COLUMNS


@dataclass
class Supplier:
    id: str
    name: str
    code: str
    quality: float           # 0 = worst, 1 = best; drives defects and returns
    defect_rate: float
    lead_time: tuple[int, int]
    short_ship_rate: float
    price_tier: float
    degrades: bool = False   # supplier D: 3x defects from month 14
    categories: list[str] = field(default_factory=list)


@dataclass
class Product:
    id: str
    name: str
    base_sku: str
    category: str
    subcategory: str
    supplier_id: str
    brand: str
    brand_tier: int
    colour: str
    colour_family: str
    material: str
    pattern: str
    fit: str
    sleeve: str
    neck: str
    mrp: float
    unit_cost: float
    launch_date: dt.date
    archetype: str
    family_id: int
    elasticity: float
    runs_small: bool
    z_index: float           # standardised observable index
    appeal0: float           # a_p(0), the latent starting level
    sizes: list[str] = field(default_factory=list)
    variant_ids: dict[str, str] = field(default_factory=dict)   # size -> id
    price_experiment: tuple[dt.date, dt.date, float] | None = None
    status: str = "ACTIVE"


@dataclass
class Item:
    """One physical garment. Mirrors an inventory_items row plus its lifecycle."""
    id: str
    variant_id: str
    product_id: str
    size: str
    barcode: str
    cost: float
    purchase_date: dt.date
    lot_id: str
    status: str = "IN_STOCK"
    sold_on: dt.date | None = None
    invoice_item_id: str | None = None


class World:
    def __init__(self, profile: Profile, rng: Rng) -> None:
        self.profile = profile
        self.rng = rng

        self.rows: dict[str, list[dict]] = {t: [] for t in COLUMNS}
        # table -> id -> row, and invoice_id -> its lines. Returns and
        # exchanges mutate rows written earlier; without these the lookups are
        # O(n) scans over hundreds of thousands of rows.
        self.by_id: dict[str, dict[str, dict]] = {t: {} for t in COLUMNS}
        self.lines_by_invoice: dict[str, list[dict]] = {}
        self.truth: dict[str, list[dict]] = {
            "latents": [], "anomaly_labels": [], "duplicate_pairs": [],
        }

        # Identity
        self.store_id: str = ""
        self.store_code: str = ""
        self.owner_id: str = ""
        self.staff: list[dict] = []          # {id, name, role}
        self.cashier_ids: list[str] = []

        # Reference data (ids for the already-seeded global taxonomy)
        self.category_ids: dict[str, str] = {}
        self.subcategory_ids: dict[tuple[str, str], str] = {}
        self.attribute_ids: dict[str, str] = {}

        self.suppliers: list[Supplier] = []
        self.products: list[Product] = []
        self.items: dict[str, Item] = {}     # item_id -> Item

        # variant_id -> (product, size)
        self.variant_index: dict[str, tuple[Product, str]] = {}

        # Barcode sequence — store-scoped, exactly as the backend issues them.
        self._barcode_seq = 0

        # Calendar
        self.days: list[dt.date] = [
            profile.start + dt.timedelta(days=i) for i in range(profile.n_days)
        ]
        self.closed_days: set[dt.date] = set()

        # Latent series, indexed by product id -> np.ndarray over weeks
        self.appeal_series: dict[str, "list[float]"] = {}
        self.store_shock: list[float] = []

        # Demand bookkeeping (uncensored) for the truth file
        self.latent_demand: list[dict] = []

        self.counters: dict[str, int] = {}

    # ── helpers ───────────────────────────────────────────────────────────────

    def add(self, table: str, row: dict) -> dict:
        self.rows[table].append(row)
        rid = row.get("id")
        if rid is not None:
            self.by_id[table][rid] = row
        if table == "invoice_items":
            self.lines_by_invoice.setdefault(row["invoice_id"], []).append(row)
        return row

    def next_barcode_seq(self) -> int:
        self._barcode_seq += 1
        return self._barcode_seq

    def next_number(self, kind: str) -> int:
        self.counters[kind] = self.counters.get(kind, 0) + 1
        return self.counters[kind]

    def week_index(self, day: dt.date) -> int:
        return (day - self.profile.start).days // 7

    @property
    def n_weeks(self) -> int:
        return self.profile.n_days // 7 + 1

    def is_open(self, day: dt.date) -> bool:
        return day not in self.closed_days

    def log_anomaly(self, anomaly_type: str, entity_type: str, entity_id: str,
                    *, severity: str = "medium", window_start=None,
                    window_end=None, injected_at=None, is_aggregate_only: int = 0,
                    detectability: str = "medium", description: str = "",
                    is_positive: int = 1) -> None:
        self.truth["anomaly_labels"].append({
            "anomaly_id": self.rng.uuid(),
            "anomaly_type": anomaly_type,
            "severity": severity,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "window_start": window_start,
            "window_end": window_end,
            "injected_at": injected_at,
            "is_aggregate_only": is_aggregate_only,
            "expected_detectability": detectability,
            "is_positive": is_positive,
            "description": description,
        })
