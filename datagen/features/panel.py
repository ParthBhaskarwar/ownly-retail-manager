"""
The ML training surface.

Five files, each shaped for a specific model rather than one wide table:

  panel_product_week   product x week spine -- demand, dead stock, clearance
  panel_variant_month  size mix (weekly is too sparse at ~0.1 units/variant)
  line_items           return risk and billing anomalies, at line level
  product_launch       cold start: attributes only, zero history
  prediction_log       historical replay for prediction-vs-actual

Product x week is the spine because the alternatives do not work here: product
alone gives a few hundred rows and no temporal validation; product x day is
mostly zeros at ~0.08 units a day; product x month is too coarse for a 30-day
target. A 28-day label is a clean four-week sum on a weekly grid.

Cold-start rows live in their own file on purpose. Mixing them into the spine
lets products with long histories inflate the headline metric and hides how
hard a genuinely new product actually is to forecast.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from ..config import params as P
from ..config import size_curves as SC
from ..export.csv_writer import write_rows
from . import asof


def _frames(w) -> dict[str, pd.DataFrame]:
    return {t: pd.DataFrame(rows) for t, rows in w.rows.items() if rows}


def build(w, out_dir: Path) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    F = _frames(w)
    counts: dict[str, int] = {}

    days = pd.date_range(w.profile.start, w.profile.end, freq="D")
    open_days = pd.Series([d.date() not in w.closed_days for d in days], index=days)

    products = pd.DataFrame([{
        "product_id": p.id, "category": p.category, "subcategory": p.subcategory,
        "brand": p.brand, "brand_tier": p.brand_tier, "colour": p.colour,
        "colour_family": p.colour_family, "material": p.material,
        "pattern": p.pattern, "fit": p.fit, "sleeve": p.sleeve, "neck": p.neck,
        "supplier_id": p.supplier_id, "mrp": p.mrp, "unit_cost": p.unit_cost,
        "gross_margin_pct": round((p.mrp - p.unit_cost) / p.mrp, 4),
        "n_sizes": len(p.sizes), "family_id": p.family_id,
        "launch_date": pd.Timestamp(p.launch_date),
        "launch_month": p.launch_date.month,
    } for p in w.products]).set_index("product_id")

    # Price band within the subcategory: a static attribute, so computing it
    # across the whole catalogue introduces no look-ahead.
    products["price_rel_subcat"] = (
        products["mrp"] / products.groupby("subcategory")["mrp"].transform("median"))
    products["price_quintile"] = (
        products.groupby("subcategory")["mrp"]
        .rank(pct=True).mul(5).clip(upper=5).round().astype(int))

    # ── daily grids, all reconstructed from movements ───────────────────────
    variant_owner = {vid: p.id for p in w.products for vid in p.variant_ids.values()}
    mv = F["inventory_movements"].copy()
    mv["variant_id"] = mv["inventory_item_id"].map(
        F["inventory_items"].set_index("id")["variant_id"])
    mv["product_id"] = mv["variant_id"].map(variant_owner)
    mv = mv.dropna(subset=["product_id"])
    deltas = asof.stock_deltas(mv)

    on_hand = asof.daily_grid(deltas, "product_id", days).reindex(
        columns=products.index, fill_value=0)

    lines = F["invoice_items"].copy()
    inv = F["invoices"].set_index("id")
    lines["day"] = pd.to_datetime(lines["invoice_id"].map(inv["created_at"])).dt.normalize()
    lines["net"] = lines["final_price"]

    # Anomalous lines are excluded from the demand aggregates so 1.5% of
    # deliberately injected garbage does not end up inside the labels.
    bad_lines = {r["entity_id"] for r in w.truth["anomaly_labels"]
                 if r["is_positive"] == 1 and r["entity_type"] == "invoice_item"}
    bad_invoices = {r["entity_id"] for r in w.truth["anomaly_labels"]
                    if r["is_positive"] == 1 and r["entity_type"] == "invoice"}
    lines["is_clean"] = ~(lines["id"].isin(bad_lines)
                          | lines["invoice_id"].isin(bad_invoices))
    clean = lines[lines["is_clean"]]

    units = asof.units_grid(clean, "product_id", days).reindex(
        columns=products.index, fill_value=0)
    revenue = asof.units_grid(clean, "product_id", days, "net").reindex(
        columns=products.index, fill_value=0)
    discounted = asof.units_grid(
        clean.assign(disc=(clean["discount_amount"] > 0).astype(int)),
        "product_id", days, "disc").reindex(columns=products.index, fill_value=0)

    exposure = asof.exposure_grid(on_hand, open_days)

    counts["panel_product_week"] = _product_week(
        w, out_dir, products, days, units, revenue, discounted, on_hand, exposure)
    counts["panel_variant_month"] = _variant_month(
        w, out_dir, F, days, deltas, clean, variant_owner)
    counts["line_items"] = _line_items(w, out_dir, F, lines, products)
    counts["product_launch"] = _product_launch(
        w, out_dir, products, days, units, exposure)
    counts["prediction_log"] = _prediction_log(
        w, out_dir, products, days, units, exposure)
    return counts


# ── T1: product x week ───────────────────────────────────────────────────────

def _product_week(w, out_dir, products, days, units, revenue, discounted,
                  on_hand, exposure) -> int:
    weeks = days[::7]

    tr = {n: asof.trailing(units, n).reindex(weeks) for n in (7, 28, 91)}
    exp_tr = {n: asof.trailing(exposure, n).reindex(weeks) for n in (28, 91)}
    rev28 = asof.trailing(revenue, 28).reindex(weeks)
    disc28 = asof.trailing(discounted, 28).reindex(weeks)
    prev28 = asof.trailing(units, 28).shift(28).reindex(weeks)
    cum = units.shift(1).cumsum().reindex(weeks)
    cum_stocked = (on_hand.diff().clip(lower=0).shift(1).cumsum().reindex(weeks))

    fwd = {n: asof.forward(units, n, P.LABEL_EMBARGO_DAYS).reindex(weeks)
           for n in P.HORIZONS}
    fwd_exp = {n: asof.forward(exposure, n, P.LABEL_EMBARGO_DAYS).reindex(weeks)
               for n in (28, 90, 91, 180)}
    fwd180 = asof.forward(units, 180, P.LABEL_EMBARGO_DAYS).reindex(weeks)
    fwd90 = asof.forward(units, 90, P.LABEL_EMBARGO_DAYS).reindex(weeks)
    oh = on_hand.reindex(weeks)

    launch = products["launch_date"]
    rows = []
    end = pd.Timestamp(w.profile.end)

    for pid in products.index:
        p = products.loc[pid]
        for wk in weeks:
            age = (wk - launch[pid]).days
            if age < 0:
                continue
            hand = float(oh.at[wk, pid])
            e28 = float(exp_tr[28].at[wk, pid])
            if e28 < P.MIN_EXPOSURE_DAYS and age > 28:
                continue

            u28 = float(tr[28].at[wk, pid])
            velocity = u28 / e28 if e28 > 0 else 0.0
            prev = float(prev28.at[wk, pid]) if not np.isnan(prev28.at[wk, pid]) else 0.0
            cum_u = float(cum.at[wk, pid]) if not np.isnan(cum.at[wk, pid]) else 0.0
            stocked = float(cum_stocked.at[wk, pid]) if not np.isnan(
                cum_stocked.at[wk, pid]) else 0.0

            tier = _sufficiency(age, cum_u, e28)
            f28exp = float(fwd_exp[28].at[wk, pid])

            row = {
                "product_id": pid, "week_start": wk.date(),
                "week_index": int((wk - days[0]).days // 7),
                "month": wk.month, "days_since_launch": age,
                "category": p["category"], "subcategory": p["subcategory"],
                "brand": p["brand"], "brand_tier": p["brand_tier"],
                "colour_family": p["colour_family"], "material": p["material"],
                "pattern": p["pattern"], "fit": p["fit"],
                "supplier_id": p["supplier_id"], "n_sizes": p["n_sizes"],
                "launch_month": p["launch_month"],
                "mrp": p["mrp"], "unit_cost": p["unit_cost"],
                "gross_margin_pct": p["gross_margin_pct"],
                "price_rel_subcat": round(float(p["price_rel_subcat"]), 4),
                "price_quintile": int(p["price_quintile"]),
                # as-of stock and demand
                "units_on_hand": hand,
                "units_7": float(tr[7].at[wk, pid]),
                "units_28": u28,
                "units_91": float(tr[91].at[wk, pid]),
                "revenue_28": round(float(rev28.at[wk, pid]), 2),
                "in_stock_days_28": e28,
                "in_stock_days_91": float(exp_tr[91].at[wk, pid]),
                "velocity_28": round(velocity, 5),
                "velocity_ratio": round(u28 / prev, 4) if prev > 0 else np.nan,
                "stock_cover_days": round(hand / velocity, 2) if velocity > 0
                                    else (999.0 if hand > 0 else 0.0),
                "cum_units": cum_u,
                "cum_units_stocked": stocked,
                "cum_sell_through": round(cum_u / stocked, 4) if stocked > 0 else 0.0,
                "pct_units_discounted_28": round(
                    float(disc28.at[wk, pid]) / u28, 4) if u28 > 0 else 0.0,
                "history_days": age,
                "sufficiency_tier": tier,
                # labels
                "y_units_7": float(fwd[7].at[wk, pid]),
                "y_units_28": float(fwd[28].at[wk, pid]),
                "y_units_91": float(fwd[91].at[wk, pid]),
                "y_exposure_days_28": f28exp,
                "y_exposure_days_91": float(fwd_exp[91].at[wk, pid]),
                "y_dead_90": _dead(90, float(fwd90.at[wk, pid]), hand,
                                   float(fwd_exp[90].at[wk, pid])),
                "y_dead_180": _dead(180, float(fwd180.at[wk, pid]), hand,
                                    float(fwd_exp[180].at[wk, pid])),
                "label_valid_28": int((end - wk).days >= 28 + P.LABEL_EMBARGO_DAYS),
                "label_valid_91": int((end - wk).days >= 91 + P.LABEL_EMBARGO_DAYS),
                "label_valid_180": int((end - wk).days >= 180 + P.LABEL_EMBARGO_DAYS),
                "split": _split(wk, 28),
                # The 180-day label needs its own, earlier split.
                "split_180": _split(wk, 180, test_start=_LONG_TEST_START),
            }
            rows.append(row)

    return write_rows(out_dir / "panel_product_week.csv", rows)


def _dead(window: int, future_units: float, on_hand: float,
          future_exposure: float):
    """Dead-stock label with its exposure conditions.

    "Sold nothing in 90 days" alone is wrong twice over: a product that sold out
    is not dead, and one that was never on the shelf had no chance. Both are
    excluded, which is why the label needs on-hand and in-stock-days as well as
    the sales count.
    """
    if on_hand < P.DEAD_STOCK_MIN_ON_HAND:
        return ""
    if future_exposure < P.DEAD_STOCK_MIN_EXPOSURE[window]:
        return ""
    threshold = max(1.0, P.DEAD_STOCK_SALES_FRACTION[window] * on_hand)
    return int(future_units <= threshold)


def _sufficiency(age: int, cum_units: float, exposure: float) -> int:
    if age >= 90 and cum_units >= 25 and exposure >= 0.7 * min(age, 28):
        return 3
    if age >= 42 and cum_units >= 10:
        return 2
    if age >= 14 and cum_units >= 3:
        return 1
    return 0


# Long-horizon test window, chosen so every test row can actually carry a
# 180-day label: it opens ~12 months before the data ends and closes 180 days
# before it.
_LONG_TEST_START = "2025-09-01"
_LONG_TEST_END = "2026-03-01"


def _split(week: pd.Timestamp, horizon: int, test_start: str | None = None) -> str:
    """Purged walk-forward split.

    The purge matters: a training row at T with a 28-day label reads data from
    inside the test period, so training must stop a full horizon before the test
    window opens rather than right up against it.
    """
    long_run = test_start is not None
    start = pd.Timestamp(test_start or P.TEST_START)
    if long_run:
        if start <= week < pd.Timestamp(_LONG_TEST_END):
            return "test"
        if week >= pd.Timestamp(_LONG_TEST_END):
            return "after"
    elif week >= start:
        return "test"
    test_start = start
    if week <= test_start - pd.Timedelta(days=horizon + P.LABEL_EMBARGO_DAYS):
        return "train"
    return "purged"


# ── T2: variant x month (size mix) ───────────────────────────────────────────

def _variant_month(w, out_dir, F, days, deltas, clean, variant_owner) -> int:
    months = pd.date_range(days[0], days[-1], freq="MS")
    v_on_hand = asof.daily_grid(deltas, "variant_id", days)
    v_units = asof.units_grid(clean, "variant_id", days)

    size_of = {vid: size for p in w.products for size, vid in p.variant_ids.items()}
    sub_of = {p.id: p.subcategory for p in w.products}

    monthly_units = v_units.resample("MS").sum()
    monthly_stock = (v_on_hand > 0).astype(int).resample("MS").sum()
    open_per_month = pd.Series(1, index=days).resample("MS").sum()

    rows = []
    for vid in v_units.columns:
        pid = variant_owner.get(vid)
        if pid is None:
            continue
        size = size_of.get(vid, "")
        prior = SC.buyer_prior(sub_of[pid]).get(size, 0.0)
        true_prior = SC.true_demand_prior(sub_of[pid]).get(size, 0.0)
        for m in months:
            if m not in monthly_units.index:
                continue
            u = float(monthly_units.at[m, vid])
            in_stock = float(monthly_stock.at[m, vid])
            if u == 0 and in_stock == 0:
                continue
            rows.append({
                "variant_id": vid, "product_id": pid, "size": size,
                "month_start": m.date(),
                "units_sold": u,
                "in_stock_days": in_stock,
                "availability_ratio": round(
                    in_stock / float(open_per_month.at[m]), 3),
                "buyer_prior_share": round(prior, 4),
                # Evaluation only: the mix customers actually wanted, before
                # stockouts censored it. Never a feature.
                "truth_demand_share": round(true_prior, 4),
            })
    return write_rows(out_dir / "panel_variant_month.csv", rows)


# ── T3: line items (return risk) ─────────────────────────────────────────────

def _line_items(w, out_dir, F, lines, products) -> int:
    inv = F["invoices"].set_index("id")
    returned = F["return_items"].set_index("original_invoice_item_id") \
        if "return_items" in F else pd.DataFrame()

    n_lines = lines.groupby("invoice_id")["id"].transform("count")
    size_of = {vid: size for p in w.products for size, vid in p.variant_ids.items()}
    launch = products["launch_date"]

    rows = []
    for i, line in enumerate(lines.itertuples()):
        pid = line.product_id
        if pid not in products.index:
            continue
        header = inv.loc[line.invoice_id]
        sold_at = pd.Timestamp(header["created_at"])
        cond = ""
        if len(returned) and line.id in returned.index:
            entry = returned.loc[line.id]
            cond = entry["condition"] if isinstance(entry["condition"], str) \
                else entry["condition"].iloc[0]
        rows.append({
            "invoice_item_id": line.id,
            "sold_at": sold_at.date(),
            "hour_of_day": sold_at.hour,
            "product_id": pid,
            "size": size_of.get(line.variant_id, ""),
            "category": products.at[pid, "category"],
            "subcategory": products.at[pid, "subcategory"],
            "supplier_id": products.at[pid, "supplier_id"],
            "mrp": products.at[pid, "mrp"],
            "unit_price": line.unit_price,
            "line_discount_pct": round(line.discount_amount / line.unit_price, 4)
                                 if line.unit_price else 0.0,
            "invoice_discount_pct": round(
                header["discount_amount"] / header["subtotal"], 4)
                if header["subtotal"] else 0.0,
            "invoice_grand_total": header["grand_total"],
            "n_lines_on_invoice": int(n_lines.iloc[i]),
            "cashier_id": header["cashier_id"],
            "has_customer": int(bool(header["customer_id"])),
            "days_since_launch": (sold_at.normalize() - launch[pid]).days,
            "y_returned": int(line.status in ("RETURNED", "EXCHANGED")),
            "y_is_exchange": int(line.status == "EXCHANGED"),
            "y_return_condition": cond,
        })
    return write_rows(out_dir / "line_items.csv", rows)


# ── T4: cold start ───────────────────────────────────────────────────────────

def _product_launch(w, out_dir, products, days, units, exposure) -> int:
    """Attributes only, zero history. Kept apart from the spine deliberately."""
    rows = []
    end = pd.Timestamp(w.profile.end)
    for pid in products.index:
        p = products.loc[pid]
        launch = p["launch_date"]
        if (end - launch).days < 90:
            continue
        w30 = units.loc[launch:launch + pd.Timedelta(days=30), pid].sum()
        w90 = units.loc[launch:launch + pd.Timedelta(days=90), pid].sum()
        series = units.loc[launch:, pid]
        first = series[series > 0]
        ttfs = (first.index[0] - launch).days if len(first) else np.nan
        rows.append({
            "product_id": pid,
            "launch_date": launch.date(), "launch_month": p["launch_month"],
            "category": p["category"], "subcategory": p["subcategory"],
            "brand": p["brand"], "brand_tier": p["brand_tier"],
            "colour_family": p["colour_family"], "material": p["material"],
            "pattern": p["pattern"], "fit": p["fit"], "n_sizes": p["n_sizes"],
            "supplier_id": p["supplier_id"], "mrp": p["mrp"],
            "gross_margin_pct": p["gross_margin_pct"],
            "price_rel_subcat": round(float(p["price_rel_subcat"]), 4),
            "price_quintile": int(p["price_quintile"]),
            "y_units_first_30d": float(w30),
            "y_units_first_90d": float(w90),
            "y_days_to_first_sale": ttfs,
            "y_time_to_first_sale_class": _ttfs_class(ttfs),
        })
    return write_rows(out_dir / "product_launch.csv", rows)


def _ttfs_class(days) -> str:
    if days is None or (isinstance(days, float) and np.isnan(days)):
        return "never_or_60plus"
    if days <= 7:
        return "0_7"
    if days <= 21:
        return "8_21"
    if days <= 60:
        return "22_60"
    return "never_or_60plus"


# ── T5: prediction replay ────────────────────────────────────────────────────

def _prediction_log(w, out_dir, products, days, units, exposure) -> int:
    """Prediction-versus-actual history, seeded with a carry-forward baseline.

    The spec requires tracking predictions against outcomes, and a feature that
    ships with an empty history cannot be demonstrated. This fills it with the
    honest baseline -- trailing velocity carried forward -- so the screen has 18
    months of data on day one. Replace `predicted_value` with real model output
    once the models exist; the schema does not change.
    """
    weeks = days[::14]
    tr28 = asof.trailing(units, 28).reindex(weeks)
    exp28 = asof.trailing(exposure, 28).reindex(weeks)
    fwd28 = asof.forward(units, 28, P.LABEL_EMBARGO_DAYS).reindex(weeks)
    fwd_exp = asof.forward(exposure, 28, P.LABEL_EMBARGO_DAYS).reindex(weeks)
    end = pd.Timestamp(w.profile.end)

    rows = []
    for pid in products.index:
        launch = products.at[pid, "launch_date"]
        for wk in weeks:
            if wk < launch + pd.Timedelta(days=28) or (end - wk).days < 29:
                continue
            e = float(exp28.at[wk, pid])
            if e < P.MIN_EXPOSURE_DAYS:
                continue
            velocity = float(tr28.at[wk, pid]) / e
            predicted = round(velocity * float(fwd_exp.at[wk, pid]), 2)
            actual = float(fwd28.at[wk, pid])
            rows.append({
                "product_id": pid, "prediction_date": wk.date(),
                "horizon_days": 28, "target_name": "units_28d",
                "model_version": "baseline_carry_forward_v1",
                "predicted_value": predicted,
                "q10": round(predicted * 0.4, 2), "q90": round(predicted * 1.9, 2),
                "confidence_tier": _sufficiency(
                    (wk - launch).days, float(units.loc[:wk, pid].sum()), e),
                "actual_value": actual,
                "abs_error": round(abs(actual - predicted), 2),
                "within_interval": int(predicted * 0.4 <= actual <= predicted * 1.9),
            })
    return write_rows(out_dir / "prediction_log.csv", rows)
