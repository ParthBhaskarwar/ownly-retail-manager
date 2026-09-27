/**
 * AiEvaluationService — "was the AI right?" (Week 7 prediction-vs-actual).
 *
 * evaluateDue() fills in the actual result of every LIVE prediction whose
 * horizon has passed. summarise() turns evaluated predictions into the
 * numbers on the evaluation dashboard:
 *
 *  - WAPE (Σ|predicted − actual| / Σ actual) for the model and for a naive
 *    carry-forward baseline ("next 30 days = last 30 days"). The baseline is
 *    the honest yardstick: a model that cannot beat it is not worth trusting.
 *  - q10–q90 interval coverage. Should be close to 80%; far below means the
 *    model is over-confident, far above means its ranges are uselessly wide.
 *  - First-sale calibration: of products given a 70% chance to sell, did ~70%
 *    sell? (Brier score + buckets.)
 *  - By confidence tier: HIGH-confidence predictions should have lower error.
 *  - By decision: STRONG_BUY products should really outsell AVOID ones.
 */

import { db } from '@/db/client';
import { AiFeaturesRepository } from './ai-features.repository';
import { AiPredictionRepository, type PredictionRow, type PredictionSource } from './ai-prediction.repository';

export interface EvaluationSummary {
  source: PredictionSource;
  count: number;
  modelVersions: string[];
  forecast: {
    totalPredicted: number;
    totalActual: number;
    mae: number | null;
    wape: number | null;
    bias: number | null;
    baselineWape: number | null;
    /** 1 − model WAPE / baseline WAPE. Positive = the model beats carry-forward. */
    liftOverBaseline: number | null;
    intervalCoverage: number | null;
  };
  firstSale: {
    brier: number | null;
    buckets: Array<{ range: string; count: number; predicted: number; actual: number }>;
  };
  byTier: Array<{ tier: string; count: number; wape: number | null; coverage: number | null }>;
  byDecision: Array<{
    decision: string; count: number; predictedSellThrough: number | null;
    actualSellThrough: number | null; avgActualUnits: number;
  }>;
  series: Array<{ period: string; predicted: number; actual: number; baseline: number }>;
  ownerDecisions: Record<'ACCEPTED' | 'MODIFIED' | 'IGNORED' | 'REJECTED' | 'PENDING', number>;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

function wapeOf(rows: PredictionRow[], pick: (r: PredictionRow) => number | null): number | null {
  const valid = rows.filter((r) => pick(r) !== null && r.actualUnits !== null);
  const actual = valid.reduce((s, r) => s + r.actualUnits!, 0);
  if (!valid.length || actual === 0) return null;
  return r3(valid.reduce((s, r) => s + Math.abs(pick(r)! - r.actualUnits!), 0) / actual);
}

function coverageOf(rows: PredictionRow[]): number | null {
  if (!rows.length) return null;
  const hit = rows.filter((r) => r.actualUnits! >= r.predictedUnitsQ10 && r.actualUnits! <= r.predictedUnitsQ90).length;
  return r3(hit / rows.length);
}

function avg(values: number[]): number | null {
  return values.length ? r3(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** Pure — exported for unit tests. */
export function summarise(
  source: PredictionSource,
  rows: PredictionRow[],
  ownerDecisions: EvaluationSummary['ownerDecisions']
): EvaluationSummary {
  const evaluated = rows.filter((r) => r.actualUnits !== null);
  const totalPredicted = evaluated.reduce((s, r) => s + r.predictedUnits, 0);
  const totalActual = evaluated.reduce((s, r) => s + r.actualUnits!, 0);
  const wape = wapeOf(evaluated, (r) => r.predictedUnits);
  const baselineWape = wapeOf(evaluated, (r) => r.baselineUnits);

  // First-sale calibration, only where stock was actually available to sell.
  const fs = evaluated.filter((r) => r.firstSaleProbability !== null && r.stockAtAsOf > 0);
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0001];
  const buckets = edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1];
    const inB = fs.filter((r) => r.firstSaleProbability! >= lo && r.firstSaleProbability! < hi);
    return {
      range: `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))}%`,
      count: inB.length,
      predicted: avg(inB.map((r) => r.firstSaleProbability!)) ?? 0,
      actual: avg(inB.map((r) => (r.actualUnits! > 0 ? 1 : 0))) ?? 0,
    };
  });
  const brier = fs.length
    ? r3(fs.reduce((s, r) => s + (r.firstSaleProbability! - (r.actualUnits! > 0 ? 1 : 0)) ** 2, 0) / fs.length)
    : null;

  const byTier = ['HIGH', 'MEDIUM', 'LOW'].map((tier) => {
    const t = evaluated.filter((r) => r.confidenceTier === tier);
    return { tier, count: t.length, wape: wapeOf(t, (r) => r.predictedUnits), coverage: coverageOf(t) };
  });

  const byDecision = ['STRONG_BUY', 'CONTROLLED_BUY', 'TRIAL', 'HOLD', 'AVOID'].map((decision) => {
    const d = evaluated.filter((r) => r.decision === decision);
    return {
      decision,
      count: d.length,
      predictedSellThrough: avg(d.filter((r) => r.expectedSellThrough !== null).map((r) => r.expectedSellThrough!)),
      actualSellThrough: avg(d.filter((r) => r.actualSellThrough !== null).map((r) => r.actualSellThrough!)),
      avgActualUnits: avg(d.map((r) => r.actualUnits!)) ?? 0,
    };
  });

  // Series by as-of day (backtests) — LIVE predictions are grouped by week.
  const periodOf = (iso: string) => {
    const d = new Date(iso);
    if (source === 'LIVE') d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().slice(0, 10);
  };
  const seriesMap = new Map<string, { predicted: number; actual: number; baseline: number }>();
  for (const r of evaluated) {
    const k = periodOf(r.asOf);
    const e = seriesMap.get(k) ?? { predicted: 0, actual: 0, baseline: 0 };
    e.predicted += r.predictedUnits;
    e.actual += r.actualUnits!;
    e.baseline += r.baselineUnits ?? 0;
    seriesMap.set(k, e);
  }
  const series = [...seriesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({ period, predicted: Math.round(v.predicted), actual: v.actual, baseline: v.baseline }));

  return {
    source,
    count: evaluated.length,
    modelVersions: [...new Set(evaluated.map((r) => r.modelVersion))],
    forecast: {
      totalPredicted: Math.round(totalPredicted),
      totalActual,
      mae: avg(evaluated.map((r) => Math.abs(r.predictedUnits - r.actualUnits!))),
      wape,
      bias: totalActual > 0 ? r3((totalPredicted - totalActual) / totalActual) : null,
      baselineWape,
      liftOverBaseline: wape !== null && baselineWape ? r3(1 - wape / baselineWape) : null,
      intervalCoverage: coverageOf(evaluated),
    },
    firstSale: { brier, buckets },
    byTier,
    byDecision,
    series,
    ownerDecisions,
  };
}

