/**
 * Retraining pipeline: read → clean → stage → engineer features → tune →
 * judge on unseen months → replace the live model (or explain why not) → report.
 *
 * One entry point, used by the CLI (scripts/ai-retrain.ts) and by tests.
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '@/db/client';
import { activateModel, analyseAll, clearScoringCaches, DEFAULT_PARAMS, type ModelParams } from '@/services/ai/ai-scoring';
import { ModelRegistry, type ActiveModel, type ModelMetrics } from '@/services/ai/model-registry';
import { readWorkbook } from './excel-reader';
import { preprocess } from './preprocess';
import { stageDataset } from './stage';
import {
  asOfDates, evaluate, loadSnapshots, sameParams, search, splitDates,
  type SearchStep, type Snapshot,
} from './tuner';
import type { CategoryCatalog, Issue, QualityReport } from './types';

export interface RetrainOptions {
  excel?: string;
  storeId?: string;
  months: number;
  dryRun: boolean;
  /** Skip the data-size gates (never the accuracy checks). For demos and small samples. */
  force: boolean;
  log: (line: string) => void;
}

export type Verdict = 'REPLACED' | 'WOULD_REPLACE' | 'KEPT' | 'REJECTED_DATA' | 'NOT_ENOUGH_HISTORY';

export interface RetrainResult {
  verdict: Verdict;
  reasons: string[];
  runDir: string;
  version: string | null;
  current: ModelParams;
  candidate: ModelParams | null;
  holdout: { current: ModelMetrics; candidate: ModelMetrics } | null;
  quality: QualityReport | null;
}

