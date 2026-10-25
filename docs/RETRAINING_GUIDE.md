# Retraining the AI model on a store's own data

The AI restocking model ships with settings tuned on a synthetic demo store. This guide explains how to retrain it on **one real store's history** so its forecasts fit that store, and how the new model replaces the old one — safely, with one command, and reversibly.

> **What "retraining" means here.** The model (`ownly-scoring-v1`) is a statistical demand model, not a neural network. It already learns each store's sales *live*: peer averages, seasonality and size curves are recomputed from the store's own data on every request. What retraining adds is **tuning the model's settings** (how noisy demand is, how much older sales count, how strongly similar products pull on a new product…) to the values that would have predicted this store's past best. Those settings are the "trained model".

---

## 1. What the owner (or you) has to do

Only this:

1. Fill one Excel workbook (4 sheets) — **or** skip Excel if the store already uses Ownly for sales.
2. Run one command.
3. Read the report.

Everything else — cleaning, fixing gaps, feature engineering, tuning, testing on unseen months, replacing the live model — is automatic.

---

## 2. Quick start (5 minutes)

Prerequisites: the backend is set up (`Backend/.env` has `DATABASE_URL`; `npm run db:migrate` and `npm run db:seed` were run — the seed provides the category list).

```bash
cd Backend

# 1. Generate the template and a sample workbook (60 products, 15 months of made-up history)
npm run ai:retrain-sample
#    → model/sample/retraining_template.xlsx      (empty template with instructions)
#    → model/sample/retraining_sample_data.xlsx   (ready-to-run example)

# 2. Try it without changing anything
npm run ai:retrain -- --excel model/sample/retraining_sample_data.xlsx --dry-run

# 3. Run it for real
npm run ai:retrain -- --excel model/sample/retraining_sample_data.xlsx
```

It takes about 30 seconds on the sample. The last lines tell you the result and where the report is:

```
RESULT: REPLACED            (or KEPT / REJECTED_DATA / NOT_ENOUGH_HISTORY / WOULD_REPLACE)
Report: Backend/model/runs/20261025-145911
```

### For a real store, using Excel

1. Copy `model/sample/retraining_template.xlsx`, open it, read the **Instructions** sheet.
2. Delete the example rows, paste the store's history into **Products**, **Purchases**, **Sales** (and **Returns** if tracked).
3. Save, then: `npm run ai:retrain -- --excel path/to/store_history.xlsx --dry-run` and, if happy, without `--dry-run`.

### For a real store already using Ownly (no Excel)

```bash
npm run ai:retrain -- --store <store-id> --dry-run
npm run ai:retrain -- --store <store-id>
```

The same pipeline runs directly on the sales already in the database.

---

## 3. The Excel workbook

