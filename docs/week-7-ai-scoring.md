# Week 7 — Offline AI Scoring and AI-Assisted Restocking

**Plan reference:** Week 7 (14–20 Sept), plan §2.13 AI-Assisted Restocking, §2.14 Offline AI Product Performance, §2.16 dashboard AI signals.
**Model:** `ownly-scoring-v1` — `Backend/src/services/ai/ai-scoring.ts`

## 1. What was delivered

| Week 7 deliverable | Where |
|---|---|
| Selling, demand, profitability, dead-stock and return-risk scores | `ai-scoring.ts` → `AiAnalysis.scores` |
| First-sale probability, 30-day sales, expected sell-through, clearance period | `AiAnalysis.forecast` |
| Recommended quantity and size-wise mix | `AiAnalysis.recommendation` |
| Strong Buy / Controlled Buy / Trial / Hold / Avoid | `recommendation.decision` |
| Product actions (Restock, Hold, Controlled Buy, Trial, Discount, Clearance, Avoid) and lifecycle stage | `recommendation.productAction`, `metrics.lifecycleStage` |
| Confidence, data sufficiency, written reasons | `AiAnalysis.confidence`, `AiAnalysis.reasons` |
| Owner can accept, modify, ignore or reject | `POST /api/ai/predictions/:id/decision`, AI Restock screen |
| Prediction, recommendation, owner decision and actual result stored | `ai_predictions` table (migration 009) |
| AI evaluation metrics and prediction-vs-actual dashboard | `/ai-insights`, `GET /api/ai/evaluation` |
| AI product analysis | Product page → "AI Product Analysis" |
| AI-assisted restocking screen | `/ai-restock` |

## 2. How to run it

```bash
cd Backend
npm run db:migrate                     # adds ai_predictions (009)
npm run data:load-synthetic            # optional: 36-month demo store (see §6)
npm run ai:backtest                    # replays the model over the last 12 months
npm test                               # unit + integration tests
```

The demo store owner is `arya.pawar@vastrabazaar.demo`; the password is `SYNTHETIC_OWNER_PASSWORD` in `Backend/.env` (set before loading).

## 3. How the model works

Everything is computed on the server from the store's own data — no external data, no network calls, no paid service (plan §3.2).

**Features, as of a moment T** (`ai-features.repository.ts`). Stock level at any date is rebuilt from `inventory_movements` before T; `inventory_items.status` and `invoice_items.status` are never read because they describe *today* and would leak the answer into a backtest. The same code serves "now" and "two years ago".

**Rates per in-stock day, weighted by size.** A garment only sells while on the shelf, and customers buy a size, not a product. A day counts in proportion to the share of demand whose sizes were actually in stock, so a best-seller that sold out in M and L is not mistaken for a slow mover.

**Borrowing strength from similar products.** A Gamma prior is fitted to comparable products' sales rates: CLIP photo matches (Week 6) first, then the same subcategory at a similar price; the category and the whole store only top the pool up to 5. A new garment uses its peers' first-60-day (launch) rates.

**Combining.** Gamma–Poisson update: prior + own units / own in-stock days. With little history the peers dominate; with months of history the product's own record does. There is no hand-tuned blend weight.

**Seasonality.** Next-30-days vs previous-90-days demand from the same weeks last year, per category, shrunk toward the store-wide ratio.

**Predictive distribution.** Negative Binomial (parameter uncertainty plus week-to-week demand noise). Demand is split across sizes and each size is capped by its own stock — 13 leftover size-S units cannot serve demand for M. Forecast, range, first-sale probability, sell-through, dead-stock risk and clearance period all come from this one distribution.

**Scores (0–100).**

| Score | Meaning |
|---|---|
| Demand | Percentile of the product's sales rate within the store's catalogue |
| Selling | Expected share of the stock held that sells in 30 days |
| Profitability | Percentile of expected 30-day gross-margin return on the stock's cost (realised price after discounts) |
| Dead-stock risk | Expected share of the stock held still unsold after 90 days |
| Return risk | Estimated return rate (own returns shrunk toward peers), scaled so 2.5× the store average = 100 |

**Decision rules** (in order): Hold if current stock covers ≥ 60 days (per size); Avoid if one more month of supply would mostly go unsold, or demand and profitability are both very low, or returns are extreme on a weak seller; Trial when data is insufficient; Strong Buy for an established product that is fast, profitable, low-risk, not return-prone and at least medium confidence; otherwise Controlled Buy if demand is reasonable. A brand-new garment is never a Strong Buy.

