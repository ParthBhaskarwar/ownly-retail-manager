/**
 * Customer management routes.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { db } from '../../db/client';
import { v4 as uuidv4 } from 'uuid';

export const customersRouter = Router();

customersRouter.use(authenticate);

// GET /api/customers?query=
customersRouter.get('/', async (req, res): Promise<void> => {
  try {
    const storeId = req.user?.storeId;
    const queryStr = req.query.query as string;

    let query = db('customers');
    if (storeId) query = query.where('store_id', storeId);

    if (queryStr) {
      query = query.andWhere((builder) => {
        builder.where('name', 'ilike', `%${queryStr}%`)
          .orWhere('phone', 'like', `%${queryStr}%`);
      });
    }

    const customers = await query.orderBy('created_at', 'desc').limit(20);
    res.json(customers);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// POST /api/customers
customersRouter.post('/', async (req, res): Promise<void> => {
  try {
    const storeId = req.user?.storeId;
    const { name, phone, email } = req.body;

    if (!name || !phone) {
      res.status(400).json({ error: 'Name and phone are required' });
      return;
    }

    let existing = await db('customers')
      .where({ phone })
      .modify((qb) => {
        if (storeId) qb.andWhere('store_id', storeId);
      })
      .first();

    if (existing) {
      res.json(existing);
      return;
    }

    const id = uuidv4();
    const newCustomer = {
      id,
      store_id: storeId || null,
      name,
      phone,
      email: email || null,
      total_purchases: 0,
    };

    await db('customers').insert(newCustomer);
    res.status(201).json(newCustomer);
  } catch (err: any) {
    console.error('[CREATE_CUSTOMER_ERROR]', err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});