async function ownerDecisionCounts(storeId: string): Promise<EvaluationSummary['ownerDecisions']> {
  const rows = (await db('ai_predictions')
    .where({ store_id: storeId, source: 'LIVE', analysis_type: 'RESTOCK' })
    .select(db.raw(`COALESCE(owner_action, 'PENDING') AS action`))
    .count('* as count')
    .groupByRaw(`COALESCE(owner_action, 'PENDING')`)) as Array<{ action: string; count: number | string }>;
  const out = { ACCEPTED: 0, MODIFIED: 0, IGNORED: 0, REJECTED: 0, PENDING: 0 };
  for (const r of rows) out[r.action as keyof typeof out] = Number(r.count);
  return out;
}

/** Fills in actual results for LIVE predictions whose horizon has passed. */
async function evaluateDue(storeId: string): Promise<{ evaluated: number }> {
  const due = await AiPredictionRepository.listDue(storeId);
  let evaluated = 0;
  for (const p of due) {
    const from = new Date(p.asOf);
    const to = new Date(from.getTime() + p.horizonDays * 86_400_000);
    const actuals = await AiFeaturesRepository.loadActuals(storeId, from, to, [p.productId!]);
    const a = actuals.get(p.productId!);
    const units = a?.units ?? 0;
    const held = p.stockAtAsOf + (a?.unitsReceived ?? 0);
    await AiPredictionRepository.setActual(p.id, {
      actualUnits: units,
      actualSellThrough: held > 0 ? Math.min(1, units / held) : null,
      actualFirstSaleAt: a?.firstSaleAt ?? null,
    });
    evaluated++;
  }
  return { evaluated };
}

async function getSummary(storeId: string, source: PredictionSource): Promise<EvaluationSummary> {
  if (source === 'LIVE') await evaluateDue(storeId);
  const [rows, owner] = await Promise.all([
    AiPredictionRepository.listEvaluated(storeId, source),
    ownerDecisionCounts(storeId),
  ]);
  return summarise(source, rows, owner);
}

export const AiEvaluationService = { evaluateDue, getSummary };