**Quantity and size mix.** Target stock is the 60th percentile of 45-day demand (Strong Buy) or the median of 30-day demand (Controlled Buy). Each size is bought up to its share of the target, minus what is already on hand. Leftover slow sizes never reduce the buy of sizes that sell. Size shares come from in-stock-adjusted per-size rates, shrunk toward the subcategory's curve.

**Confidence.** Combines own evidence (effective in-stock days), comparable-product evidence (count × match quality) and the width of the forecast distribution. Tiers: High ≥ 0.65, Medium ≥ 0.40.

## 4. Evaluation (backtest)

The model was replayed at 14 dates, 28 days apart, over the synthetic store's final year. It saw only data before each date and was scored on what sold in the next 30 days (7,698 product-months).

| Metric | Value |
|---|---|
| WAPE, model | **70.0%** |
| WAPE, carry-forward baseline ("next month = last month") | 73.5% |
| Improvement over baseline | 4.8% |
| Bias | −8.9% (predicts slightly fewer sales than happen) |
| q10–q90 range coverage | 80.7% (target ≈ 80%) |
| First-sale Brier score | 0.181 |

| Confidence | WAPE | | Decision | Actual 30-day sell-through |
|---|---|---|---|---|
| High | 58.1% | | Strong Buy | 35.0% |
| Medium | 68.7% | | Controlled Buy | 25.9% |
| Low | 95.1% | | Hold | 12.7% |
| | | | Avoid | 10.5% |

Confidence tiers and decisions both rank in the right order — the evidence that they carry information. A per-product 30-day WAPE near 70% is expected for low-volume clothing (most products sell 0–5 units a month). The generator was built to cap achievable accuracy at realistic levels (see `datagen/README.md`).

The forecast is conditioned on the purchase plan: in the backtest, the stock that actually arrived during the window; in the app, the owner's planned quantity.

## 5. Known limitations

- **Low-probability first sales are under-predicted.** Products given < 20% chance of a first sale sold 28% of the time. Treat low first-sale probabilities as "unlikely", not "almost impossible".
- **Slight under-forecast (−9%).** Left as is rather than patched with a fudge factor.
- **Modest lift over the baseline.** It beats carry-forward by ~5% on units; its larger value is in the per-size mix, the risk scores and the ranking of decisions.
- **Trained and tuned on synthetic data.** Parameters (`PARAMS` in `ai-scoring.ts`) were calibrated on the datagen store. Re-run `npm run ai:backtest` against a real store once it has ~6 months of sales, and re-check coverage and lift.
- **Photo peers need photos.** The synthetic products have none, so demo comparables come from subcategory and price. With photographed products, CLIP matches are used first.
- **New-garment predictions are not auto-evaluated.** A recommendation for a garment not yet in the catalogue has no product to track. It is stored with the owner's decision, but it cannot get an actual result.
- **Returned items re-entering stock** are counted from their return date. A second shelf life for the same item is approximate.

## 6. Synthetic demo data

`npm run data:load-synthetic` imports `datagen/out/db` as a separate store ("Vastra Bazaar (Synthetic Demo)"). Real stores are never read or modified.

- Global category, subcategory and attribute IDs are remapped by name to the seeded rows.
- All dates are shifted by whole days so the history ends today.
- `--replace` deletes and reloads only that store.

Regenerate the CSVs with `python -m datagen --profile standard --seed 42`.

## 7. API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/ai/overview` | reports:view |
| GET | `/api/ai/products/:id/analysis` | reports:view |
| POST | `/api/ai/restock/recommend` | inventory:edit |
| POST | `/api/ai/predictions/:id/decision` | inventory:edit |
| GET | `/api/ai/predictions` | reports:view |
| GET | `/api/ai/predictions/:id` | reports:view |
| GET | `/api/ai/evaluation?source=LIVE\|BACKTEST` | reports:view |

Analyses reveal cost and margin, so reading them needs `reports:view`. Accepting or modifying a recommendation with `execute: true` creates the stock in the same call: new unique barcodes, `RESTOCK` movements and a restock batch linked from the prediction. A second execution of the same recommendation is refused (409). Rejecting requires a reason. Every decision is written to the audit log.

## 8. Tests

- `tests/ai-scoring.test.ts` — 24 unit tests. Covers the distribution maths, the scoring rules (fast seller, covered, dead, size skew, leftover sizes, new garment, photo priority, oversized plan, confidence, return risk, seasonality) and the evaluation metrics.
- `tests/integration/ai_restock.test.ts` — 6 end-to-end API tests against the real database. Covers analysis logging, modify-and-execute restock with barcode uniqueness, the double-execution guard, rejection validation, new-garment handling, history, evaluation and overview.
