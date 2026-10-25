/**
 * Tuner — the "training" step.
 *
 * ownly-scoring-v1 has no weights to fit by gradient descent; what can be
 * learned from a store's own history is its settings (ModelParams): how noisy
 * its demand is, how much older sales count, how strongly similar products
 * pull a new product's forecast. Training searches those settings for the
 * values that predicted THIS store's past best.
 *
 * How it stays honest:
 *   - Walk-forward. The model replays at several past dates (as-of dates). At
 *     each it sees only earlier data and is scored on the next 30 days.
 *   - Train / holdout split by TIME. Settings are searched on the earlier
 *     dates; the newest dates are never touched during the search and decide
 *     whether the result is kept.
 *   - A purge gap. The date between the two sets is dropped, because a 30-day
 *     window and a 28-day step overlap by two days.
 *   - Guardrails. A candidate must keep its q10–q90 range honest (coverage
 *     72–88%) and its bias small (±15%), whatever its error. Squeezing error
 *     by making ranges useless is not an improvement.
 *   - Compared like for like. The currently live settings are scored on the
 *     same holdout, and the new ones replace them only if clearly better.
 */

import { AiFeaturesRepository, type StoreFeatures } from '@/services/ai/ai-features.repository';
import { activateModel, analyseAll, clearScoringCaches, DEFAULT_PARAMS, HORIZON_DAYS, type ModelParams } from '@/services/ai/ai-scoring';
import { toRow, type PredictionRow } from '@/services/ai/ai-prediction.repository';
import { summarise } from '@/services/ai/ai-evaluation.service';
import type { ModelMetrics } from '@/services/ai/model-registry';

const DAY = 86_400_000;

export interface Snapshot {
  asOf: Date;
  features: StoreFeatures;
  actuals: Awaited<ReturnType<typeof AiFeaturesRepository.loadActuals>>;
}

export interface SearchSpace {
  overdispersion: number[];
  olderWindowWeight: number[];
  'priorStrength.minRate': number[];
  'priorStrength.maxRate': number[];
  minPeersForPrior: number[];
  peerPriceFactor: number[];
  maxPeers: number[];
}

export const SEARCH_SPACE: SearchSpace = {
  overdispersion: [1.5, 2, 3, 4, 6, 8],
  olderWindowWeight: [0.4, 0.6, 0.75, 0.9, 1.0],
  'priorStrength.minRate': [1, 2, 3, 5, 8],
  'priorStrength.maxRate': [8, 12, 15, 20, 30],
  minPeersForPrior: [3, 5, 8],
  peerPriceFactor: [1.25, 1.5, 2],
  maxPeers: [8, 12, 20],
};

export const GUARDRAILS = { coverageMin: 0.72, coverageMax: 0.88, maxAbsBias: 0.15 };

// ─── Dates ────────────────────────────────────────────────────────────────────

export function asOfDates(firstDate: Date, lastDate: Date, months: number, everyDays = 28): Date[] {
  const end = lastDate.getTime() - HORIZON_DAYS * DAY; // every horizon must be fully observed
  const earliestUseful = firstDate.getTime() + 90 * DAY; // the model looks back 90 days
  const start = Math.max(earliestUseful, end - months * 30.4 * DAY);
  const dates: Date[] = [];
  for (let t = end; t >= start; t -= everyDays * DAY) dates.unshift(new Date(t));
  return dates;
}

/** Earlier dates train, the newest quarter holds out, one date between them is dropped. */
export function splitDates<T>(items: T[]): { train: T[]; holdout: T[]; purged: T | null } {
  const holdoutN = Math.max(2, Math.round(items.length * 0.25));
  const holdout = items.slice(items.length - holdoutN);
  const rest = items.slice(0, items.length - holdoutN);
  const purged = rest.length > 1 ? rest[rest.length - 1] : null;
  return { train: purged ? rest.slice(0, -1) : rest, holdout, purged };
}

export async function loadSnapshots(
  storeId: string, dates: Date[], onProgress?: (i: number, n: number) => void
): Promise<Snapshot[]> {
  const out: Snapshot[] = [];
  for (let i = 0; i < dates.length; i++) {
    const asOf = dates[i];
    const horizonEnd = new Date(asOf.getTime() + HORIZON_DAYS * DAY);
    const [features, actuals] = await Promise.all([
      AiFeaturesRepository.loadStoreFeatures(storeId, asOf),
      AiFeaturesRepository.loadActuals(storeId, asOf, horizonEnd),
    ]);
    out.push({ asOf, features, actuals });
    onProgress?.(i + 1, dates.length);
  }
  return out;
}

// ─── Scoring one set of settings ──────────────────────────────────────────────

