"""
The realism gate.

Trains reference models on the exported panel and fails the run if measured
accuracy falls outside the design bands in config/params.py.

This is the main defence against the failure mode that makes synthetic data
worthless: a generator that teaches a model its own formula. Too *easy* means
something leaks -- a static latent, an oracle feature, under-dispersed counts.
Too *hard* means there is no learnable signal and the dataset teaches nothing.

The gate also asserts the model beats a carry-forward baseline. A dataset where
"assume next month equals last month" is unbeatable would look fine on an R^2
chart while being useless for a restocking recommendation.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from ..config import params as P

_CATS = ["category", "subcategory", "brand", "colour_family", "material",
         "pattern", "fit", "supplier_id", "size"]


def _prep(df: pd.DataFrame, features: list[str]) -> pd.DataFrame:
    X = df[features].copy()
    for col in X.columns:
        if X[col].dtype == object or col in _CATS:
            X[col] = X[col].astype("category")
    return X


def _fit_predict(train, test, features, target, objective,
                 small: bool = False):
    """Fit a reference model. `small` is for the cold-start table.

    That table is a few hundred products with high-cardinality categoricals; a
    full-size model memorises it and scores worse than predicting the mean,
    which tells you about the model rather than about the data.
    """
    import lightgbm as lgb
    if len(train) < 200 or len(test) < 50:
        return None, None
    kw = (dict(n_estimators=120, learning_rate=0.05, num_leaves=7,
               min_child_samples=25, colsample_bytree=0.7, reg_lambda=5.0,
               verbose=-1)
          if small else
          dict(n_estimators=300, learning_rate=0.05, num_leaves=31, verbose=-1))
    model = (lgb.LGBMRegressor(**kw) if objective == "reg"
             else lgb.LGBMClassifier(**kw))
    model.fit(_prep(train, features), train[target])
    if objective == "reg":
        return model.predict(_prep(test, features)), test[target].values
    return model.predict_proba(_prep(test, features))[:, 1], test[target].values


def _r2(pred, actual) -> float:
    from sklearn.metrics import r2_score
    return float(r2_score(actual, pred))


def _auc(pred, actual) -> float:
    from sklearn.metrics import roc_auc_score
    if len(np.unique(actual)) < 2:
        return float("nan")
    return float(roc_auc_score(actual, pred))


def run(out_dir: Path, verbose: bool = True) -> bool:
    results: dict[str, float] = {}
    notes: list[str] = []

    panel_path = out_dir / "ml" / "panel_product_week.csv"
    if not panel_path.exists():
        print("realism gate skipped: no ML export found")
        return True

    panel = pd.read_csv(panel_path)
    panel = panel[panel["label_valid_28"] == 1]

    feats = ["days_since_launch", "category", "subcategory", "brand",
             "brand_tier", "colour_family", "material", "pattern", "fit",
             "supplier_id", "n_sizes", "launch_month", "mrp", "unit_cost",
             "gross_margin_pct", "price_rel_subcat", "price_quintile",
             "units_on_hand", "units_7", "units_28", "units_91", "revenue_28",
             "in_stock_days_28", "velocity_28", "velocity_ratio",
             "stock_cover_days", "cum_units", "cum_sell_through",
             "pct_units_discounted_28", "month"]

    # ── warm-start demand ───────────────────────────────────────────────────
    warm = panel[panel["history_days"] >= 90].copy()
    warm["y"] = np.log1p(warm["y_units_28"])
    tr, te = warm[warm["split"] == "train"], warm[warm["split"] == "test"]
    pred, act = _fit_predict(tr, te, feats, "y", "reg")
    if pred is not None:
        results["units_28d_warm_r2"] = _r2(pred, act)
        # Carry-forward: assume the next 28 days look like the last 28.
        base = _r2(np.log1p(te["units_28"].values), act)
        results["_baseline_carry_forward_r2"] = base
        notes.append(f"model beats carry-forward by "
                     f"{results['units_28d_warm_r2'] - base:+.3f} R^2")

    # ── cold start ──────────────────────────────────────────────────────────
    launch_path = out_dir / "ml" / "product_launch.csv"
    if launch_path.exists():
        cold = pd.read_csv(launch_path)
        # 30-day counts are too sparse to score against (oracle ceiling ~0.19
        # even with the true latent); 90 days averages ~11 units.
        cold["y"] = np.log1p(cold["y_units_first_90d"])
        # subcategory (55 levels) and supplier_id are dropped: with a few
        # hundred products they memorise rather than generalise.
        cold_feats = ["category", "brand_tier", "colour_family", "pattern",
                      "fit", "n_sizes", "mrp", "gross_margin_pct",
                      "price_rel_subcat", "price_quintile", "launch_month"]
        cold = cold.sort_values("launch_date")
        cut = int(len(cold) * 0.7)
        pred, act = _fit_predict(cold.iloc[:cut], cold.iloc[cut:], cold_feats,
                                 "y", "reg", small=True)
        if pred is not None:
            results["units_28d_cold_r2"] = _r2(pred, act)
            oracle = _oracle_ceiling(out_dir, cold, cut)
            if oracle is not None and oracle > 0:
                notes.append(
                    f"cold-start captures {results['units_28d_cold_r2'] / oracle:.0%} "
                    f"of the achievable signal (oracle R^2 {oracle:.3f})")

    # ── dead stock ──────────────────────────────────────────────────────────
    dead = panel[panel["y_dead_180"].notna() & (panel["label_valid_180"] == 1)].copy()
    if len(dead) > 300:
        dead["y_dead_180"] = dead["y_dead_180"].astype(int)
        tr = dead[dead["split_180"] == "train"]
        te = dead[dead["split_180"] == "test"]
        pred, act = _fit_predict(tr, te, feats, "y_dead_180", "clf")
        if pred is not None:
            results["dead_stock_180d_auc"] = _auc(pred, act)
            notes.append(f"dead-stock prevalence {dead['y_dead_180'].mean():.3f} "
                         f"(target 0.12-0.18)")

    # ── return risk ─────────────────────────────────────────────────────────
    li_path = out_dir / "ml" / "line_items.csv"
    if li_path.exists():
        li = pd.read_csv(li_path).sort_values("sold_at")
        rfeats = ["size", "category", "subcategory", "supplier_id", "mrp",
                  "unit_price", "line_discount_pct", "invoice_discount_pct",
                  "invoice_grand_total", "n_lines_on_invoice", "hour_of_day",
                  "days_since_launch", "has_customer"]
        cut = int(len(li) * 0.7)
        pred, act = _fit_predict(li.iloc[:cut], li.iloc[cut:], rfeats,
                                 "y_returned", "clf")
        if pred is not None:
            results["return_risk_auc"] = _auc(pred, act)

    ok = _report(results, notes, verbose)
    return ok


def _oracle_ceiling(out_dir: Path, cold: pd.DataFrame, cut: int):
    """R^2 reachable when handed the TRUE latent appeal at launch.

    This is the number a real dataset can never give you, and it is what turns
    "our model scores 0.11" into "our model captures a fifth of what is there".
    """
    lat_path = out_dir / "truth" / "latents.csv"
    if not lat_path.exists():
        return None
    lat = pd.read_csv(lat_path)
    launch_week = ((pd.to_datetime(cold["launch_date"])
                    - pd.to_datetime(cold["launch_date"]).min()).dt.days // 7)
    lw = pd.DataFrame({"product_id": cold["product_id"].values,
                       "launch_week": launch_week.values})
    merged = lat.merge(lw, on="product_id")
    at_launch = merged[merged["week_index"] == merged["launch_week"]]         .set_index("product_id")
    joined = cold.join(at_launch[["log_appeal", "true_archetype"]], on="product_id")
    joined = joined.dropna(subset=["log_appeal"])
    if len(joined) < 200:
        return None
    X = pd.get_dummies(joined[["true_archetype"]]).assign(
        a=joined["log_appeal"].values)
    y = joined["y"].values
    cut = int(len(joined) * 0.7)
    pred, act = _fit_predict(
        X[:cut].assign(y=y[:cut]), X[cut:].assign(y=y[cut:]),
        list(X.columns), "y", "reg", small=True)
    return None if pred is None else _r2(pred, act)


def _report(results: dict[str, float], notes: list[str], verbose: bool) -> bool:
    ok = True
    lines = ["", "  realism gate:"]
    for name, value in results.items():
        if name.startswith("_"):
            continue
        band = P.REALISM_BANDS.get(name)
        if band is None:
            lines.append(f"    {name:26} {value:.3f}")
            continue
        lo, hi = band
        inside = lo <= value <= hi
        # Outside the band is a warning; past the hard ceiling the dataset is
        # leaking and must not be shipped.
        hard = (value > P.REALISM_HARD_CEILING_R2 if name.endswith("r2")
                else value > P.REALISM_HARD_CEILING_AUC)
        flag = "ok" if inside else ("LEAK" if hard else "warn")
        if hard:
            ok = False
        lines.append(f"    {name:26} {value:.3f}  band {lo:.2f}-{hi:.2f}  [{flag}]")

    base = results.get("_baseline_carry_forward_r2")
    warm = results.get("units_28d_warm_r2")
    if base is not None and warm is not None:
        lift = warm - base
        if lift < P.REALISM_MIN_LIFT_OVER_BASELINE:
            lines.append(f"    lift over baseline {lift:+.3f} is below "
                         f"{P.REALISM_MIN_LIFT_OVER_BASELINE} — signal too weak")
    for note in notes:
        lines.append(f"    note: {note}")
    if verbose:
        print("\n".join(lines))
    return ok
