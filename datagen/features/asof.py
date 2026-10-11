"""
As-of state reconstruction.

Everything here is built from `inventory_movements` alone. `inventory_items.status`
is never read, and that is not a stylistic preference: `status = 'SOLD'` is
literally the label for several of the models, so any feature derived from it is
an oracle. It is the single easiest way to produce a model that scores 0.95 in
development and is worthless in the shop.

The movement ledger is append-only and timestamped, so replaying it up to a
date T gives exactly the stock position the store had at T -- no more.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..constants import IN_STOCK_STATUSES

SELLABLE = set(IN_STOCK_STATUSES)


def stock_deltas(movements: pd.DataFrame) -> pd.DataFrame:
    """+1 when a unit enters sellable stock, -1 when it leaves.

    PURCHASE is written with from_status == to_status == IN_STOCK (the backend
    records the opening movement that way, since there is no prior state), so it
    is treated as an entry explicitly rather than by comparing statuses.
    """
    df = movements.copy()
    was_in = df["from_status"].isin(SELLABLE) & (df["movement_type"] != "PURCHASE")
    now_in = df["to_status"].isin(SELLABLE)
    df["delta"] = now_in.astype(int) - was_in.astype(int)
    df["day"] = pd.to_datetime(df["performed_at"]).dt.normalize()
    return df[["day", "inventory_item_id", "variant_id", "product_id", "delta"]]


def daily_grid(deltas: pd.DataFrame, key: str, days: pd.DatetimeIndex
               ) -> pd.DataFrame:
    """Running on-hand by `key` (product_id or variant_id) for every day.

    Returns a days x key frame. Cumulative sum of the daily net delta, which is
    the stock position at the *end* of each day.
    """
    grouped = (deltas.groupby(["day", key])["delta"].sum()
               .unstack(fill_value=0)
               .reindex(days, fill_value=0)
               .sort_index())
    return grouped.cumsum()


def units_grid(lines: pd.DataFrame, key: str, days: pd.DatetimeIndex,
               value: str | None = None) -> pd.DataFrame:
    """Units (or a summed money column) sold per key per day."""
    col = value or "quantity"
    grouped = (lines.groupby(["day", key])[col].sum()
               .unstack(fill_value=0)
               .reindex(days, fill_value=0)
               .sort_index())
    return grouped


def trailing(frame: pd.DataFrame, window: int) -> pd.DataFrame:
    """Sum over the `window` days ending the day BEFORE each row.

    Shifting by one is what makes a feature strictly as-of: a row stamped T must
    never see anything that happened on T itself.
    """
    return frame.shift(1).rolling(window, min_periods=1).sum()


def forward(frame: pd.DataFrame, window: int, embargo: int = 1) -> pd.DataFrame:
    """Sum over `window` days starting `embargo` days after each row.

    The embargo absorbs same-day ambiguity: an invoice timestamped late on T is
    not knowable at T.
    """
    rev = frame.iloc[::-1]
    out = rev.shift(embargo).rolling(window, min_periods=1).sum().iloc[::-1]
    return out


def exposure_grid(on_hand: pd.DataFrame, open_days: pd.Series) -> pd.DataFrame:
    """Days on which a product was both in stock and the shop was trading.

    This is the offset for the demand model. Without it, a product that sold
    nothing because it was out of stock looks identical to one that sold nothing
    because nobody wanted it, and every velocity figure is wrong.
    """
    in_stock = (on_hand > 0).astype(int)
    return in_stock.mul(open_days.astype(int), axis=0)


def safe_ratio(num, den, default: float = 0.0):
    den = np.asarray(den, dtype=float)
    out = np.divide(np.asarray(num, dtype=float), den,
                    out=np.full_like(den, default, dtype=float), where=den > 0)
    return out