function toEvalRows(snapshot: Snapshot, storeId: string): PredictionRow[] {
  const { features, actuals } = snapshot;
  const received = new Map([...actuals.values()].map((a) => [a.productId, a.unitsReceived]));
  const receivedBySize = new Map([...actuals.values()].map((a) => [a.productId, a.receivedBySize]));
  const analyses = analyseAll(features, { received, receivedBySize })
    .filter((a) => a.subject.stockOnHand > 0 || (received.get(a.subject.productId!) ?? 0) > 0);

  return analyses.map((a) => {
    const act = actuals.get(a.subject.productId!);
    const units = act?.units ?? 0;
    const held = a.forecast.stockAssumed;
    const r = toRow(a, { storeId, analysisType: 'PRODUCT_ANALYSIS', source: 'BACKTEST' }, {
      actualUnits: units,
      actualSellThrough: held > 0 ? Math.min(1, units / held) : null,
      actualFirstSaleAt: act?.firstSaleAt ?? null,
    });
    return {
      predictedUnits: r.predicted_units, predictedUnitsQ10: r.predicted_units_q10, predictedUnitsQ90: r.predicted_units_q90,
      baselineUnits: r.baseline_units, actualUnits: r.actual_units, actualSellThrough: r.actual_sell_through,
      firstSaleProbability: r.first_sale_probability, expectedSellThrough: r.expected_sell_through,
      stockAtAsOf: r.stock_at_as_of, confidenceTier: r.confidence_tier, decision: r.decision,
      asOf: r.as_of, modelVersion: r.model_version,
    } as unknown as PredictionRow;
  });
}

/** Scores the model, run with `params`, over `snapshots`. Leaves the live settings untouched. */
export function evaluate(params: ModelParams, snapshots: Snapshot[], storeId: string, restore: ModelParams): ModelMetrics {
  activateModel('tuning', params);
  try {
    const rows = snapshots.flatMap((s) => toEvalRows(s, storeId));
    const s = summarise('BACKTEST', rows, { ACCEPTED: 0, MODIFIED: 0, IGNORED: 0, REJECTED: 0, PENDING: 0 });
    return {
      predictions: s.count,
      wape: s.forecast.wape, baselineWape: s.forecast.baselineWape, liftOverBaseline: s.forecast.liftOverBaseline,
      bias: s.forecast.bias, intervalCoverage: s.forecast.intervalCoverage, brier: s.firstSale.brier,
    };
  } finally {
    activateModel('restored', restore);
    clearScoringCaches();
  }
}

/** Lower is better. Error plus a first-sale probability term; infeasible settings are pushed out. */
export function objective(m: ModelMetrics): number {
  if (m.wape === null || m.brier === null || m.predictions === 0) return Number.POSITIVE_INFINITY;
  const feasible = isWithinGuardrails(m);
  return m.wape + 0.5 * m.brier + (feasible ? 0 : 10);
}

export function isWithinGuardrails(m: ModelMetrics): boolean {
  return m.intervalCoverage !== null && m.bias !== null
    && m.intervalCoverage >= GUARDRAILS.coverageMin && m.intervalCoverage <= GUARDRAILS.coverageMax
    && Math.abs(m.bias) <= GUARDRAILS.maxAbsBias;
}

// ─── Search ───────────────────────────────────────────────────────────────────

function setParam(p: ModelParams, key: string, value: number): ModelParams {
  const next: ModelParams = { ...p, priorStrength: { ...p.priorStrength } };
  if (key === 'priorStrength.minRate') next.priorStrength.minRate = value;
  else if (key === 'priorStrength.maxRate') next.priorStrength.maxRate = value;
  else (next as unknown as Record<string, number>)[key] = value;
  return next;
}

function getParam(p: ModelParams, key: string): number {
  return key === 'priorStrength.minRate' ? p.priorStrength.minRate
    : key === 'priorStrength.maxRate' ? p.priorStrength.maxRate
    : (p as unknown as Record<string, number>)[key];
}

export interface SearchStep { param: string; from: number; to: number; objective: number }

/**
 * Coordinate search: change one setting at a time through its grid, keep what
 * helps, repeat. Deterministic, easy to explain, and cheap enough because the
 * features are loaded once and only the scoring is repeated.
 */
export function search(
  start: ModelParams, train: Snapshot[], storeId: string, onTrial?: (n: number) => void
): { params: ModelParams; metrics: ModelMetrics; steps: SearchStep[]; trials: number } {
  let best = start;
  let bestMetrics = evaluate(best, train, storeId, start);
  let bestObj = objective(bestMetrics);
  const steps: SearchStep[] = [];
  let trials = 1;

  for (let pass = 0; pass < 2; pass++) {
    let improved = false;
    for (const [key, grid] of Object.entries(SEARCH_SPACE) as Array<[string, number[]]>) {
      for (const value of grid) {
        if (value === getParam(best, key)) continue;
        const cand = setParam(best, key, value);
        if (cand.priorStrength.minRate > cand.priorStrength.maxRate) continue;
        const m = evaluate(cand, train, storeId, start);
        trials++; onTrial?.(trials);
        const obj = objective(m);
        if (obj < bestObj - 1e-4) {
          steps.push({ param: key, from: getParam(best, key), to: value, objective: obj });
          best = cand; bestMetrics = m; bestObj = obj; improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { params: best, metrics: bestMetrics, steps, trials };
}

export function sameParams(a: ModelParams, b: ModelParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export { DEFAULT_PARAMS };
