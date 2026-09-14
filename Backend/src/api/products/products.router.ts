/**
 * Products routes — search, create (with variants + opening stock), detail,
 * update; Week 6 adds photo fingerprint, similar-product search, and
 * product-performance endpoints.
 *
 * storeId always comes from the caller's token, never the body, so a client
 * cannot read or write another store's products.
 *
 * Week 6 design principle: photo AI endpoints are purely additive.
 * Existing CRUD routes are untouched — manual product entry works exactly
 * as before even when no photo is ever captured.
 */

import { Router } from 'express';
import { z } from 'zod';
import { ProductService, VariantService } from '@/services/product.service';
import {
  FingerprintService,
} from '@/services/fingerprint.service';
import { ProductPerformanceService } from '@/services/product-performance.service';
import { db } from '@/db/client';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { AppError, param } from '@/shared/AppError';
import type { SimilarProduct } from '@/types/domain';

export const productsRouter = Router();
productsRouter.use(authenticate);

const attributeValueSchema = z.object({
  attributeDefinitionId: z.string().uuid(),
  value: z.string(),
});

const initialStockSchema = z.object({
  quantity: z.number().int().min(1).max(10000),
  purchaseCostPrice: z.number().min(0),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Purchase date must be YYYY-MM-DD.'),
});

const createVariantSchema = z.object({
  sku: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  sellingPriceOverride: z.number().min(0).optional(),
  costPriceOverride: z.number().min(0).optional(),
  attributeValues: z.array(attributeValueSchema).default([]),
  sortOrder: z.number().int().optional(),
  initialStock: initialStockSchema.optional(),
});