One file, four data sheets plus an Instructions sheet (ignored by the script). Sheet names and header names are matched loosely (capitals, spaces and underscores don't matter; `SKU`, `Qty`, `Bill No` are accepted too).

### Products — one row per design
| Column | Needed | What to type | Example |
|---|---|---|---|
| `product_code` | **Yes** | Your unique code. Used in every other sheet. | `KUR-001` |
| `product_name` | No | Name. | `Cotton Straight Kurta - Blue` |
| `category` | **Yes** | One of the app's categories (listed on the Instructions sheet). | `Women's Ethnic` |
| `subcategory` | No | A subcategory of that category. Improves peer matching. | `Kurtas` |
| `selling_price` | **Yes** | Usual tag price, ₹, numbers only. | `1299` |
| `cost_price` | No | Cost per piece. Blank → 60% of price assumed (affects profit scores only). | `780` |
| `supplier` | No | Supplier name. | `Shreeji Textiles` |

### Purchases — every time stock arrived
| Column | Needed | What to type | Example |
|---|---|---|---|
| `date` | **Yes** | Day it arrived. | `2026-03-31` |
| `product_code` | **Yes** | Must be in Products. | `KUR-001` |
| `size` | No | `S`, `M`, `L`, `XL`, `28`… blank or "Free Size" for one-size. | `M` |
| `quantity` | **Yes** | Whole number > 0. **Enter opening stock as a purchase on day one.** | `20` |
| `unit_cost` | No | Cost per piece for this lot. | `780` |

### Sales — one row per product-size per bill
| Column | Needed | What to type | Example |
|---|---|---|---|
| `date` | **Yes** | Day of sale. | `2026-04-05` |
| `invoice_no` | No | Same number + date = one bill. Blank → each row its own bill. | `INV-1042` |
| `product_code` | **Yes** | Must be in Products. | `KUR-001` |
| `size` | No | Same rules as Purchases. | `M` |
| `quantity` | **Yes** | Whole number > 0. | `1` |
| `unit_price` | No | Price charged per piece. Blank → product selling price. | `1299` |
| `discount` | No | **Total** ₹ discount on the line (not per piece, not %). | `100` |

### Returns — optional
| Column | Needed | What to type | Example |
|---|---|---|---|
| `date` | **Yes** | Day returned. | `2026-04-12` |
| `invoice_no` | No | Bill it was sold on (helps matching). | `INV-1042` |
| `product_code` | **Yes** | Must be in Products. | `KUR-001` |
| `size` | No | Size returned. | `M` |
| `quantity` | **Yes** | Pieces returned. | `1` |
| `reason` | No | Short text. | `Size issue` |

**Dates** can be real Excel dates, or text as `2026-03-31` or `31/03/2026` (day first). Future dates are ignored.
**How much history:** at least about **9 months** of sales; 12+ is better; more than one festive season is ideal.

---

## 4. What the script does (the pipeline)

```
Excel ─▶ 1 Read ─▶ 2 Clean ─▶ 3 Stage ─▶ 4 Features ─▶ 5 Tune ─▶ 6 Judge ─▶ 7 Replace ─▶ 8 Report
```

1. **Read.** Opens the workbook, tolerates header spelling, title rows, blank lines, formulas. A missing sheet or required column stops it with a clear message.
2. **Clean (preprocessing).** Trims text, upper-cases product codes, standardises sizes (`m` → `M`, `Free Size` → `One Size`), parses dates and money (`₹1,299`), matches categories to the app's list, rounds fractional quantities. Rows that can't be used (unknown product, bad date or quantity, future date) are **skipped and listed with their Excel row number**. Small gaps are filled with stated assumptions (missing cost, missing sale price).
   **Stock reconciliation:** every product-size's purchases, sales and returns are replayed in date order (oldest stock sold first). A sale with no stock behind it gets an *assumed* purchase the day before — counted and reported. Returns are matched to the sale they reverse and the piece goes back on the shelf.
3. **Stage.** Loads the clean history into the database as a **temporary, isolated store** (invisible to real stores, deleted when the run ends, even on failure). This is deliberate: features are then built by *the exact code the live app uses*, so the model is never tuned on features it won't see in production.
4. **Feature engineering.** At each of ~12 past dates (every 28 days) the script rebuilds, for every product, what was knowable *then* — never anything later:
   - **In-stock days** in the last 30 / 31–90 / 180 days and in the first 60 days after launch (a product only sells while on the shelf, so rates are per in-stock day, weighted by which sizes were available);
   - **Units sold** in the last 7 / 15 / 30 / 31–90 / 180 days, lifetime, and in the launch period;
   - **Stock now**, average **stock age**, average cost in stock;
   - **Price realisation** (discounted units, realised vs list revenue) and **returns**;
   - **Seasonality** — next-30 vs previous-90 days from the same weeks last year, per category;
   - **Peer prior** — sales rates of comparable products (same subcategory and price band);
   - **What actually sold in the next 30 days** — the label.
   The full table is saved to `features.csv` in the run folder.
5. **Tune (training).** The earlier dates are used to search the model's settings (7 settings, ~50 combinations, deterministic coordinate search). The search minimises forecast error plus first-sale probability error, while keeping the forecast ranges honest (q10–q90 coverage 72–88%, bias within ±15%).
6. **Judge.** The newest ~quarter of dates (min. 2), **never touched during tuning**, with one date skipped between the sets (windows overlap by 2 days), score both the *current live settings* and the *new* ones.
7. **Replace — only if all of these hold:**
   - the new settings beat the current ones on the unseen months by at least 0.5%;
   - ranges and bias stay within safe limits on those months (coverage 68–92%, bias ±30%, or no worse than the current model);
   - enough data: ≥ 6 test dates, ≥ 300 predictions in total, ≥ 100 held out (`--force` skips only this data-size check).
   If anything fails, **the current model is kept** and the report says exactly why.
8. **Report.** Writes `model/runs/<timestamp>/`.

### How the new model replaces the old one
The result is one file: `Backend/model/active-model.json` (settings, version name `ownly-scoring-v1+tuned-<timestamp>`, what it was trained on, before/after scores). The previous model is copied to `model/archive/`.
**The running API notices the new file on its next analysis — no restart, no redeploy.** Every stored prediction carries the model version, so old and new predictions can be compared.
If the file is missing, corrupt or has out-of-range values, the API falls back to the shipped model.

```bash
npm run ai:retrain -- --status      # which model is live, what it was trained on
npm run ai:retrain -- --rollback    # restore the previous model (repeat to step further back)
```

---

## 5. Reading the result

| Result | Meaning | What to do |
|---|---|---|
| `REPLACED` | New model beat the old one on unseen months and is live. | Check `report.md`; nothing else needed. |
| `WOULD_REPLACE` | Same, but `--dry-run` so nothing changed. | Run again without `--dry-run`. |
| `KEPT` | Tuning ran, but the candidate wasn't clearly better or failed a safety check. **This is a normal, healthy outcome**, especially when the current settings already fit. | Nothing. The reasons are in the report. |
| `REJECTED_DATA` | The data can't be trusted (e.g. >10% of sales rows unusable, >25% of sold units have no purchase, product rows rejected). | Fix what the report lists (row numbers given) and re-run. |
| `NOT_ENOUGH_HISTORY` | Fewer than 6 test dates fit in the history. | Add more history, or wait. |

`report.md` contains: the verdict and reasons, rows read/used per sheet, every fixed or skipped row, a before/after table (forecast error, range coverage, bias, first-sale score) on the unseen months, and the settings that changed. Files in each run folder: `report.md`, `report.json`, `features.csv`, `data-issues.csv`.

**Exit codes** (for scheduling): `0` finished (replaced, kept or would-replace), `2` data/history problem, `1` unexpected failure.

---

## 6. Common problems

| Message | Cause | Fix |
|---|---|---|
| `The "Sales" sheet is missing` | Sheet renamed or absent. | Use the template; sheet names: Products, Purchases, Sales, Returns. |
| `"Products" has no "category" column` | Header missing or misspelled beyond recognition. | Use the headers in section 3. |
| `category "X" is not one of the app's categories` | Category typed differently. | Use a name from the Instructions sheet's list. |
| `… have no recorded purchase` | Purchases sheet incomplete. | Add stock received **including opening stock** as a purchase on day one. |
| `Only N days of history` / `NOT_ENOUGH_HISTORY` | Too little history. | Provide ≥ 9 months. |
| `Could not open … as an .xlsx file` | Old `.xls`, CSV renamed, or file open/locked in Excel. | Save as `.xlsx`; close Excel. |
| `No clothing categories found` | Seed not run. | `npm run db:seed`. |

---

## 7. Safety, scope and limits (be upfront about these)

- **One live model per deployment.** `active-model.json` applies to the whole app. If one deployment hosts several stores, retraining on one store changes forecasts for all; per-store model files are a future step.
- **Only 7 settings are tuned** (demand noise, weight of older sales, peer-prior strength min/max, peers needed/used, peer price band). Size-mix and return priors, and decision rules, are unchanged.
- **Small data → small, cautious changes.** With a few hundred products-months, differences between settings are within noise; the unseen-months test and the 0.5% bar exist to stop the script chasing noise. Expect `KEPT` often — that means the shipped settings already fit.
- **The sample workbook is made-up data.** Its results demonstrate that the pipeline works; they say nothing about real accuracy.
- **Forecasts stay modest.** Per-product 30-day forecasts for low-volume clothing are inherently noisy; retraining improves fit and calibration, not the underlying randomness.
- **Excel quality still matters.** The cleaner fixes formatting and gaps, not wrong numbers (e.g. a sale typed on the wrong day).
- **Staging store.** Runs write temporary rows to the database (a separate store) and delete them at the end. If a run is killed mid-way, a store named `[retraining …]` may remain; it is invisible to real users and can be deleted safely.
- **Monitoring is separate.** After replacing a model, watch the AI Insights page (prediction vs actual); re-run retraining about every 6 months, or when coverage drifts from ~80%.

---

## 8. Reference

| Command | Purpose |
|---|---|
| `npm run ai:retrain-sample` | Write the template and sample workbook to `model/sample/` |
| `npm run ai:retrain -- --excel <file.xlsx>` | Retrain from a workbook |
| `npm run ai:retrain -- --store <id>` | Retrain from a store's data in the app |
| `… --dry-run` | Do everything except replace the model |
| `… --force` | Skip the data-size checks (demos, small samples). Accuracy checks always apply. |
| `… --months N` | How far back to test (default 12) |
| `npm run ai:retrain -- --status` / `--rollback` | Show / undo the live model |
| `npm run ai:backtest` | The original backtest for the live model |

| Path | Contents |
|---|---|
| `Backend/model/active-model.json` | The live retrained model (absent = shipped model) |
| `Backend/model/archive/` | Models that were replaced |
| `Backend/model/runs/<time>/` | Reports and feature tables (not committed to git) |
| `Backend/model/sample/` | Template and sample workbook |
| `Backend/src/retraining/` | Pipeline code: `excel-reader`, `preprocess`, `stage`, `tuner`, `pipeline` |
| `Backend/src/services/ai/model-registry.ts` | Loads, installs and rolls back models |
| `Backend/tests/retraining.test.ts` | Unit tests for cleaning, Excel reading, splitting and replacement |
