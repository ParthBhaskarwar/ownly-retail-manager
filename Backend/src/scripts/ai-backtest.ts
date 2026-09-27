/**
 * ai-backtest — replays the scoring model at historical dates and scores it.
 *
 *   npm run ai:backtest                          # synthetic store, last 12 months, every 28 days
 *   npm run ai:backtest -- --store <uuid> --months 18 --every 14
 *   npm run ai:backtest -- --dry-run             # print metrics, write nothing
 *
 * For each as-of date T the model sees ONLY rows dated before T (see
 * ai-features.repository), predicts the next 30 days for every product that
 * was on sale, and is then compared with what really sold in [T, T+30).
 * Results are stored as source = 'BACKTEST' so the evaluation dashboard can
 * show a track record without mixing it with live predictions.
 *
 * The forecast is conditioned on the stock that actually arrived during the
 * window — in live use that is the owner's planned purchase, an input.
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '@/db/client';
import { AiFeaturesRepository } from '@/services/ai/ai-features.repository';
import { analyseAll, HORIZON_DAYS } from '@/services/ai/ai-scoring';
import { AiPredictionRepository, toRow, type PredictionRow } from '@/services/ai/ai-prediction.repository';
import { summarise } from '@/services/ai/ai-evaluation.service';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function syntheticStoreId(): string | undefined {
  const manifest = path.resolve(__dirname, '../../../datagen/out/manifest.json');
  if (!fs.existsSync(manifest)) return undefined;
  return (JSON.parse(fs.readFileSync(manifest, 'utf8')) as { store_id: string }).store_id;
}

async function main(): Promise<void> {
  const storeId = arg('store') ?? syntheticStoreId();
  if (!storeId) throw new Error('Pass --store <uuid> (no synthetic manifest found).');
  const months = Number(arg('months') ?? 12);
  const every = Number(arg('every') ?? 28);
  const dryRun = process.argv.includes('--dry-run');

  const end = new Date(Date.now() - HORIZON_DAYS * 86_400_000);
  const start = new Date(end.getTime() - months * 30.4 * 86_400_000);
  const dates: Date[] = [];
  for (let t = end.getTime(); t >= start.getTime(); t -= every * 86_400_000) dates.unshift(new Date(t));

  console.log(`Backtesting store ${storeId}: ${dates.length} as-of dates, every ${every} days, ${HORIZON_DAYS}-day horizon.`);
  if (!dryRun) {
    const removed = await AiPredictionRepository.deleteBacktests(storeId);
    if (removed) console.log(`Removed ${removed} previous backtest predictions.`);
  }

  const all: PredictionRow[] = [];
  for (const asOf of dates) {
    const horizonEnd = new Date(asOf.getTime() + HORIZON_DAYS * 86_400_000);
    const [features, actuals] = await Promise.all([
      AiFeaturesRepository.loadStoreFeatures(storeId, asOf),
      AiFeaturesRepository.loadActuals(storeId, asOf, horizonEnd),
    ]);
    const received = new Map([...actuals.values()].map((a) => [a.productId, a.unitsReceived]));
    const receivedBySize = new Map([...actuals.values()].map((a) => [a.productId, a.receivedBySize]));
    const analyses = analyseAll(features, { received, receivedBySize })
      // Only products that could actually sell: stock at T or stock arriving.
      .filter((a) => a.subject.stockOnHand > 0 || (received.get(a.subject.productId!) ?? 0) > 0);

    const rows = analyses.map((a) => {
      const act = actuals.get(a.subject.productId!);
      const units = act?.units ?? 0;
      const held = a.forecast.stockAssumed;
      return toRow(a, { storeId, analysisType: 'PRODUCT_ANALYSIS', source: 'BACKTEST' }, {
        actualUnits: units,
        actualSellThrough: held > 0 ? Math.min(1, units / held) : null,
        actualFirstSaleAt: act?.firstSaleAt ?? null,
      });
    });
    if (!dryRun) await AiPredictionRepository.insertMany(rows);

    for (const r of rows) {
      all.push({
        predictedUnits: r.predicted_units, predictedUnitsQ10: r.predicted_units_q10, predictedUnitsQ90: r.predicted_units_q90,
        baselineUnits: r.baseline_units, actualUnits: r.actual_units, actualSellThrough: r.actual_sell_through,
        firstSaleProbability: r.first_sale_probability, expectedSellThrough: r.expected_sell_through,
        stockAtAsOf: r.stock_at_as_of, confidenceTier: r.confidence_tier, decision: r.decision,
        asOf: r.as_of, modelVersion: r.model_version,
      } as unknown as PredictionRow);
    }
    const predicted = rows.reduce((s, r) => s + Number(r.predicted_units), 0);
    const actual = rows.reduce((s, r) => s + Number(r.actual_units), 0);
    console.log(`  ${asOf.toISOString().slice(0, 10)}  products ${String(rows.length).padStart(4)}  predicted ${predicted.toFixed(0).padStart(5)}  actual ${String(actual).padStart(5)}`);
  }

  const s = summarise('BACKTEST', all, { ACCEPTED: 0, MODIFIED: 0, IGNORED: 0, REJECTED: 0, PENDING: 0 });
  const p = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
  console.log('\nForecast (30-day units per product)');
  console.log(`  predictions         ${s.count}`);
  console.log(`  WAPE model          ${p(s.forecast.wape)}`);
  console.log(`  WAPE carry-forward  ${p(s.forecast.baselineWape)}`);
  console.log(`  lift over baseline  ${p(s.forecast.liftOverBaseline)}`);
  console.log(`  bias                ${p(s.forecast.bias)}`);
  console.log(`  q10–q90 coverage    ${p(s.forecast.intervalCoverage)}  (target ~80%)`);
  console.log(`  first-sale Brier    ${s.firstSale.brier ?? '—'}`);
  for (const b of s.firstSale.buckets) console.log(`    ${b.range.padEnd(9)} n=${String(b.count).padStart(5)} predicted ${p(b.predicted)} actual ${p(b.actual)}`);
  console.log('By confidence tier');
  for (const t of s.byTier) console.log(`  ${t.tier.padEnd(7)} n=${String(t.count).padStart(5)}  WAPE ${p(t.wape)}  coverage ${p(t.coverage)}`);
  console.log('By decision');
  for (const d of s.byDecision) {
    console.log(`  ${d.decision.padEnd(15)} n=${String(d.count).padStart(5)}  sell-through predicted ${p(d.predictedSellThrough)} actual ${p(d.actualSellThrough)}  avg units ${d.avgActualUnits}`);
  }
}

main()
  .catch((err) => {
    console.error('Backtest failed:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
