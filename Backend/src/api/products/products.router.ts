/**
 * Products routes — search, create (with variants + opening stock), detail, update.
 *
 * storeId always comes from the caller's token, never the body, so a client
 * cannot read or write another store's products.
 */

import { Router } from 'express';
import { z } from 'zod';
import { ProductService, VariantService } from '@/services/product.service';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { AppError, param } from '@/shared/AppError';

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
