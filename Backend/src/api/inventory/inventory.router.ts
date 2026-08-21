/**
 * Inventory routes.
 * Full implementation in Week 6.
 *
 * The barcode lookup endpoint (GET /api/inventory/barcode/:barcode)
 * is the critical billing hook — must return sub-10ms for POS use.
 */

import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

// GET /api/inventory?status=&variantId=&page=
inventoryRouter.get('/', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet — coming in Week 6' });
});

// POST /api/inventory/stock   ← Add stock batch
inventoryRouter.post('/stock', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet — coming in Week 6' });
});

// GET /api/inventory/barcode/:barcode   ← Billing hook (Week 3 on frontend, Week 6 on backend)
inventoryRouter.get('/barcode/:barcode', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet — coming in Week 6' });
});

// PUT /api/inventory/:itemId/status
inventoryRouter.put('/:itemId/status', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet — coming in Week 6' });
});

// GET /api/inventory/:itemId/movements
inventoryRouter.get('/:itemId/movements', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet — coming in Week 6' });
});
