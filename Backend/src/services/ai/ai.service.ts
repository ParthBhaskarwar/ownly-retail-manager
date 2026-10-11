/**
 * AiService — Week 7 orchestration: features → scoring → persistence.
 *
 *   analyseProduct     AI product analysis for one catalogue product (§2.14)
 *   recommendRestock   AI-assisted restocking: existing product, or a garment
 *                      described by photo + subcategory + price (§2.13)
 *   recordDecision     owner accepts / modifies / ignores / rejects; accept and
 *                      modify can execute the restock in the same call
 *   overview           store-wide AI summary for the dashboard (§2.16)
 *
 * Store features take a few seconds to build, so they are cached per store
 * for a few minutes and dropped whenever the AI itself changes stock.
 */

import { db } from '@/db/client';
import { AppError } from '@/shared/AppError';
import { AuditService } from '@/services/audit.service';
import { InventoryService } from '@/services/inventory.service';
import {
  EmbeddingService, EmbeddingUnavailableError, InvalidImageError,
} from '@/services/embedding.service';
import { ProductEmbeddingRepository } from '@/services/product-embedding.repository';
import { AiFeaturesRepository, type StoreFeatures } from './ai-features.repository';
import { analyse, analyseAll, MODEL_VERSION } from './ai-scoring';
import { AiPredictionRepository, type PredictionRow } from './ai-prediction.repository';
import type { AiAnalysis, AiDecision, OwnerAction } from './ai.types';

const FEATURE_TTL_MS = 5 * 60_000;
const featureCache = new Map<string, { at: number; features: Promise<StoreFeatures> }>();

function storeFeatures(storeId: string): Promise<StoreFeatures> {
  const hit = featureCache.get(storeId);
  if (hit && Date.now() - hit.at < FEATURE_TTL_MS) return hit.features;
  const features = AiFeaturesRepository.loadStoreFeatures(storeId);
  featureCache.set(storeId, { at: Date.now(), features });
  features.catch(() => featureCache.delete(storeId));
  return features;
}

function invalidate(storeId: string): void {
  featureCache.delete(storeId);
}

/** Features that are guaranteed to include `productId` (it may be newer than the cache). */
async function featuresWith(storeId: string, productId: string): Promise<StoreFeatures> {
  let f = await storeFeatures(storeId);
  if (!f.byId.has(productId)) {
    invalidate(storeId);
    f = await storeFeatures(storeId);
  }
  return f;
}

async function assertProduct(storeId: string, productId: string): Promise<void> {
  const row = await db('products').where({ id: productId, store_id: storeId }).first('id');
  if (!row) throw AppError.notFound('Product not found.');
}

/** Photo-similar products for a saved product; [] when photo AI is off. */
async function photoPeersOfProduct(storeId: string, productId: string) {
  try {
    const similar = await ProductEmbeddingRepository.findSimilarToProduct(storeId, productId, 10);
    return (similar ?? []).map((s) => ({ productId: s.productId, similarity: s.similarity }));
  } catch (err) {
    console.warn('[ai] photo peers unavailable:', (err as Error).message);
    return [];
  }
}

/** Photo-similar products for an uploaded photo. */
async function photoPeersOfImage(storeId: string, image: string) {
  try {
    const vector = await EmbeddingService.embedImage(image);
    const similar = await ProductEmbeddingRepository.searchByVector(storeId, vector, { limit: 10 });
    return {
      peers: similar.map((s) => ({ productId: s.productId, similarity: s.similarity })),
      message: similar.length ? undefined : 'No existing products look like this photo, so similar products were matched by subcategory and price.',
    };
  } catch (err) {
    if (err instanceof InvalidImageError) throw AppError.badRequest('That file could not be read as an image.');
    if (err instanceof EmbeddingUnavailableError) {
      return { peers: [], message: 'Photo AI is not available — similar products were matched by subcategory and price.' };
    }
    console.warn('[ai] photo search failed:', (err as Error).message);
    return { peers: [], message: 'Photo search is not ready — similar products were matched by subcategory and price.' };
  }
}

// ─── Product analysis ─────────────────────────────────────────────────────────

async function analyseProduct(
  storeId: string,
  productId: string,
  userId: string,
  plannedQuantity: number | null = null
): Promise<{ analysis: AiAnalysis; predictionId: string }> {
  await assertProduct(storeId, productId);
  const [features, photoPeers] = await Promise.all([
    featuresWith(storeId, productId),
    photoPeersOfProduct(storeId, productId),
  ]);
  const analysis = analyse(features, { productId, plannedQuantity, photoPeers });

  const existing = await AiPredictionRepository.findTodaysAnalysis(storeId, productId, MODEL_VERSION);
  const predictionId = existing ?? await AiPredictionRepository.insert(analysis, {
    storeId,
    analysisType: 'PRODUCT_ANALYSIS',
    source: 'LIVE',
    subcategoryId: features.byId.get(productId)?.subcategoryId ?? null,
    inputs: { plannedQuantity },
    createdBy: userId,
  });
  return { analysis, predictionId };
}

// ─── AI-assisted restock ──────────────────────────────────────────────────────

