/**
 * Restock Router — POST /api/inventory/restock
 *
 * Accepts an array of { variantId, quantity, purchaseCostPrice, purchaseDate }
 * lines representing a single manual restock operation (e.g. supplier delivery).
 * Each variant line may represent a different size.  All lines are processed in
 * one transaction; new unique barcodes are generated for every physical unit.
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/db/client';
import { InventoryService } from '@/services/inventory.service';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';

export const restockRouter = Router();
restockRouter.use(authenticate);

const restockLineSchema = z.object({
  variantId: z.string().uuid('variantId must be a UUID.'),
  quantity: z.number().int().min(1).max(10_000),
  purchaseCostPrice: z.number().min(0),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'purchaseDate must be YYYY-MM-DD.'),
});

const restockSchema = z.object({
  lines: z
    .array(restockLineSchema)
    .min(1, 'At least one restock line is required.')
    .max(200, 'Maximum 200 variant lines per restock batch.'),
  notes: z.string().trim().max(500).optional(),
});

/**
 * POST /api/inventory/restock
 *
 * Body: { lines: [{ variantId, quantity, purchaseCostPrice, purchaseDate }][], notes? }
 *
 * Returns: { batchId, totalUnits, lines: [{ variantId, itemsCreated }] }
 *
 * Each call creates a restock_batch row for history, plus inventory_items and
 * RESTOCK inventory_movements for every physical unit.
 */
restockRouter.post('/', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const { lines, notes } = restockSchema.parse(req.body);

    const result = await InventoryService.restockVariants({
      storeId,
      performedBy: req.user!.userId,
      lines,
      notes,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/inventory/restock — list restock batch history for the store.
 */
restockRouter.get('/', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const batches = await db('restock_batches as rb')
      .where('rb.store_id', storeId)
      .leftJoin('users as u', 'u.id', 'rb.performed_by')
      .select(
        'rb.*',
        db.ref('u.name').as('performed_by_name')
      )
      .orderBy('rb.created_at', 'desc')
      .limit(limit);

    res.json({ batches, count: batches.length });
  } catch (err) {
    next(err);
  }
});
