/**
 * Inventory routes with Barcode Lookup hook.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { db } from '../../db/client';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

// GET /api/inventory/barcode/:barcode   ← POS Billing hook
inventoryRouter.get('/barcode/:barcode', async (req, res): Promise<void> => {
  try {
    const { barcode } = req.params;
    const storeId = req.user?.storeId;

    if (!barcode) {
      res.status(400).json({ error: 'Barcode parameter is required', code: 'INVALID_BARCODE' });
      return;
    }

    let query = db('inventory_items')
      .join('product_variants', 'inventory_items.variant_id', 'product_variants.id')
      .join('products', 'product_variants.product_id', 'products.id')
      .select(
        'inventory_items.id as inventoryItemId',
        'inventory_items.barcode',
        'inventory_items.status as itemStatus',
        'inventory_items.purchase_cost_price as costPrice',
        'product_variants.id as variantId',
        'product_variants.display_name as variantName',
        'product_variants.sku',
        'product_variants.selling_price_override',
        'products.id as productId',
        'products.name as productName',
        'products.base_selling_price as baseSellingPrice',
        'products.store_id as storeId'
      )
      .where('inventory_items.barcode', barcode);

    if (storeId) {
      query = query.andWhere('inventory_items.store_id', storeId);
    }

    const item = await query.first();

    if (!item) {
      res.status(404).json({ error: 'Barcode not found', code: 'BARCODE_NOT_FOUND' });
      return;
    }

    if (item.itemStatus === 'SOLD') {
      res.status(400).json({ error: 'Barcode has already been sold', code: 'BARCODE_ALREADY_SOLD' });
      return;
    }

    if (item.itemStatus === 'DAMAGED' || item.itemStatus === 'RETURNED_DAMAGED' || item.itemStatus === 'LOST') {
      res.status(400).json({ error: 'Item is damaged or unavailable', code: 'BARCODE_UNAVAILABLE' });
      return;
    }

    if (item.itemStatus !== 'IN_STOCK' && item.itemStatus !== 'RETURNED_TO_STOCK') {
      res.status(400).json({ error: `Item is not available (Current status: ${item.itemStatus})`, code: 'BARCODE_UNAVAILABLE' });
      return;
    }

    const sellingPrice = parseFloat(item.selling_price_override ?? item.baseSellingPrice);

    res.json({
      inventoryItemId: item.inventoryItemId,
      barcode: item.barcode,
      productId: item.productId,
      productName: item.productName,
      variantId: item.variantId,
      variantName: item.variantName || item.sku,
      sku: item.sku,
      unitPrice: sellingPrice,
      status: item.itemStatus,
    });
  } catch (err: any) {
    console.error('[BARCODE_LOOKUP_ERROR]', err);
    res.status(500).json({ error: 'Failed to process barcode lookup' });
  }
});

// GET /api/inventory — List inventory items with optional filters
inventoryRouter.get('/', async (req, res): Promise<void> => {
  try {
    const storeId = req.user?.storeId;
    const { status, variantId } = req.query;

    let query = db('inventory_items')
      .join('product_variants', 'inventory_items.variant_id', 'product_variants.id')
      .join('products', 'product_variants.product_id', 'products.id')
      .select(
        'inventory_items.*',
        'product_variants.display_name as variantName',
        'product_variants.sku',
        'products.name as productName'
      );

    if (storeId) query = query.where('inventory_items.store_id', storeId);
    if (status) query = query.where('inventory_items.status', status as string);
    if (variantId) query = query.where('inventory_items.variant_id', variantId as string);

    const items = await query.limit(100);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});
