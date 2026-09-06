/**
 * Inventory routes.
 *
 * GET /barcode/:barcode is the billing hook — it must stay a single indexed
 * lookup on (store_id, barcode) so POS scanning stays fast.
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/db/client';
import { InventoryService } from '@/services/inventory.service';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { AppError, param, queryParam } from '@/shared/AppError';
import { ALL_INVENTORY_STATUSES, ALL_MOVEMENT_TYPES, type InventoryStatus, type MovementType } from '@/types/domain';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

const addStockSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10000),
  purchaseCostPrice: z.number().min(0),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Purchase date must be YYYY-MM-DD.'),
  barcodes: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().optional(),
});

inventoryRouter.get('/', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const q = req.query;
    res.json(
      await InventoryService.search({
        storeId,
        status: queryParam(q.status) as never,
        variantId: queryParam(q.variantId),
        barcode: queryParam(q.barcode),
        query: queryParam(q.query),
        categoryId: queryParam(q.categoryId),
        supplierId: queryParam(q.supplierId),
        size: queryParam(q.size),
        purchaseDateFrom: queryParam(q.purchaseDateFrom),
        purchaseDateTo: queryParam(q.purchaseDateTo),
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

/** Stock cost value, expected selling value and potential gross profit. */
inventoryRouter.get('/valuation', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    res.json({
      valuation: await InventoryService.getValuation(storeId, {
        categoryId: queryParam(req.query.categoryId),
        supplierId: queryParam(req.query.supplierId),
      }),
    });
  } catch (err) {
    next(err);
  }
});

/** Low-stock, out-of-stock and stock-ageing alerts. */
inventoryRouter.get('/alerts', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    res.json({ alerts: await InventoryService.getAlerts(requireStoreId(req)) });
  } catch (err) {
    next(err);
  }
});

/** Add a batch of physical stock — generates one unique barcode per unit. */
inventoryRouter.post('/stock', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const input = addStockSchema.parse(req.body);

    // The SKU is used only for the readable middle segment of the barcode;
    // read it from the variant rather than trusting the client.
    const variant = await db('product_variants as v')
      .join('products as p', 'p.id', 'v.product_id')
      .where({ 'v.id': input.variantId, 'p.store_id': storeId })
      .select('v.sku')
      .first();
    if (!variant) throw AppError.notFound('Variant not found in this store.');

    const items = await InventoryService.addStock(
      { ...input, storeId, performedBy: req.user!.userId },
      variant.sku
    );
    res.status(201).json({ items, count: items.length });
  } catch (err) {
    next(err);
  }
});

/** Single item with joined product/variant context. */
inventoryRouter.get('/item/:itemId', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const item = await InventoryService.getRowById(storeId, param(req.params, 'itemId'));
    if (!item) throw AppError.notFound('Inventory item not found.');
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/barcode/:barcode', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const item = await InventoryService.findByBarcode(storeId, param(req.params, 'barcode'));
    if (!item) throw AppError.notFound('No item found with that barcode.');
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.put('/:itemId/status', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const input = z.object({
      newStatus: z.enum(ALL_INVENTORY_STATUSES as [string, ...string[]]),
      movementType: z.enum(ALL_MOVEMENT_TYPES as [string, ...string[]]),
      referenceType: z.enum(['INVOICE', 'RETURN_TRANSACTION', 'MANUAL_ADJUSTMENT', 'PURCHASE_ENTRY']),
      referenceId: z.string().uuid(),
      notes: z.string().trim().optional(),
    }).parse(req.body);

    const item = await InventoryService.updateStatus(storeId, {
      ...input,
      newStatus: input.newStatus as InventoryStatus,
      movementType: input.movementType as MovementType,
      inventoryItemId: param(req.params, 'itemId'),
      performedBy: req.user!.userId,
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/:itemId/movements', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    res.json({ movements: await InventoryService.getMovementsForItem(storeId, param(req.params, 'itemId')) });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/variants/:variantId/stock', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    requireStoreId(req);
    res.json({ stock: await InventoryService.getStockSummary(param(req.params, 'variantId')) });
  } catch (err) {
    next(err);
  }
});
