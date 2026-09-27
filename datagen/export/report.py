"""
The human-readable summary.

Its job is to make the dataset falsifiable at a glance. Every number here is
one somebody can argue with -- if the festive lift is missing, or the size mix
that sells matches the size mix that was bought, the dataset is not doing what
it claims and the report says so before a model ever runs.
"""

from __future__ import annotations

import collections
import datetime as dt
from pathlib import Path

from ..config import calendar_in as CAL
from ..config import size_curves as SC


def _pct(a, b) -> str:
    return f"{100 * a / b:.1f}%" if b else "n/a"


def write_summary(out_dir: Path, w, counts: dict[str, int]) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    R = w.rows
    L = []

    purchased = len(R["inventory_items"])
    sold = len(R["invoice_items"])
    invoices = len(R["invoices"])
    revenue = sum(r["grand_total"] for r in R["invoices"])

    L.append(f"# Synthetic dataset — {w.profile.name}\n")
    L.append(f"Seed `{w.rng.seed}` · {w.profile.start} → {w.profile.end} "
             f"({w.profile.months} months) · store `{w.store_code}`\n")
    L.append("Regenerate byte-for-byte with:\n")
    L.append(f"```bash\npython -m datagen --profile {w.profile.name} "
             f"--seed {w.rng.seed}\n```\n")

    L.append("## Volumes\n")
    L.append("| | generated | target |")
    L.append("|---|---:|---:|")
    L.append(f"| Products | {len(w.products):,} | {w.profile.n_products:,} |")
    L.append(f"| Variants | {len(R['product_variants']):,} | — |")
    L.append(f"| Units purchased | {purchased:,} | {w.profile.target_units_purchased:,} |")
    L.append(f"| Units sold | {sold:,} | — |")
    L.append(f"| Invoices | {invoices:,} | {w.profile.target_invoices:,} |")
    L.append(f"| Movements | {len(R['inventory_movements']):,} | — |")
    L.append(f"| Returns / exchanges | {len(R['returns']):,} / {len(R['exchanges']):,} | — |")
    L.append(f"| Customers | {len(R['customers']):,} | — |\n")

    L.append("## Headline ratios\n")
    L.append("| metric | value | expected |")
    L.append("|---|---:|---:|")
    L.append(f"| Cumulative sell-through | {_pct(sold, purchased)} | 74–82% |")
    L.append(f"| Return rate (units) | {_pct(len(R['return_items']), sold)} | ~3.5% |")
    L.append(f"| Items per bill | {sold / invoices:.2f} | ~1.75 |")
    L.append(f"| Revenue per month | ₹{revenue / w.profile.months / 1e5:.2f} lakh | ~₹7.8 lakh |")
    real_disc = sum(1 for r in R["invoices"] if (r["discount_amount"] or 0) >= 10)
    round_off = sum(1 for r in R["invoices"] if 0 < (r["discount_amount"] or 0) < 10)
    L.append(f"| Bills with a real discount | {_pct(real_disc, invoices)} | ~32% |")
    L.append(f"| Bills with cash rounding only | {_pct(round_off, invoices)} | ~8% |\n")

    # ── the designed-in signals ─────────────────────────────────────────────
    L.append("## Designed-in signals\n")
    L.append("These are the reason the dataset exists. If any of them is flat, "
             "the corresponding AI feature has nothing to detect.\n")

    L.append("### Size mix: what was bought vs what sold vs what is left\n")
    L.append("The supplier ships fixed packs cut to the *national* size curve, "
             "so the store cannot buy its own demand curve even knowing it. "
             "The signal lives in the leftovers.\n")
    stocked = collections.Counter()
    sold_c = collections.Counter()
    left = collections.Counter()
    for it in w.items.values():
        if it.size not in SC.SIZE_VOCAB:
            continue
        stocked[it.size] += 1
        if it.status in ("IN_STOCK", "RETURNED_TO_STOCK"):
            left[it.size] += 1
    for r in R["invoice_items"]:
        size = w.variant_index.get(r["variant_id"], (None, ""))[1]
        if size in SC.SIZE_VOCAB:
            sold_c[size] += 1
    ts, tl, tf = sum(stocked.values()), sum(sold_c.values()), sum(left.values())
    L.append("| size | stocked | sold | unsold | unsold share of its own stock |")
    L.append("|---|---:|---:|---:|---:|")
    for s in SC.SIZE_VOCAB:
        if not stocked[s]:
            continue
        L.append(f"| {s} | {_pct(stocked[s], ts)} | {_pct(sold_c[s], tl)} | "
                 f"{_pct(left[s], tf)} | {_pct(left[s], stocked[s])} |")
    L.append("")

    L.append("### Festive lift and the post-peak trough\n")
    daily = collections.Counter()
    for r in R["invoice_items"]:
        inv = w.by_id["invoices"][r["invoice_id"]]
        daily[dt.date.fromisoformat(inv["created_at"][:10])] += 1
    open_days = [d for d in w.days if w.is_open(d)]
    base = sum(daily[d] for d in open_days) / max(len(open_days), 1)
    buckets = {"-14..-8": (-14, -8), "-7..-2": (-7, -2), "peak -1..0": (-1, 0),
               "+1..+10 (slump)": (1, 10), "+11..+20": (11, 20)}
    peaks = [p for n in CAL.MAJOR_FESTIVALS for p in CAL.FESTIVALS[n]]
    L.append("| window around a major festival | units/day vs baseline |")
    L.append("|---|---:|")
    for label, (lo, hi) in buckets.items():
        got = [daily[p + dt.timedelta(days=k)]
               for p in peaks for k in range(lo, hi + 1)
               if w.profile.start <= p + dt.timedelta(days=k) <= w.profile.end]
        if got:
            L.append(f"| {label} | {sum(got) / len(got) / base:.2f}x |")
    L.append("\nThe slump is deliberate. Without it a model learns festive "
             "demand is free and recommends buying into the trough.\n")

    L.append("### Payment mix drift\n")
    first_year, last_year = collections.Counter(), collections.Counter()
    cutoff = w.profile.start + dt.timedelta(days=365)
    for p in R["payments"]:
        day = dt.date.fromisoformat(p["created_at"][:10])
        (first_year if day < cutoff else last_year)[p["payment_method"]] += 1
    a, b = sum(first_year.values()), sum(last_year.values())
    L.append("| method | first 12 months | final period |")
    L.append("|---|---:|---:|")
    for m in ("UPI", "CASH", "CARD", "CREDIT_NOTE"):
        L.append(f"| {m} | {_pct(first_year[m], a)} | {_pct(last_year[m], b)} |")
    L.append("")

    L.append("### Item statuses\n")
    st = collections.Counter(r["status"] for r in R["inventory_items"])
    L.append("| status | units |")
    L.append("|---|---:|")
    for k, v in st.most_common():
        L.append(f"| {k} | {v:,} |")
    L.append("")

    # ── anomalies ───────────────────────────────────────────────────────────
    L.append("## Injected anomalies\n")
    pos = [r for r in w.truth["anomaly_labels"] if r["is_positive"] == 1]
    neg = [r for r in w.truth["anomaly_labels"] if r["is_positive"] == 0]
    easy = sum(1 for r in pos if r["expected_detectability"] == "easy")
    L.append(f"{len(pos)} positives, {len(neg)} hard negatives "
             f"({_pct(len(pos), invoices)} of invoices).\n")
    L.append(f"**{easy} of {len(pos)} are rule-detectable** — a deterministic "
             "integrity check catches them at ~100% precision. Only the "
             f"remaining {len(pos) - easy} need a statistical detector. That "
             "split is worth stating plainly rather than promising a model for "
             "all of it.\n")
    L.append("Evaluate as ranking (precision@10/@25/@50, AUC-PR), not "
             "classification: at this base rate accuracy is meaningless.\n")

    L.append("## Files\n")
    L.append("| file | rows |")
    L.append("|---|---:|")
    for name, n in counts.items():
        if n:
            L.append(f"| {name} | {n:,} |")
    L.append("\n> `truth/` holds evaluation keys — latent appeal, uncensored "
             "demand, anomaly labels. Never join them into a feature table.\n")

    path = out_dir / "summary.md"
    path.write_text("\n".join(L), encoding="utf-8")
    return path
