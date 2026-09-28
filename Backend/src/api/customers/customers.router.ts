/**
 * Customer routes — always scoped to the caller's store.
 */

import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db/client';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { queryParam } from '@/shared/AppError';

export const customersRouter = Router();
customersRouter.use(authenticate);

/** Escapes LIKE wildcards so user text is matched literally. */
const likeTerm = (s: string): string => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// GET /api/customers?query=
customersRouter.get('/', requirePermission('billing:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const term = queryParam(req.query.query);

    const qb = db('customers').where('store_id', storeId);
    if (term) {
      qb.andWhere((b) => {
        b.whereILike('name', likeTerm(term)).orWhereLike('phone', likeTerm(term));
      });
    }

    res.json(await qb.orderBy('created_at', 'desc').limit(20));
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(255),
  phone: z.string().trim().min(6, 'Enter a valid phone number.').max(20),
  email: z.string().trim().email('Enter a valid email address.').max(320).optional().or(z.literal('')),
});

// POST /api/customers — returns the existing customer when the phone is already known
customersRouter.post('/', requirePermission('billing:create'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const input = createSchema.parse(req.body);

    const existing = await db('customers').where({ store_id: storeId, phone: input.phone }).first();
    if (existing) {
      res.json(existing);
      return;
    }

    const customer = {
      id: uuidv4(),
      store_id: storeId,
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      total_purchases: 0,
    };
    await db('customers').insert(customer);
    res.status(201).json({
      id: customer.id,
      storeId,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      totalPurchases: 0,
    });
  } catch (err) {
    next(err);
  }
});
