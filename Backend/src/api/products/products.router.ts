/**
 * Products routes — CRUD + variants.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';

export const productsRouter = Router();

productsRouter.use(authenticate);

// GET /api/products
productsRouter.get('/', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/products
productsRouter.post('/', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// GET /api/products/:id
productsRouter.get('/:id', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// PUT /api/products/:id
productsRouter.put('/:id', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/products/:id/variants
productsRouter.post('/:id/variants', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// PUT /api/products/:id/variants/:variantId
productsRouter.put('/:id/variants/:variantId', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});
