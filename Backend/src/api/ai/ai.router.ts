/**
 * AI Router — Week 7 offline AI scoring and AI-assisted restocking.
 *
 *   GET  /api/ai/overview                     store-wide AI summary (dashboard)
 *   GET  /api/ai/products/:id/analysis        AI product analysis (§2.14)
 *   POST /api/ai/restock/recommend            AI-assisted restock recommendation (§2.13)
 *   POST /api/ai/predictions/:id/decision     owner accepts / modifies / ignores / rejects
 *   GET  /api/ai/predictions                  prediction history
 *   GET  /api/ai/predictions/:id              one prediction with its outcome
 *   GET  /api/ai/evaluation?source=LIVE|BACKTEST  prediction-vs-actual metrics
 *
 * Analyses expose margins and cost, so reading them needs reports:view;
 * acting on a restock recommendation needs inventory:edit.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { AppError, param } from '@/shared/AppError';
import { AiService } from '@/services/ai/ai.service';
import { AiPredictionRepository } from '@/services/ai/ai-prediction.repository';
import { AiEvaluationService } from '@/services/ai/ai-evaluation.service';

export const aiRouter = Router();
aiRouter.use(authenticate);

const sizeMixSchema = z.array(z.object({
  size: z.string().trim().min(1).max(32),
  quantity: z.number().int().min(0).max(10_000),
})).max(20);

aiRouter.get('/overview', requirePermission('reports:view'), async (req, res, next) => {
  try {
    res.json(await AiService.overview(requireStoreId(req)));
  } catch (err) {
    next(err);
  }
});

aiRouter.get('/products/:id/analysis', requirePermission('reports:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const productId = z.string().uuid('Invalid product id.').parse(param(req.params, 'id'));
    const planned = req.query.plannedQuantity !== undefined
      ? z.coerce.number().int().min(0).max(10_000).parse(req.query.plannedQuantity)
      : null;
    res.json(await AiService.analyseProduct(storeId, productId, req.user!.userId, planned));
  } catch (err) {
    next(err);
  }
});

const recommendSchema = z.object({
  productId: z.string().uuid().optional(),
  name: z.string().trim().max(200).optional(),
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  sellingPrice: z.number().positive().max(10_000_000).optional(),
  costPrice: z.number().min(0).max(10_000_000).optional(),
  sizes: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  plannedQuantity: z.number().int().min(0).max(10_000).nullable().optional(),
  plannedSizeMix: z.record(z.string(), z.number().int().min(0).max(10_000)).nullable().optional(),
  photo: z.string().min(100).optional(),
}).refine((b) => b.productId || b.subcategoryId, {
  message: 'Choose an existing product, or describe the new garment (subcategory and price).',
});

aiRouter.post('/restock/recommend', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const body = recommendSchema.parse(req.body);
    res.status(201).json(await AiService.recommendRestock(storeId, req.user!.userId, body));
  } catch (err) {
    next(err);
  }
});

const decisionSchema = z.object({
  action: z.enum(['ACCEPTED', 'MODIFIED', 'IGNORED', 'REJECTED']),
  quantity: z.number().int().min(0).max(10_000).optional(),
  sizeMix: sizeMixSchema.optional(),
  note: z.string().trim().max(500).optional(),
  execute: z.boolean().optional(),
  purchaseCostPrice: z.number().min(0).max(10_000_000).optional(),
}).refine((b) => b.action !== 'REJECTED' || (b.note && b.note.length > 0), {
  message: 'Please say why you are rejecting the recommendation — it is used to improve the AI.',
  path: ['note'],
});

aiRouter.post('/predictions/:id/decision', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const id = z.string().uuid('Invalid prediction id.').parse(param(req.params, 'id'));
    const body = decisionSchema.parse(req.body);
    res.json(await AiService.recordDecision(storeId, req.user!.userId, id, body));
  } catch (err) {
    next(err);
  }
});

const listSchema = z.object({
  source: z.enum(['LIVE', 'BACKTEST']).optional(),
  analysisType: z.enum(['PRODUCT_ANALYSIS', 'RESTOCK']).optional(),
  productId: z.string().uuid().optional(),
  decision: z.enum(['STRONG_BUY', 'CONTROLLED_BUY', 'TRIAL', 'HOLD', 'AVOID']).optional(),
  evaluated: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

aiRouter.get('/predictions', requirePermission('reports:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    res.json(await AiPredictionRepository.list(storeId, listSchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
});

aiRouter.get('/predictions/:id', requirePermission('reports:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const id = z.string().uuid('Invalid prediction id.').parse(param(req.params, 'id'));
    const prediction = await AiPredictionRepository.get(storeId, id);
    if (!prediction) throw AppError.notFound('Prediction not found.');
    res.json({ prediction });
  } catch (err) {
    next(err);
  }
});

aiRouter.get('/evaluation', requirePermission('reports:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const source = z.enum(['LIVE', 'BACKTEST']).default('LIVE').parse(req.query.source);
    res.json(await AiEvaluationService.getSummary(storeId, source));
  } catch (err) {
    next(err);
  }
});