export interface RestockRequest {
  productId?: string;
  name?: string;
  categoryId?: string;
  subcategoryId?: string;
  sellingPrice?: number;
  costPrice?: number;
  sizes?: string[];
  plannedQuantity?: number | null;
  plannedSizeMix?: Record<string, number> | null;
  /** Base64 garment photo (optional). */
  photo?: string;
}

async function recommendRestock(
  storeId: string,
  userId: string,
  req: RestockRequest
): Promise<{ analysis: AiAnalysis; predictionId: string; photoMessage?: string; photoMatches: number }> {
  let features: StoreFeatures;
  let photoPeers: Array<{ productId: string; similarity: number }> = [];
  let photoMessage: string | undefined;

  if (req.productId) {
    await assertProduct(storeId, req.productId);
    features = await featuresWith(storeId, req.productId);
    photoPeers = await photoPeersOfProduct(storeId, req.productId);
  } else {
    if (!req.subcategoryId) throw AppError.badRequest('Choose a subcategory for a new product.');
    if (!req.sellingPrice || req.sellingPrice <= 0) throw AppError.badRequest('Enter the planned selling price.');
    const sub = await db('subcategories')
      .where({ id: req.subcategoryId })
      .andWhere((q) => q.whereNull('store_id').orWhere('store_id', storeId))
      .first('id', 'category_id');
    if (!sub) throw AppError.badRequest('Unknown subcategory.');
    req.categoryId = req.categoryId ?? (sub.categoryId as string);
    features = await storeFeatures(storeId);
  }

  if (req.photo) {
    const found = await photoPeersOfImage(storeId, req.photo);
    photoPeers = found.peers.filter((p) => p.productId !== req.productId);
    photoMessage = found.message;
  }

  const analysis = analyse(features, {
    productId: req.productId,
    name: req.name,
    categoryId: req.categoryId,
    subcategoryId: req.subcategoryId,
    sellingPrice: req.sellingPrice,
    costPrice: req.costPrice,
    sizes: req.sizes,
    plannedQuantity: req.plannedQuantity ?? null,
    plannedSizeMix: req.plannedSizeMix ?? null,
    photoPeers,
  });

  const { photo: _photo, ...inputs } = req;
  const predictionId = await AiPredictionRepository.insert(analysis, {
    storeId,
    analysisType: 'RESTOCK',
    source: 'LIVE',
    subcategoryId: req.subcategoryId ?? features.byId.get(req.productId ?? '')?.subcategoryId ?? null,
    inputs: { ...inputs, hadPhoto: Boolean(req.photo), photoMatches: photoPeers.length },
    createdBy: userId,
  });

  return { analysis, predictionId, photoMessage, photoMatches: photoPeers.length };
}

// ─── Owner decision ───────────────────────────────────────────────────────────

export interface DecisionRequest {
  action: OwnerAction;
  quantity?: number;
  sizeMix?: Array<{ size: string; quantity: number }>;
  note?: string;
  /** Accept/modify only: create the stock (new barcodes) in the same call. */
  execute?: boolean;
  purchaseCostPrice?: number;
}

async function recordDecision(
  storeId: string,
  userId: string,
  predictionId: string,
  req: DecisionRequest
): Promise<{ prediction: PredictionRow; restock: { batchId: string; totalUnits: number } | null }> {
  const prediction = await AiPredictionRepository.get(storeId, predictionId);
  if (!prediction) throw AppError.notFound('Prediction not found.');
  if (prediction.restockBatchId) {
    throw AppError.conflict('This recommendation has already been acted on and its stock was created.');
  }

  let quantity: number | null = null;
  let sizeMix: Array<{ size: string; quantity: number }> | null = null;
  if (req.action === 'ACCEPTED') {
    quantity = prediction.recommendedQuantity;
    sizeMix = prediction.recommendedSizeMix.map((s) => ({ size: s.size, quantity: s.quantity }));
  } else if (req.action === 'MODIFIED') {
    if (req.sizeMix?.length) {
      sizeMix = req.sizeMix.filter((s) => s.quantity > 0);
      quantity = sizeMix.reduce((t, s) => t + s.quantity, 0);
    } else if (req.quantity !== undefined) {
      quantity = req.quantity;
    } else {
      throw AppError.badRequest('A modified decision needs your quantity or size mix.');
    }
  }

  let restock: { batchId: string; totalUnits: number } | null = null;
  const buying = (req.action === 'ACCEPTED' || req.action === 'MODIFIED') && (quantity ?? 0) > 0;
  if (req.execute && buying) {
    if (!prediction.productId) {
      throw AppError.badRequest('This garment is not in the catalogue yet — add it as a product first, then restock it.');
    }
    if (!sizeMix?.length) throw AppError.badRequest('Choose how many units of each size to buy.');

    const features = await featuresWith(storeId, prediction.productId);
    const variants = features.byId.get(prediction.productId)!.variants;
    const product = await db('products').where({ id: prediction.productId }).first('base_cost_price');
    const cost = req.purchaseCostPrice
      ?? (prediction.inputs.costPrice as number | undefined)
      ?? Number(product?.baseCostPrice ?? 0);
    const today = new Date().toISOString().slice(0, 10);

    const lines = sizeMix.filter((s) => s.quantity > 0).map((s) => {
      const v = variants.find((x) => x.size === s.size);
      if (!v) throw AppError.badRequest(`This product has no size ${s.size}.`);
      return { variantId: v.variantId, quantity: s.quantity, purchaseCostPrice: cost, purchaseDate: today };
    });

    const result = await InventoryService.restockVariants({
      storeId,
      performedBy: userId,
      lines,
      notes: `AI-assisted restock (${prediction.decision}, ${req.action.toLowerCase()})`,
    });
    restock = { batchId: result.batchId, totalUnits: result.totalUnits };
    invalidate(storeId);
  }

  await AiPredictionRepository.recordDecision(storeId, predictionId, {
    action: req.action,
    quantity,
    sizeMix,
    note: req.note?.trim() || null,
    decidedBy: userId,
    restockBatchId: restock?.batchId ?? null,
  });

  await AuditService.log({
    action: 'ai.recommendation_decision',
    userId,
    storeId,
    entityType: 'ai_prediction',
    entityId: predictionId,
    meta: {
      aiDecision: prediction.decision,
      recommendedQuantity: prediction.recommendedQuantity,
      ownerAction: req.action,
      ownerQuantity: quantity,
      restockBatchId: restock?.batchId ?? null,
      note: req.note ?? null,
    },
  });

  return { prediction: (await AiPredictionRepository.get(storeId, predictionId))!, restock };
}

