"""
Volume profiles.

`standard` is the one the AI work should train on: 36 months ending 1 Sept
2026, covering three Diwalis. Two festive cycles are the minimum for
seasonality to be a learnable pattern rather than a memorised spike, and the
third gives a clean festive holdout fold.

`m24` is the 24-month variant. It works, but its natural test window
(Mar-Aug 2026) contains no Diwali, so the festive fold in params.py becomes
mandatory rather than optional.

`demo` is a 3-month slice for development, CI and screenshots.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    name: str
    start: dt.date
    end: dt.date
    n_products: int
    n_families: int
    target_units_purchased: int
    target_invoices: int
    n_suppliers: int

    @property
    def n_surprise_pairs(self) -> int:
        # Injected pairs overwrite latent appeal, so keep them a small share of
        # the catalogue or they distort the appeal distribution itself.
        return max(2, round(25 * self.n_products / 600))

    @property
    def n_duplicate_pairs(self) -> int:
        return max(2, round(30 * self.n_products / 600))

    @property
    def n_duplicate_hard_negatives(self) -> int:
        return max(1, round(10 * self.n_products / 600))

    @property
    def n_days(self) -> int:
        return (self.end - self.start).days + 1

    @property
    def months(self) -> int:
        return round(self.n_days / 30.44)


DATA_END = dt.date(2026, 9, 1)

PROFILES = {
    "standard": Profile(
        name="standard",
        start=dt.date(2023, 9, 1),
        end=DATA_END,
        n_products=600,
        n_families=120,
        target_units_purchased=48_000,
        target_invoices=20_000,
        n_suppliers=15,
    ),
    "m24": Profile(
        name="m24",
        start=dt.date(2024, 9, 1),
        end=DATA_END,
        n_products=430,
        n_families=85,
        target_units_purchased=32_000,
        target_invoices=13_300,
        n_suppliers=15,
    ),
    "demo": Profile(
        name="demo",
        start=dt.date(2026, 6, 1),
        end=DATA_END,
        n_products=90,
        n_families=18,
        target_units_purchased=3_600,
        target_invoices=1_600,
        n_suppliers=8,
    ),
}


def get_profile(name: str, months: int | None = None) -> Profile:
    if name not in PROFILES:
        raise SystemExit(
            f"Unknown profile {name!r}. Choose from: {', '.join(PROFILES)}"
        )
    p = PROFILES[name]
    if months is None or months == p.months:
        return p

    # Rescale a named profile to an arbitrary window, holding the per-month
    # rates constant so density stays realistic.
    ratio = months / p.months
    start = p.end - dt.timedelta(days=int(round(months * 30.44)) - 1)
    return Profile(
        name=f"{p.name}-{months}mo",
        start=start,
        end=p.end,
        n_products=max(20, int(round(p.n_products * ratio))),
        n_families=max(4, int(round(p.n_families * ratio))),
        target_units_purchased=int(round(p.target_units_purchased * ratio)),
        target_invoices=int(round(p.target_invoices * ratio)),
        n_suppliers=p.n_suppliers,
    )