const MIN_DATES = 6;
const MIN_TOTAL_PREDICTIONS = 300;
const MIN_HOLDOUT_PREDICTIONS = 100;
const MIN_RELATIVE_IMPROVEMENT = 0.005;
/** Wider than the tuning guardrails because the held-out set is small. */
const HOLDOUT_LIMITS = { coverageMin: 0.68, coverageMax: 0.92, maxAbsBias: 0.30 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadCatalog(): Promise<CategoryCatalog> {
  const cats = (await db.raw(
    `SELECT id, name FROM categories WHERE store_id IS NULL AND retail_template_id = 'tpl_clothing' ORDER BY name`
  )).rows as Array<{ id: string; name: string }>;
  const subs = (await db.raw(
    `SELECT s.id, s.name, s.category_id AS "categoryId" FROM subcategories s
       JOIN categories c ON c.id = s.category_id
      WHERE s.store_id IS NULL AND c.retail_template_id = 'tpl_clothing'`
  )).rows as Array<{ id: string; name: string; categoryId: string }>;
  if (!cats.length) throw new Error('No clothing categories found in the database. Run: npm run db:seed');
  return { categories: cats, subcategories: subs };
}

async function storeSpan(storeId: string): Promise<{ first: Date | null; last: Date | null; products: number; saleLines: number }> {
  const r = (await db.raw(
    `SELECT (SELECT MIN(performed_at) FROM inventory_movements WHERE store_id = ?) AS first,
            (SELECT MAX(created_at) FROM invoices WHERE store_id = ? AND status <> 'CANCELLED') AS last,
            (SELECT COUNT(*) FROM products WHERE store_id = ?) AS products,
            (SELECT COUNT(*) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.store_id = ?) AS lines`,
    [storeId, storeId, storeId, storeId]
  )).rows[0] as { first: string | null; last: string | null; products: string; lines: string };
  return {
    first: r.first ? new Date(r.first) : null, last: r.last ? new Date(r.last) : null,
    products: Number(r.products), saleLines: Number(r.lines),
  };
}

const pct = (x: number | null, d = 1) => (x === null ? '—' : `${(x * 100).toFixed(d)}%`);
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function retrain(opts: RetrainOptions): Promise<RetrainResult> {
  const { log } = opts;
  const runStamp = stamp();
  const runDir = path.join(ModelRegistry.modelDir(), 'runs', runStamp);
  fs.mkdirSync(runDir, { recursive: true });

  ModelRegistry.applyActive();
  const live = ModelRegistry.readActive();
  const current: ModelParams = live ? structuredClone(live.params) : structuredClone(DEFAULT_PARAMS) as ModelParams;
  const currentVersion = live?.version ?? 'ownly-scoring-v1';

  const finish = (r: Omit<RetrainResult, 'runDir' | 'current'>): RetrainResult => {
    const result: RetrainResult = { ...r, runDir, current };
    fs.writeFileSync(path.join(runDir, 'report.md'), renderReport(result, currentVersion, opts, extra));
    fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({ ...result, extra }, null, 2));
    return result;
  };
  const extra: ReportExtra = { steps: [], trials: 0, dates: [], train: 0, holdoutN: 0, source: '', products: 0, saleLines: 0, from: null, to: null };

  // 1. Source ────────────────────────────────────────────────────────────────
  let storeId: string;
  let cleanup: (() => Promise<void>) | null = null;
  let quality: QualityReport | null = null;
  let first: Date | null, last: Date | null;

  try {
    if (opts.excel) {
      log(`Reading ${opts.excel} …`);
      const { data, problems } = await readWorkbook(opts.excel);
      const catalog = await loadCatalog();
      const pre = preprocess(data, catalog);
      quality = pre.quality;
      for (const p of problems) quality.blockers.unshift(p);
      writeIssues(runDir, quality.issues);

      log(`  rows read     products ${quality.rowsRead.products}, purchases ${quality.rowsRead.purchases}, sales ${quality.rowsRead.sales}, returns ${quality.rowsRead.returns}`);
      log(`  rows usable   products ${quality.rowsUsed.products}, purchases ${quality.rowsUsed.purchases}, sales ${quality.rowsUsed.sales}, returns ${quality.rowsUsed.returns}`);
      log(`  history       ${quality.firstDate ?? '—'} to ${quality.lastDate ?? '—'} (${quality.historyDays} days), ${quality.issues.filter((i) => i.level !== 'info').length} issue(s) noted`);

      if (quality.blockers.length && !(opts.force && onlyHistoryBlockers(quality))) {
        return finish({ verdict: 'REJECTED_DATA', reasons: quality.blockers, version: null, candidate: null, holdout: null, quality });
      }

      log('Staging a temporary copy of the data in the database …');
      const staged = await stageDataset(pre.dataset, path.basename(opts.excel));
      storeId = staged.storeId; cleanup = staged.cleanup;
      first = quality.firstDate ? new Date(quality.firstDate + 'T00:00:00Z') : null;
      last = quality.lastDate ? new Date(quality.lastDate + 'T00:00:00Z') : null;
      extra.source = `Excel: ${path.basename(opts.excel)}`;
      extra.products = pre.dataset.products.length; extra.saleLines = quality.unitsSold;
    } else if (opts.storeId) {
      storeId = opts.storeId;
      const span = await storeSpan(storeId);
      if (!span.first || !span.last || span.saleLines === 0) {
        return finish({ verdict: 'REJECTED_DATA', reasons: ['That store has no sales to learn from.'], version: null, candidate: null, holdout: null, quality: null });
      }
      first = span.first; last = span.last;
      extra.source = `Store ${storeId}`; extra.products = span.products; extra.saleLines = span.saleLines;
      log(`Using store ${storeId}: ${span.products} products, ${span.saleLines} sale lines, ${first.toISOString().slice(0, 10)} to ${last.toISOString().slice(0, 10)}.`);
    } else {
      throw new Error('Pass --excel <file.xlsx> or --store <store-id>.');
    }
    extra.from = first!.toISOString().slice(0, 10); extra.to = last!.toISOString().slice(0, 10);

    // 2. Dates + features ────────────────────────────────────────────────────
    const dates = asOfDates(first!, last!, opts.months);
    extra.dates = dates.map((d) => d.toISOString().slice(0, 10));
    if (dates.length < MIN_DATES && !opts.force) {
      return finish({
        verdict: 'NOT_ENOUGH_HISTORY',
        reasons: [`Only ${dates.length} test date(s) fit in this history; at least ${MIN_DATES} are needed (about 9 months of sales). Add more history, or use --force to try anyway.`],
        version: null, candidate: null, holdout: null, quality,
      });
    }
    if (dates.length < 3) {
      return finish({ verdict: 'NOT_ENOUGH_HISTORY', reasons: [`Only ${dates.length} test date(s) fit; even --force needs 3.`], version: null, candidate: null, holdout: null, quality });
    }

    log(`Engineering features at ${dates.length} past dates (every 28 days, ${extra.dates[0]} → ${extra.dates[dates.length - 1]}) …`);
    const snapshots = await loadSnapshots(storeId, dates, (i, n) => log(`  features ${i}/${n}`));

    // 3. Tune ────────────────────────────────────────────────────────────────
    const { train, holdout, purged } = splitDates(snapshots);
    extra.train = train.length; extra.holdoutN = holdout.length;
    log(`Split by time: ${train.length} dates to tune on, ${purged ? '1 skipped, ' : ''}${holdout.length} held out for judging.`);

    const trainBefore = evaluate(current, train, storeId, current);
    log(`Current settings on training months: error ${pct(trainBefore.wape)}, range coverage ${pct(trainBefore.intervalCoverage)}.`);
    log('Searching settings …');
    const found = search(current, train, storeId, (n) => { if (n % 10 === 0) log(`  tried ${n} settings`); });
    extra.steps = found.steps; extra.trials = found.trials;
    log(`Tried ${found.trials} settings; ${found.steps.length} change(s) kept.`);

    // 4. Judge on months the search never saw ───────────────────────────────
    const holdCurrent = evaluate(current, holdout, storeId, current);
    const holdCandidate = evaluate(found.params, holdout, storeId, current);
    const totalPredictions = evaluate(found.params, snapshots, storeId, current).predictions;

    const reasons: string[] = [];
    let ok = true;
    if (sameParams(found.params, current)) { ok = false; reasons.push('The search found nothing better than the current settings.'); }
    // Safety: the new settings must keep ranges honest and bias small. If the live model already
    // breaks a limit on these months, the new one only has to be no worse on that measure.
    const covGap = (m: ModelMetrics) => Math.abs((m.intervalCoverage ?? 0) - 0.8);
    const absBias = (m: ModelMetrics) => Math.abs(m.bias ?? 1);
    // The held-out set is only a few dates, so its numbers are noisier than the tuning months':
    // the limits are wider here, and "no worse than the current model" also passes.
    const covOk = (holdCandidate.intervalCoverage ?? 0) >= HOLDOUT_LIMITS.coverageMin && (holdCandidate.intervalCoverage ?? 0) <= HOLDOUT_LIMITS.coverageMax
      || covGap(holdCandidate) <= covGap(holdCurrent) + 0.02;
    const biasOk = absBias(holdCandidate) <= HOLDOUT_LIMITS.maxAbsBias || absBias(holdCandidate) <= absBias(holdCurrent) + 0.02;
    if (!(covOk && biasOk)) {
      ok = false;
      reasons.push(`The new settings fail the safety check on unseen months (range coverage ${pct(holdCandidate.intervalCoverage)}, allowed ${pct(HOLDOUT_LIMITS.coverageMin, 0)}–${pct(HOLDOUT_LIMITS.coverageMax, 0)}; bias ${pct(holdCandidate.bias)}, allowed ±${pct(HOLDOUT_LIMITS.maxAbsBias, 0)}).`);
    }
    // Compare on error and first-sale accuracy only; the safety check above handles calibration.
    const raw = (m: ModelMetrics) => (m.wape ?? Infinity) + 0.5 * (m.brier ?? Infinity);
    const objCur = raw(holdCurrent), objNew = raw(holdCandidate);
    if (!(objNew <= objCur * (1 - MIN_RELATIVE_IMPROVEMENT))) {
      ok = false;
      reasons.push(`The new settings are not clearly better on unseen months (score ${objNew.toFixed(3)} vs ${objCur.toFixed(3)}; they must beat the current ones by at least ${MIN_RELATIVE_IMPROVEMENT * 100}%).`);
    }
    if (!opts.force && (totalPredictions < MIN_TOTAL_PREDICTIONS || holdCandidate.predictions < MIN_HOLDOUT_PREDICTIONS)) {
      ok = false;
      reasons.push(`Too little data to trust a change (${totalPredictions} predictions in total, ${holdCandidate.predictions} held out; need ${MIN_TOTAL_PREDICTIONS} and ${MIN_HOLDOUT_PREDICTIONS}).`);
    }

    // Feature table for transparency (candidate settings, all dates).
    writeFeatureTable(runDir, snapshots, found.params, current);

    const holdoutPair = { current: holdCurrent, candidate: holdCandidate };
    if (!ok) {
      log('Result: current model kept.');
      return finish({ verdict: 'KEPT', reasons, version: null, candidate: found.params, holdout: holdoutPair, quality });
    }

    // 5. Replace ─────────────────────────────────────────────────────────────
    const version = `ownly-scoring-v1+tuned-${runStamp}`;
    const model: ActiveModel = {
      schema: 1, version, baseVersion: 'ownly-scoring-v1', params: found.params,
      trainedAt: new Date().toISOString(),
      trainedOn: { source: opts.excel ? 'excel' : 'store', label: extra.source, from: extra.from, to: extra.to, products: extra.products, saleLines: extra.saleLines },
      holdout: holdCandidate, previousHoldout: holdCurrent, previousVersion: currentVersion,
    };
    reasons.push('The new settings beat the current ones on months they were not tuned on, and pass the safety checks.');
    if (opts.dryRun) {
      log('Result: would replace the model (dry run — nothing written).');
      return finish({ verdict: 'WOULD_REPLACE', reasons, version, candidate: found.params, holdout: holdoutPair, quality });
    }
    ModelRegistry.install(model);
    log(`Result: model replaced → ${version}. The running API picks it up on its next analysis.`);
    return finish({ verdict: 'REPLACED', reasons, version, candidate: found.params, holdout: holdoutPair, quality });
  } finally {
    if (cleanup) {
      try { await cleanup(); log('Temporary staging data removed.'); }
      catch (err) { log(`Warning: could not remove the temporary staging store: ${(err as Error).message}`); }
    }
  }
}

