# datagen — synthetic dataset for the Ownly AI features

Generates 36 months of plausible clothing-retail history as CSV on local disk.
Nothing here touches a database.

```bash
python -m datagen --profile standard --seed 42 --out datagen/out
```

~80 seconds, ~98 MB, fully reproducible: same seed, same bytes.

| profile | window | products | units | invoices | runtime |
|---|---|---:|---:|---:|---:|
| `demo` | 3 months | 96 | ~6k | ~1k | ~3 s |
| `m24` | 24 months | 430 | ~32k | ~14k | ~50 s |
| `standard` | 36 months | 640 | ~46k | ~21k | ~80 s |

`--months N` rescales any profile. `--skip-ml` writes only `db/` and `truth/`.
`--skip-gate` skips the reference models.

## Why this exists

Every AI feature in the spec (§2.13 restocking, §2.14 product performance,
§2.15 price/discount/size/supplier/anomaly) learns from the retailer's own
sales history, and §3.2 rules out external data. The database has zero sales
rows, so there is nothing to compute velocity, sell-through, dead-stock risk or
size demand from.

## Output

```
out/db/       20 files, column-for-column against the Postgres schema
out/ml/       the training surface (see below)
out/truth/    evaluation keys — latents, uncensored demand, anomaly labels
out/report/   summary.md
manifest.json seed, profile and every parameter used
```

`out/db/` loads straight into Postgres once the Week-4 billing migration is
repaired and those tables exist:

```sql
\copy invoices FROM 'out/db/invoices.csv' WITH (FORMAT csv, HEADER true, NULL '')
```

Load in the order given by `LOAD_ORDER` in `tables.py`. Skip
`categories`, `subcategories` and `attribute_definitions` if the database has
already run `seeds/001_clothing_template.ts` — those rows are global
(`store_id = NULL`) and already present.

### The ML surface

| file | rows | for |
|---|---:|---|
| `panel_product_week.csv` | ~54k | demand forecast, dead stock, clearance |
| `panel_variant_month.csv` | ~30k | size-mix recommendation |
| `line_items.csv` | ~37k | return risk, billing anomalies |
| `product_launch.csv` | 619 | cold start — attributes only, no history |
| `prediction_log.csv` | ~13k | prediction-vs-actual history |

Cold-start rows are a separate file on purpose. Mixed into the panel, products
with long histories inflate the headline metric and hide how hard a genuinely
new product is.

## The part that matters

The hard problem is not producing plausible rows. It is producing a dataset
where **model accuracy is realistic**. A naive generator teaches a model the
formula that produced it, scores ~0.98, and collapses on real data.

Five things stop that here:

- **Negative Binomial, not Poisson.** Poisson is under-dispersed; a product at
  3 units/day would have a 30-day CV of 0.10 and R² near 0.98.
- **Latent appeal drifts.** AR(1), φ=0.94 (half-life ~11 weeks). A static
  latent makes the trailing mean a sufficient statistic and renders all feature
  engineering pointless.
- **Attribute coupling is a designed constant.** ρ²=0.32 between observable
  attributes and latent appeal — the cold-start ceiling, by construction.
- **A store-wide common shock.** Without it per-product errors are independent
  and aggregate forecasts get unrealistically accurate.
- **The log-linearity is broken deliberately** — discount thresholds, stockout
  substitution, a capacity ceiling, archetype-dependent age curves. A pure
  product of factors is additive in logs and an OLS would invert it.

`checks/realism_gate.py` trains reference models after every run and fails the
build if accuracy leaves the measured bands in `config/params.py`.

### Leakage traps

**Never read `inventory_items.status` for a feature.** `status = 'SOLD'` is
literally the label. All stock state is reconstructed from
`inventory_movements` with `performed_at < T` — see `features/asof.py`.

Also enforced: price encodes at most 0.15 of latent appeal then snaps to a
discrete price point; the simulated buyer reorders from *observed* trailing
sales, never from latent appeal (otherwise current stock is an oracle); every
supplier covers ≥2 categories and every category has ≥2 suppliers; labels carry
a one-day embargo and the walk-forward split is purged by a full horizon.

### `out/truth/` is not a feature source

It holds the true latent appeal, uncensored demand, and anomaly labels. It
exists to score models and to compute the oracle gap — *"the model captures 12%
of the achievable signal (oracle R² 0.52)"* — a number no real dataset can give
you. Joining it into a feature table invalidates every result.

## Designed-in signals

A feature with nothing to detect is vacuous. Each of these is engineered in:

- **Size mix** — suppliers ship fixed packs cut to the *national* size curve
  while this store's demand runs larger, so the retailer cannot buy the right
  mix even knowing it. Three subcategories invert the skew. The signal is in
  the leftovers, not the sold mix, which is censored by what was stocked.
- **Price elasticity** — markdowns chase slow sales, so a naive regression gets
  the sign wrong. 25% of products get randomised two-week price changes,
  independent of demand: the only clean identification in the data.
- **Return risk** — three distinct causes (fit, lot quality with a change-point
  at month 14, impulse buying at deep discount) so a model must disentangle
  them.
- **Festive demand** — real moving festival dates, and the **post-peak slump**.
  Without the slump a model learns festive demand is free and over-buys into
  the trough, which is the exact mistake the feature should prevent.

## Anomalies

~1.5% of invoices and inventory events, with hard negatives — legitimate
below-cost clearance, a documented stocktake write-off, a genuine pre-opening
wholesale order — labelled 0. Without those, a detector that flags every
below-cost line scores perfectly and precision means nothing.

**Over half the injected types are rule-detectable**: a deterministic integrity
check catches them at ~100% precision. Only the rest need a statistical model.
Worth saying plainly rather than promising ML for all of it.

Evaluate as ranking (precision@10/@25/@50, AUC-PR). At a 1.5% base rate,
accuracy is meaningless.

## Layout

```
constants.py     enums, taxonomy, barcode format — mirrored from the TypeScript
tables.py        CSV columns, load order, foreign keys
rng.py           the one seeded generator
config/          all tunables: params, calendar, seasonality, size curves, vocab
steps/           s01 store · s02 catalog · s03 simulate · s07 shrinkage · s08 anomalies
features/        as-of reconstruction, panel builders, labels, splits
checks/          integrity assertions, realism gate
tests/           schema-drift guards
```

`s03_simulate` runs procurement, demand, sales and returns on one clock. They
cannot be separate steps: the buyer reorders from observed sales, and sales are
censored by what the buyer previously bought.

## Tests

```bash
python -m pytest datagen/tests -q
```

These parse the actual `.ts` migrations and seed and assert `constants.py` has
not drifted. If a migration widens an enum, the test fails here rather than a
`\copy` failing weeks later.
