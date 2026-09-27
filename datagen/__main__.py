"""
CLI entry point.

    python -m datagen --profile standard --seed 42 --out datagen/out

Writes CSV to disk only; nothing here touches a database. The files under
out/db/ are shaped so they can be \\copy'd into Postgres later, once the Week-4
billing migration is repaired and those tables exist.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from .checks import integrity
from .config.profiles import PROFILES, get_profile
from .export import csv_writer, manifest
from .rng import Rng
from .steps import (s01_store, s02_catalog, s03_simulate, s07_shrinkage,
                    s08_anomalies)
from .world import World


def build_world(profile_name: str, seed: int, months: int | None = None) -> World:
    profile = get_profile(profile_name, months)
    w = World(profile, Rng(seed))
    for step in (s01_store, s02_catalog, s03_simulate, s07_shrinkage,
                 s08_anomalies):
        step.run(w)
    return w


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="datagen", description=__doc__)
    ap.add_argument("--profile", default="standard", choices=sorted(PROFILES),
                    help="volume profile (default: standard, 36 months)")
    ap.add_argument("--seed", type=int, default=42,
                    help="every draw comes from this seed; same seed, same bytes")
    ap.add_argument("--months", type=int, default=None,
                    help="override the profile's history window")
    ap.add_argument("--out", default="datagen/out", help="output directory")
    ap.add_argument("--skip-ml", action="store_true",
                    help="write only out/db and out/truth")
    ap.add_argument("--skip-gate", action="store_true",
                    help="skip the realism gate (it trains reference models)")
    args = ap.parse_args(argv)

    out = Path(args.out)
    t0 = time.time()

    profile = get_profile(args.profile, args.months)
    print(f"profile {profile.name}: {profile.start} .. {profile.end} "
          f"({profile.months} months, {profile.n_days} days), seed {args.seed}")

    w = build_world(args.profile, args.seed, args.months)
    print(f"  simulated in {time.time() - t0:.1f}s")

    report = integrity.summarise(w)
    print(f"  {report}")
    if report.startswith("integrity FAILED"):
        return 1

    counts = csv_writer.write_db(out / "db", w.rows)
    truth_counts = manifest.write_truth(out / "truth", w)
    print(f"  wrote {sum(counts.values()):,} database rows to {out / 'db'}")
    print(f"  wrote {sum(truth_counts.values()):,} truth rows to {out / 'truth'}")

    if not args.skip_ml:
        from .features import panel
        ml_counts = panel.build(w, out / "ml")
        print(f"  wrote {sum(ml_counts.values()):,} ML rows to {out / 'ml'}")
        counts.update({f"ml.{k}": v for k, v in ml_counts.items()})

    from .export import report as report_mod
    report_mod.write_summary(out / "report", w, counts)
    print(f"  wrote {out / 'report' / 'summary.md'}")

    manifest.write_manifest(out, w, counts, time.time() - t0)

    if not args.skip_ml and not args.skip_gate:
        from .checks import realism_gate
        ok = realism_gate.run(out, verbose=True)
        if not ok:
            print("\nrealism gate FAILED - see the bands in config/params.py")
            return 2

    print(f"\ndone in {time.time() - t0:.1f}s -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