/** With --force, only the history-length blocker may be overridden; bad or incomplete data never is. */
function onlyHistoryBlockers(q: QualityReport): boolean {
  return q.blockers.every((b) => b.startsWith('Only ') && b.includes('days of history'));
}

// ─── Output files ─────────────────────────────────────────────────────────────

function writeIssues(dir: string, issues: Issue[]): void {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ['level,sheet,row,message', ...issues.map((i) => [i.level, i.sheet, i.row ?? '', esc(i.message)].join(','))];
  fs.writeFileSync(path.join(dir, 'data-issues.csv'), lines.join('\r\n'));
}

function writeFeatureTable(dir: string, snapshots: Snapshot[], params: ModelParams, restore: ModelParams): void {
  const header = ['as_of', 'product_code', 'product', 'category', 'subcategory', 'selling_price', 'cost_price', 'stock_at_as_of',
    'avg_stock_age_days', 'in_stock_days_30', 'in_stock_days_31_90', 'in_stock_days_180', 'units_7', 'units_15', 'units_30',
    'units_31_90', 'units_180', 'units_lifetime', 'discounted_units', 'returns', 'launch_units', 'launch_in_stock_days',
    'actual_units_next_30', 'predicted_units_next_30', 'predicted_q10', 'predicted_q90'];
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const out: string[] = [header.join(',')];

  activateModel('features', params);
  try {
    for (const s of snapshots) {
      const received = new Map([...s.actuals.values()].map((a) => [a.productId, a.unitsReceived]));
      const bySize = new Map([...s.actuals.values()].map((a) => [a.productId, a.receivedBySize]));
      const predicted = new Map(analyseAll(s.features, { received, receivedBySize: bySize }).map((a) => [a.subject.productId!, a]));
      for (const p of s.features.products) {
        const a = predicted.get(p.productId);
        out.push([
          s.asOf.toISOString().slice(0, 10), p.baseSku, p.name, p.categoryName, p.subcategoryName, p.sellingPrice, p.costPrice,
          p.stockNow, p.avgStockAgeDays?.toFixed(1), p.inStockDays30.toFixed(1), p.inStockDays31to90.toFixed(1), p.inStockDays180.toFixed(1),
          p.units7, p.units15, p.units30, p.units31to90, p.units180, p.unitsLifetime, p.discountedUnits, p.returns, p.launchUnits,
          p.launchInStockDays.toFixed(1), s.actuals.get(p.productId)?.units ?? 0, a?.forecast.expectedSales, a?.forecast.expectedSalesQ10, a?.forecast.expectedSalesQ90,
        ].map(esc).join(','));
      }
    }
  } finally {
    activateModel('restored', restore);
    clearScoringCaches();
  }
  fs.writeFileSync(path.join(dir, 'features.csv'), out.join('\r\n'));
}

