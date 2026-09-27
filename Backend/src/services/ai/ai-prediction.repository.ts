/**
 * AiPredictionRepository — reads and writes ai_predictions (migration 009).
 *
 * A row is written whenever an analysis is shown to someone, so what the AI
 * said can later be compared with what the owner did and what really sold.
 */

import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { db } from '@/db/client';
import type { AiAnalysis, OwnerAction } from './ai.types';

export type AnalysisType = 'PRODUCT_ANALYSIS' | 'RESTOCK';
export type PredictionSource = 'LIVE' | 'BACKTEST';

export interface PredictionMeta {
  storeId: string;
  analysisType: AnalysisType;
  source: PredictionSource;
  subcategoryId?: string | null;
  inputs?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface ActualFields {
  actualUnits: number;
  actualSellThrough: number | null;
  actualFirstSaleAt: string | null;
}

export interface PredictionRow {
  id: string;
  storeId: string;
  productId: string | null;
  productName?: string | null;
  analysisType: AnalysisType;
  source: PredictionSource;
  modelVersion: string;
  asOf: string;
  horizonDays: number;
  inputs: Record<string, unknown>;
  scores: AiAnalysis['scores'];
  predictedUnits: number;
  predictedUnitsQ10: number;
  predictedUnitsQ90: number;
  firstSaleProbability: number | null;
  expectedSellThrough: number | null;
  stockAtAsOf: number;
  recommendedQuantity: number;
  recommendedSizeMix: AiAnalysis['recommendation']['sizeMix'];
  decision: AiAnalysis['recommendation']['decision'];
  confidence: number;
  confidenceTier: AiAnalysis['confidence']['tier'];
  dataSufficiency: AiAnalysis['confidence']['dataSufficiency'];
  reasons: AiAnalysis['reasons'];
  comparables: AiAnalysis['comparables'];
  baselineUnits: number | null;
  ownerAction: OwnerAction | null;
  ownerQuantity: number | null;
  ownerSizeMix: Array<{ size: string; quantity: number }> | null;
  ownerNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  restockBatchId: string | null;
  actualUnits: number | null;
  actualSellThrough: number | null;
  actualFirstSaleAt: string | null;
  evaluatedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

const FLOAT_FIELDS = [
  'predictedUnits', 'predictedUnitsQ10', 'predictedUnitsQ90', 'firstSaleProbability',
  'expectedSellThrough', 'confidence', 'baselineUnits', 'actualSellThrough',
] as const;

function normalise(row: Record<string, unknown>): PredictionRow {
  const out = { ...row } as Record<string, unknown>;
  for (const f of FLOAT_FIELDS) if (out[f] !== null && out[f] !== undefined) out[f] = Number(out[f]);
  return out as unknown as PredictionRow;
}

/** Converts an analysis into an insertable row. */
export function toRow(analysis: AiAnalysis, meta: PredictionMeta, actual?: ActualFields): Record<string, unknown> {
  const f = analysis.forecast;
  const r = analysis.recommendation;
  return {
    id: randomUUID(),
    store_id: meta.storeId,
    product_id: analysis.subject.productId,
    subcategory_id: meta.subcategoryId ?? null,
    analysis_type: meta.analysisType,
    source: meta.source,
    model_version: analysis.modelVersion,
    as_of: analysis.asOf,
    horizon_days: f.horizonDays,
    inputs: JSON.stringify({ ...(meta.inputs ?? {}), stockAssumed: f.stockAssumed }),
    scores: JSON.stringify(analysis.scores),
    predicted_units: f.expectedSales,
    predicted_units_q10: f.expectedSalesQ10,
    predicted_units_q90: f.expectedSalesQ90,
    first_sale_probability: f.firstSaleProbability,
    expected_sell_through: f.expectedSellThrough,
    stock_at_as_of: analysis.subject.stockOnHand,
    recommended_quantity: r.quantity,
    recommended_size_mix: JSON.stringify(r.sizeMix),
    decision: r.decision,
    confidence: analysis.confidence.value,
    confidence_tier: analysis.confidence.tier,
    data_sufficiency: analysis.confidence.dataSufficiency,
    reasons: JSON.stringify(analysis.reasons),
    comparables: JSON.stringify(analysis.comparables),
    baseline_units: analysis.baselineUnits,
    created_by: meta.createdBy ?? null,
    ...(actual ? {
      actual_units: actual.actualUnits,
      actual_sell_through: actual.actualSellThrough,
      actual_first_sale_at: actual.actualFirstSaleAt,
      evaluated_at: new Date().toISOString(),
    } : {}),
  };
}

async function insert(analysis: AiAnalysis, meta: PredictionMeta, executor: Knex | Knex.Transaction = db): Promise<string> {
  const row = toRow(analysis, meta);
  await executor('ai_predictions').insert(row);
  return row.id as string;
}

async function insertMany(rows: Array<Record<string, unknown>>): Promise<void> {
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) await db('ai_predictions').insert(rows.slice(i, i + chunk));
}

/**
 * A product analysis is logged at most once per product per day: reopening
 * the product page should not flood the prediction history.
 */
async function findTodaysAnalysis(storeId: string, productId: string, modelVersion: string): Promise<string | null> {
  const row = await db('ai_predictions')
    .where({ store_id: storeId, product_id: productId, analysis_type: 'PRODUCT_ANALYSIS', source: 'LIVE', model_version: modelVersion })
    .where('created_at', '>=', db.raw(`date_trunc('day', now())`))
    .first('id');
  return (row?.id as string) ?? null;
}

async function get(storeId: string, id: string): Promise<PredictionRow | null> {
  const row = await db('ai_predictions as ap')
    .leftJoin('products as p', 'p.id', 'ap.product_id')
    .where({ 'ap.id': id, 'ap.store_id': storeId })
    .first('ap.*', db.ref('p.name').as('product_name'));
  return row ? normalise(row) : null;
}

export interface ListFilters {
  source?: PredictionSource;
  analysisType?: AnalysisType;
  productId?: string;
  decision?: string;
  evaluated?: boolean;
  limit?: number;
  offset?: number;
}

async function list(storeId: string, filters: ListFilters = {}): Promise<{ items: PredictionRow[]; total: number }> {
  const base = db('ai_predictions as ap').where('ap.store_id', storeId);
  if (filters.source) base.where('ap.source', filters.source);
  if (filters.analysisType) base.where('ap.analysis_type', filters.analysisType);
  if (filters.productId) base.where('ap.product_id', filters.productId);
  if (filters.decision) base.where('ap.decision', filters.decision);
  if (filters.evaluated === true) base.whereNotNull('ap.evaluated_at');
  if (filters.evaluated === false) base.whereNull('ap.evaluated_at');

  const [{ count }] = await base.clone().count('* as count');
  const items = await base
    .leftJoin('products as p', 'p.id', 'ap.product_id')
    .select('ap.*', db.ref('p.name').as('product_name'))
    .orderBy('ap.as_of', 'desc')
    .orderBy('ap.created_at', 'desc')
    .limit(Math.min(filters.limit ?? 50, 200))
    .offset(filters.offset ?? 0);
  return { items: items.map(normalise), total: Number(count) };
}

async function recordDecision(
  storeId: string,
  id: string,
  decision: {
    action: OwnerAction;
    quantity: number | null;
    sizeMix: Array<{ size: string; quantity: number }> | null;
    note: string | null;
    decidedBy: string;
    restockBatchId?: string | null;
  },
  executor: Knex | Knex.Transaction = db
): Promise<void> {
  await executor('ai_predictions')
    .where({ id, store_id: storeId })
    .update({
      owner_action: decision.action,
      owner_quantity: decision.quantity,
      owner_size_mix: decision.sizeMix ? JSON.stringify(decision.sizeMix) : null,
      owner_note: decision.note,
      decided_by: decision.decidedBy,
      decided_at: new Date().toISOString(),
      restock_batch_id: decision.restockBatchId ?? null,
    });
}

/** LIVE predictions whose horizon has passed but have no actual result yet. */
async function listDue(storeId: string): Promise<PredictionRow[]> {
  const rows = await db('ai_predictions')
    .where({ store_id: storeId, source: 'LIVE' })
    .whereNull('evaluated_at')
    .whereNotNull('product_id')
    .whereRaw(`as_of + (horizon_days || ' days')::interval <= now()`)
    .select('*');
  return rows.map(normalise);
}

async function setActual(id: string, actual: ActualFields): Promise<void> {
  await db('ai_predictions').where({ id }).update({
    actual_units: actual.actualUnits,
    actual_sell_through: actual.actualSellThrough,
    actual_first_sale_at: actual.actualFirstSaleAt,
    evaluated_at: new Date().toISOString(),
  });
}

/** Every evaluated prediction for a store/source — the evaluation dashboard's input. */
async function listEvaluated(storeId: string, source: PredictionSource): Promise<PredictionRow[]> {
  const rows = await db('ai_predictions')
    .where({ store_id: storeId, source })
    .whereNotNull('evaluated_at')
    .select(
      'id', 'product_id', 'as_of', 'decision', 'confidence_tier', 'predicted_units', 'predicted_units_q10',
      'predicted_units_q90', 'first_sale_probability', 'expected_sell_through', 'stock_at_as_of',
      'recommended_quantity', 'baseline_units', 'actual_units', 'actual_sell_through', 'owner_action',
      'owner_quantity', 'model_version', 'analysis_type', 'inputs'
    );
  return rows.map(normalise);
}

async function deleteBacktests(storeId: string): Promise<number> {
  return db('ai_predictions').where({ store_id: storeId, source: 'BACKTEST' }).delete();
}

export const AiPredictionRepository = {
  insert,
  insertMany,
  findTodaysAnalysis,
  get,
  list,
  recordDecision,
  listDue,
  setActual,
  listEvaluated,
  deleteBacktests,
};
