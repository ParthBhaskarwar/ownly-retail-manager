"""
Run manifest and the truth files.

The manifest records everything needed to reproduce a run byte-for-byte: seed,
profile, and every parameter that shaped the data. A dataset whose generating
parameters are not written down cannot be defended in a review, and re-tuning
the accuracy ceiling without recording what changed is how a synthetic dataset
quietly stops meaning anything.

truth/ is the evaluation key. It is written next to the data but must never be
joined into a feature table -- see features/panel.py, which reads only from
out/db/.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

from ..config import params as P
from .csv_writer import write_json, write_rows


def _jsonable(value):
    # Some params are keyed by tuple (price bands, for instance), which JSON
    # cannot represent as an object key.
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _param_snapshot() -> dict:
    return {
        k: _jsonable(v) for k, v in vars(P).items()
        if k.isupper() and isinstance(v, (int, float, str, list, tuple, dict, bool))
    }


def write_manifest(out_dir: Path, w, counts: dict[str, int],
                   elapsed: float) -> dict:
    payload = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "seed": w.rng.seed,
        "profile": {
            "name": w.profile.name,
            "start": w.profile.start.isoformat(),
            "end": w.profile.end.isoformat(),
            "days": w.profile.n_days,
            "months": w.profile.months,
            "n_products": w.profile.n_products,
        },
        "store_id": w.store_id,
        "store_code": w.store_code,
        "elapsed_seconds": round(elapsed, 2),
        "row_counts": counts,
        "truth_counts": {k: len(v) for k, v in w.truth.items()},
        "parameters": _param_snapshot(),
        "warning": (
            "truth/ files are evaluation keys. Never join them into a feature "
            "table. See features/panel.py."
        ),
    }
    write_json(out_dir / "manifest.json", payload)
    return payload


def write_truth(out_dir: Path, w) -> dict[str, int]:
    """Latents, anomaly labels and duplicate pairs."""
    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}

    latents = []
    for p in w.products:
        series = w.appeal_series.get(p.id, [])
        for week, value in enumerate(series):
            latents.append({
                "product_id": p.id,
                "week_index": week,
                "log_appeal": float(value),
                "z_index": p.z_index,
                "true_archetype": p.archetype,
                "true_elasticity": p.elasticity,
                "runs_small": int(p.runs_small),
                "family_id": p.family_id,
                "supplier_id": p.supplier_id,
                "price_experiment": int(p.price_experiment is not None),
            })
    counts["latents"] = write_rows(out_dir / "latents.csv", latents)

    counts["store_shock"] = write_rows(
        out_dir / "store_shock.csv",
        [{"week_index": i, "log_shock": float(v)}
         for i, v in enumerate(w.store_shock)])

    # Uncensored demand: what customers wanted, before stockouts took their cut.
    # The gap between this and invoice_items is the censoring the exposure
    # offset in the ML export exists to handle.
    counts["latent_demand"] = write_rows(
        out_dir / "latent_demand.csv", w.latent_demand)

    counts["anomaly_labels"] = write_rows(
        out_dir / "anomaly_labels.csv", w.truth["anomaly_labels"])
    counts["duplicate_pairs"] = write_rows(
        out_dir / "duplicate_pairs.csv", w.truth["duplicate_pairs"])
    return counts