// ─── Report ───────────────────────────────────────────────────────────────────

interface ReportExtra {
  steps: SearchStep[]; trials: number; dates: string[]; train: number; holdoutN: number;
  source: string; products: number; saleLines: number; from: string | null; to: string | null;
}

const VERDICT_TEXT: Record<Verdict, string> = {
  REPLACED: 'The model was replaced with the retrained one.',
  WOULD_REPLACE: 'Dry run: the retrained model would replace the current one. Nothing was changed.',
  KEPT: 'The current model was kept. The retrained candidate was not good enough to replace it.',
  REJECTED_DATA: 'Training did not run: the data needs fixing first.',
  NOT_ENOUGH_HISTORY: 'Training did not run: there is not enough history yet.',
};

function renderReport(r: RetrainResult, currentVersion: string, opts: RetrainOptions, x: ReportExtra): string {
  const L: string[] = [];
  L.push('# Retraining report', '');
  L.push(`**Result:** ${VERDICT_TEXT[r.verdict]}`, '');
  for (const reason of r.reasons) L.push(`- ${reason}`);
  L.push('');
  L.push(`Source: ${x.source || (opts.excel ?? opts.storeId ?? '—')}  `);
  L.push(`Run: ${new Date().toISOString()}  `);
  L.push(`Model before: \`${currentVersion}\`${r.version ? `  \nModel after: \`${r.version}\`` : ''}`, '');

  if (r.quality) {
    const q = r.quality;
    L.push('## Your data', '');
    L.push('| | Rows in file | Rows used |', '|---|---:|---:|');
    L.push(`| Products | ${q.rowsRead.products} | ${q.rowsUsed.products} |`);
    L.push(`| Purchases | ${q.rowsRead.purchases} | ${q.rowsUsed.purchases} |`);
    L.push(`| Sales | ${q.rowsRead.sales} | ${q.rowsUsed.sales} |`);
    L.push(`| Returns | ${q.rowsRead.returns} | ${q.rowsUsed.returns} |`, '');
    L.push(`History: ${q.firstDate ?? '—'} to ${q.lastDate ?? '—'} (${q.historyDays} days). Units bought ${q.unitsPurchased}, sold ${q.unitsSold}` +
      `${q.unitsInferred ? `, of which ${q.unitsInferred} had no purchase recorded and were assumed` : ''}.`, '');
    const shown = q.issues.filter((i) => i.level !== 'info');
    if (shown.length) {
      L.push('Things the cleaner fixed or skipped (full list in `data-issues.csv`):', '');
      for (const i of shown.slice(0, 15)) L.push(`- ${i.sheet}${i.row ? ` row ${i.row}` : ''}: ${i.message}`);
      L.push('');
    }
    if (q.blockers.length) {
      L.push('**Blocking problems:**', '');
      for (const b of q.blockers) L.push(`- ${b}`);
      L.push('');
    }
  }

  if (r.holdout && r.candidate) {
    const c = r.holdout.current, n = r.holdout.candidate;
    L.push('## How the retrained model did', '');
    L.push(`Tested at ${x.dates.length} past dates (${x.dates[0]} → ${x.dates[x.dates.length - 1]}). ${x.train} were used to tune; the newest ${x.holdoutN} were kept aside and only used to judge.`, '');
    L.push('Scores on the months kept aside:', '');
    L.push('| Measure | Current model | Retrained | Better when |', '|---|---:|---:|---|');
    L.push(`| Forecast error (WAPE) | ${pct(c.wape)} | ${pct(n.wape)} | lower |`);
    L.push(`| Simple baseline error | ${pct(c.baselineWape)} | ${pct(n.baselineWape)} | — |`);
    L.push(`| Improvement over baseline | ${pct(c.liftOverBaseline)} | ${pct(n.liftOverBaseline)} | higher |`);
    L.push(`| Range coverage (aim ≈ 80%) | ${pct(c.intervalCoverage)} | ${pct(n.intervalCoverage)} | near 80% |`);
    L.push(`| Bias | ${pct(c.bias)} | ${pct(n.bias)} | near 0% |`);
    L.push(`| First-sale Brier score | ${c.brier ?? '—'} | ${n.brier ?? '—'} | lower |`);
    L.push(`| Predictions scored | ${c.predictions} | ${n.predictions} | — |`, '');

    L.push('## Settings', '');
    L.push('| Setting | Before | After |', '|---|---:|---:|');
    const rows: Array<[string, number, number]> = [
      ['overdispersion', r.current.overdispersion, r.candidate.overdispersion],
      ['olderWindowWeight', r.current.olderWindowWeight, r.candidate.olderWindowWeight],
      ['priorStrength.minRate', r.current.priorStrength.minRate, r.candidate.priorStrength.minRate],
      ['priorStrength.maxRate', r.current.priorStrength.maxRate, r.candidate.priorStrength.maxRate],
      ['minPeersForPrior', r.current.minPeersForPrior, r.candidate.minPeersForPrior],
      ['peerPriceFactor', r.current.peerPriceFactor, r.candidate.peerPriceFactor],
      ['maxPeers', r.current.maxPeers, r.candidate.maxPeers],
    ];
    for (const [k, a, b] of rows) L.push(`| ${k} | ${a} | ${b}${a !== b ? ' ◀ changed' : ''} |`);
    L.push('', `Searched ${x.trials} combinations. Settings that were not part of the search (size and return priors, minimum peer days) are unchanged.`, '');
  }

  L.push('## Files in this run folder', '');
  L.push('- `report.md` / `report.json` — this report');
  L.push('- `features.csv` — every engineered feature at every test date, with what really sold and what the model predicted');
  L.push('- `data-issues.csv` — every row the cleaner fixed or skipped (Excel runs)', '');
  L.push('Roll back at any time with `npm run ai:retrain -- --rollback`.');
  return L.join('\n');
}

