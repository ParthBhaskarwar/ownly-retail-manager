"""
CSV output.

Files under out/db/ are column-for-column against the live Postgres schema, so
each one loads with no column list:

    \\copy <table> FROM 'out/db/<table>.csv' WITH (FORMAT csv, HEADER true, NULL '')

Conventions that matter for that to work:
  * NULL is the empty field (not the string "NULL", not \\N)
  * booleans are true/false
  * dates are YYYY-MM-DD, timestamps ISO-8601
  * money is rounded to 2dp, matching decimal(12,2)
  * json columns hold valid JSON, quoted by the csv module
"""

from __future__ import annotations

import csv
import datetime as dt
import json
from pathlib import Path

from ..tables import COLUMNS


def _fmt(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        # Fixed notation to 6dp, trailing zeros trimmed. Money is already
        # rounded to 2dp upstream and Postgres widens it to decimal(12,2);
        # the extra places exist for the latent columns in truth/, where
        # forcing 2dp would quantise the very values used to score the models.
        text = f"{value:.6f}".rstrip("0").rstrip(".")
        return "0" if text in ("", "-0") else text
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    return str(value)


def write_table(out_dir: Path, table: str, rows: list[dict]) -> Path:
    cols = COLUMNS[table]
    path = out_dir / f"{table}.csv"
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(cols)
        for row in rows:
            # Rows may carry scratch keys (e.g. _anomalous); only schema
            # columns are written, in schema order.
            writer.writerow([_fmt(row.get(c)) for c in cols])
    return path


def write_db(out_dir: Path, rows: dict[str, list[dict]]) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {}
    for table in COLUMNS:
        counts[table] = len(rows[table])
        write_table(out_dir, table, rows[table])
    return counts


def write_rows(path: Path, rows: list[dict], columns: list[str] | None = None
               ) -> int:
    """Generic writer for the ML and truth files, which have no fixed schema."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return 0
    cols = columns or list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(cols)
        for row in rows:
            writer.writerow([_fmt(row.get(c)) for c in cols])
    return len(rows)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
