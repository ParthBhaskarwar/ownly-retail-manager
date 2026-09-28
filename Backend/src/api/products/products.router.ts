/**
 * Products routes — search, create (with variants + opening stock), detail,
 * update; Week 6 adds photo analysis (CLIP embeddings + pgvector similar-product
 * search) and product-performance endpoints.
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
  EmbeddingService,
  EmbeddingUnavailableError,
  InvalidImageError,
} from '@/services/embedding.service';
import { ProductEmbeddingRepository } from '@/services/product-embedding.repository';
import { ProductPerformanceService } from '@/services/product-performance.service';
import { db } from '@/db/client';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { AppError, param } from '@/shared/AppError';
import type { PhotoAnalysisResult } from '@/types/domain';

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
  imageUrls: z.array(z.string()).optional(),
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
        imageUrls: true, attributeValues: true,
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
 * POST /api/products/analyze-photo
 *
 * Body: { image: string, excludeProductId?: uuid } — base64 image (data-URI prefix optional).
 *
 * Works before a product exists (Add Product) and for saved products (pass
 * excludeProductId so a product never matches itself). Returns:
 *   - photo quality (real pixel checks; needs no model)
 *   - colour / pattern suggestions (CLIP zero-shot)
 *   - existing products that look like this photo, with a duplicate flag
 *
 * Nothing is saved here — embeddings are stored when the product itself is
 * saved. Every AI part degrades gracefully: with the model off or the pgvector
 * migration not applied you still get quality feedback and HTTP 200.
 */
productsRouter.post('/analyze-photo', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const { image, excludeProductId } = z.object({
      image: z.string().min(100, 'image must be a non-empty base64 string'),
      excludeProductId: z.string().uuid().optional(),
    }).parse(req.body);

    let quality;
    try {
      quality = await EmbeddingService.checkPhotoQuality(image);
    } catch (err) {
      if (err instanceof InvalidImageError) throw AppError.badRequest('That file could not be read as an image.');
      throw err;
    }

    const result: PhotoAnalysisResult = {
      aiAvailable: false,
      qualityScore: quality.score,
      qualityIssues: quality.issues,
      attributeSuggestions: null,
      similar: [],
      duplicateThreshold: EmbeddingService.DUPLICATE_THRESHOLD,
    };

    try {
      const embedding = await EmbeddingService.embedImage(image);
      result.aiAvailable = true;
      result.attributeSuggestions = await EmbeddingService.suggestAttributes(embedding);
      try {
        result.similar = await ProductEmbeddingRepository.searchByVector(storeId, embedding, {
          excludeProductId,
          limit: 5,
        });
      } catch (err) {
        console.warn('[embedding] similar-product search failed (is migration 008 applied?):', (err as Error).message);
        result.message = 'Similar-product search is not ready yet.';
      }
    } catch (err) {
      if (err instanceof EmbeddingUnavailableError) {
        result.message = 'Photo AI is not available — colour suggestions and duplicate check are off.';
      } else if (err instanceof InvalidImageError) {
        throw AppError.badRequest('That file could not be read as an image.');
      } else {
        throw err;
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:id/similar
 *
 * Products whose photos look like this product's photos (best photo pair wins),
 * from the pgvector index. { enabled: false } when the product has no embeddings
 * yet (no photo, photo AI off, or migration 008 not applied).
 */
productsRouter.get('/:id/similar', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const productId = param(req.params, 'id');
    const limit = Math.min(10, Math.max(1, Number(req.query.limit ?? 5)));

    const exists = await db('products').where({ id: productId, store_id: storeId }).first('id');
    if (!exists) throw AppError.notFound('Product not found.');

    let similar;
    try {
      similar = await ProductEmbeddingRepository.findSimilarToProduct(storeId, productId, limit);
    } catch (err) {
      console.warn('[embedding] similar lookup failed (is migration 008 applied?):', (err as Error).message);
      res.json({ enabled: false, similar: [] });
      return;
    }

    if (similar === null) {
      res.json({ enabled: false, similar: [] });
      return;
    }

    res.json({
      enabled: true,
      similar,
      duplicateThreshold: EmbeddingService.DUPLICATE_THRESHOLD,
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
productsRouter.post('/performance/refresh', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const result = await ProductPerformanceService.computeForStore(storeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