// ─── Store overview ───────────────────────────────────────────────────────────

export interface AiOverview {
  modelVersion: string;
  asOf: string;
  productsScored: number;
  decisions: Record<AiDecision, number>;
  actions: Record<string, number>;
  expectedUnits30: number;
  expectedRevenue30: number;
  stockValueAtRisk: number;
  restockCandidates: Array<{
    productId: string; name: string; decision: AiDecision; quantity: number;
    demandScore: number; confidenceTier: string; stockOnHand: number; unitsPerWeek: number;
  }>;
  deadStock: Array<{
    productId: string; name: string; action: string; deadStockRisk: number;
    stockOnHand: number; stockValue: number; avgStockAgeDays: number | null;
  }>;
  hasHistory: boolean;
}

async function overview(storeId: string): Promise<AiOverview> {
  const features = await storeFeatures(storeId);
  const analyses = analyseAll(features, { onlyWithHistory: true });

  const decisions = { STRONG_BUY: 0, CONTROLLED_BUY: 0, TRIAL: 0, HOLD: 0, AVOID: 0 } as Record<AiDecision, number>;
  const actions: Record<string, number> = {};
  let units = 0, revenue = 0, atRisk = 0;
  for (const a of analyses) {
    decisions[a.recommendation.decision]++;
    actions[a.recommendation.productAction] = (actions[a.recommendation.productAction] ?? 0) + 1;
    if (a.subject.stockOnHand > 0) {
      units += a.forecast.expectedSales;
      revenue += a.forecast.expectedSales * a.subject.sellingPrice;
      if (a.recommendation.productAction === 'CLEARANCE' || a.recommendation.productAction === 'DISCOUNT') {
        atRisk += a.subject.stockOnHand * a.subject.costPrice * (a.scores.deadStockRisk.value / 100);
      }
    }
  }

  const restockCandidates = analyses
    .filter((a) => a.recommendation.decision === 'STRONG_BUY' || a.recommendation.decision === 'CONTROLLED_BUY')
    .sort((a, b) => b.scores.demand.value - a.scores.demand.value || b.recommendation.quantity - a.recommendation.quantity)
    .slice(0, 10)
    .map((a) => ({
      productId: a.subject.productId!, name: a.subject.name, decision: a.recommendation.decision,
      quantity: a.recommendation.quantity, demandScore: a.scores.demand.value,
      confidenceTier: a.confidence.tier, stockOnHand: a.subject.stockOnHand, unitsPerWeek: a.forecast.unitsPerWeek,
    }));

  const deadStock = analyses
    .filter((a) => a.recommendation.productAction === 'CLEARANCE' || a.recommendation.productAction === 'DISCOUNT')
    .map((a) => ({
      productId: a.subject.productId!, name: a.subject.name, action: a.recommendation.productAction,
      deadStockRisk: a.scores.deadStockRisk.value, stockOnHand: a.subject.stockOnHand,
      stockValue: Math.round(a.subject.stockOnHand * a.subject.costPrice),
      avgStockAgeDays: a.metrics?.avgStockAgeDays ?? null,
    }))
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, 10);

  return {
    modelVersion: MODEL_VERSION,
    asOf: features.asOf,
    productsScored: analyses.length,
    decisions,
    actions,
    expectedUnits30: Math.round(units),
    expectedRevenue30: Math.round(revenue),
    stockValueAtRisk: Math.round(atRisk),
    restockCandidates,
    deadStock,
    hasHistory: features.products.some((p) => p.unitsLifetime > 0),
  };
}

export const AiService = { analyseProduct, recommendRestock, recordDecision, overview, invalidate };