const createProductSchema = z.object({
  retailTemplateId: z.string().min(1),
  categoryId: z.string().uuid('Please select a category.'),
  subcategoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Product name is required.'),
  baseSku: z.string().trim().min(1, 'SKU is required.'),
  description: z.string().trim().optional(),
  baseSellingPrice: z.number().min(0, 'Enter a valid selling price.'),
  baseCostPrice: z.number().min(0, 'Enter a valid cost price.'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']).optional(),
  attributeValues: z.array(attributeValueSchema).default([]),
  variants: z.array(createVariantSchema).min(1, 'Select at least one size.'),
});

// ── Existing routes (unchanged) ───────────────────────────────────────────────

productsRouter.get('/', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const q = req.query;
    res.json(
      await ProductService.searchProducts({
        storeId,
        query: typeof q.query === 'string' && q.query ? q.query : undefined,
        categoryId: typeof q.categoryId === 'string' && q.categoryId ? q.categoryId : undefined,
        subcategoryId: typeof q.subcategoryId === 'string' && q.subcategoryId ? q.subcategoryId : undefined,
        supplierId: typeof q.supplierId === 'string' && q.supplierId ? q.supplierId : undefined,
        status: typeof q.status === 'string' && q.status ? (q.status as never) : undefined,
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

productsRouter.post('/', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const input = createProductSchema.parse(req.body);
    const product = await ProductService.createProduct({
      ...input,
      storeId,
      createdBy: req.user!.userId,
    } as never);
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
});

productsRouter.get('/:id', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const product = await ProductService.getProductDetail(storeId, param(req.params, 'id'));
    if (!product) throw AppError.notFound('Product not found.');
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

productsRouter.put('/:id', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const updates = createProductSchema
      .partial()
      .pick({
        name: true, description: true, categoryId: true, subcategoryId: true,
        supplierId: true, baseSellingPrice: true, baseCostPrice: true, status: true,
      })
      .parse(req.body);
    const product = await ProductService.updateProduct(storeId, param(req.params, 'id'), {
      ...updates,
      updatedBy: req.user!.userId,
    } as never);
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

productsRouter.post('/:id/variants', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const input = createVariantSchema.parse(req.body);
    const variant = await VariantService.createVariant(
      storeId, param(req.params, 'id'), req.user!.userId, input as never
    );
    res.status(201).json({ variant });
  } catch (err) {
    next(err);
  }
});

productsRouter.put('/:id/variants/:variantId', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const updates = z.object({
      displayName: z.string().trim().min(1).optional(),
      sellingPriceOverride: z.number().min(0).nullable().optional(),
      costPriceOverride: z.number().min(0).nullable().optional(),
      isActive: z.boolean().optional(),
      attributeValues: z.array(attributeValueSchema).optional(),
    }).parse(req.body);
    const variant = await VariantService.updateVariant(
      storeId, param(req.params, 'id'), param(req.params, 'variantId'), updates
    );
    res.json({ variant });
  } catch (err) {
    next(err);
  }
});

// ── Week 6: Photo fingerprint ─────────────────────────────────────────────────

/**
 * POST /api/products/:id/fingerprint
 *
 * Body: { image: string }  — base64-encoded image (with or without data-URI prefix).
 *
 * Computes the DCT perceptual hash offline, runs quality checks and attribute
 * suggestions, persists the fingerprint on the product row, then returns
 * the full result so the frontend can show quality feedback and suggestions
 * without a second round-trip.
 *
 * Optional endpoint — skipping it never affects product CRUD.
 */
productsRouter.post('/:id/fingerprint', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const productId = param(req.params, 'id');

    // Confirm product belongs to this store
    const product = await db('products').where({ id: productId, store_id: storeId }).first();
    if (!product) throw AppError.notFound('Product not found.');

    const { image } = z.object({
      image: z.string().min(100, 'image must be a non-empty base64 string'),
    }).parse(req.body);

    // All computation is offline — no external calls
    const fingerprint = FingerprintService.computeFingerprint(image);
    const { score: qualityScore, issues: qualityIssues } = FingerprintService.checkPhotoQuality(image);
    const attributeSuggestions = FingerprintService.suggestAttributes(image);

    // Persist fingerprint as PostgreSQL FLOAT8[] (stored as JSON-compatible array)
    await db('products')
      .where({ id: productId })
      .update({
        photo_fingerprint: JSON.stringify(fingerprint),
        photo_quality_score: qualityScore,
        updated_at: new Date(),
      });

    res.json({
      fingerprint,
      qualityScore,
      qualityIssues,
      attributeSuggestions,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:id/similar
 *
 * Returns up to 5 products (excluding the queried product itself) whose stored
 * fingerprint has cosine similarity >= SIMILAR_THRESHOLD (0.50) to the target.
 *
 * Products with no fingerprint are excluded automatically.
 * When the target product has no fingerprint, returns { enabled: false }.
 */
productsRouter.get('/:id/similar', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const productId = param(req.params, 'id');
    const limit = Math.min(10, Math.max(1, Number(req.query.limit ?? 5)));

    // Fetch the target fingerprint
    const target = (await db('products')
      .where({ id: productId, store_id: storeId })
      .select('id', 'photo_fingerprint')
      .first()) as { id: string; photoFingerprint: string | null } | undefined;

    if (!target) throw AppError.notFound('Product not found.');

    if (!target.photoFingerprint) {
      res.json({ enabled: false, similar: [] });
      return;
    }

    let targetVec: number[];
    try {
      targetVec = JSON.parse(target.photoFingerprint) as number[];
    } catch {
      res.json({ enabled: false, similar: [] });
      return;
    }

    // Load all other fingerprinted products in this store
    const candidates = (await db('products')
      .where('store_id', storeId)
      .whereNot('id', productId)
      .whereNotNull('photo_fingerprint')
      .select('id', 'name', 'base_sku', 'photo_fingerprint', 'image_urls')) as Array<{
        id: string;
        name: string;
        baseSku: string;
        photoFingerprint: string;
        imageUrls: string;
      }>;

    // Compute cosine similarity and filter
    const results: SimilarProduct[] = [];
    for (const c of candidates) {
      let vec: number[];
      try {
        vec = JSON.parse(c.photoFingerprint) as number[];
      } catch {
        continue;
      }
      const similarity = FingerprintService.cosineSimilarity(targetVec, vec);
      if (similarity >= FingerprintService.SIMILAR_THRESHOLD) {
        results.push({
          productId: c.id,
          name: c.name,
          baseSku: c.baseSku,
          similarity: Math.round(similarity * 1000) / 1000,
          isPossibleDuplicate: similarity >= FingerprintService.DUPLICATE_THRESHOLD,
          imageUrls: (() => {
            try { return JSON.parse(c.imageUrls) as string[]; } catch { return []; }
          })(),
        });
      }
    }

    // Sort by descending similarity, return top N
    results.sort((a, b) => b.similarity - a.similarity);

    res.json({
      enabled: true,
      similar: results.slice(0, limit),
      duplicateThreshold: FingerprintService.DUPLICATE_THRESHOLD,
    });
  } catch (err) {
    next(err);
  }
});

// ── Week 6: Product performance ───────────────────────────────────────────────

/**
 * GET /api/products/:id/performance
 *
 * Returns cached (or freshly computed) performance metrics for a single product:
 * time-to-first-sale, sales velocity, sell-through rate, stock age, size demand.
 *
 * Query param: ?refresh=true forces re-computation even if a cache entry exists.
 */
productsRouter.get('/:id/performance', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const productId = param(req.params, 'id');
    const forceRefresh = req.query.refresh === 'true';

    const metrics = forceRefresh
      ? await ProductPerformanceService.computeForProduct(storeId, productId)
      : await ProductPerformanceService.getForProduct(storeId, productId);

    res.json({ metrics });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/products/performance/refresh
 *
 * Triggers a batch re-computation of performance metrics for ALL products in
 * the store. Returns a count of how many products were refreshed.
 * Runs synchronously (acceptable for stores with < 1000 products).
 */
productsRouter.post('/performance/refresh', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const result = await ProductPerformanceService.computeForStore(storeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
