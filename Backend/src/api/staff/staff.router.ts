/**
 * Staff routes — CRUD + session history, all scoped to the caller's store.
 */

import { Router } from 'express';
import { z } from 'zod';
import { StaffService } from '@/services/staff.service';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { param } from '@/shared/AppError';
import { ALL_ROLES } from '@/types/domain';

export const staffRouter = Router();
staffRouter.use(authenticate);

const roleSchema = z.enum(ALL_ROLES as [string, ...string[]]);

const createSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
  email: z.string().trim().email('Enter a valid email address.'),
  phone: z.string().trim().min(6, 'Enter a valid phone number.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: roleSchema,
});

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().min(6).optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
});

staffRouter.get('/', requirePermission('staff:view'), async (req, res, next) => {
  try {
    res.json({ staff: await StaffService.list(requireStoreId(req)) });
  } catch (err) {
    next(err);
  }
});

staffRouter.post('/', requirePermission('staff:create'), async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const staff = await StaffService.create(requireStoreId(req), req.user!.userId, input as never);
    res.status(201).json({ staff });
  } catch (err) {
    next(err);
  }
});

staffRouter.get('/:id', requirePermission('staff:view'), async (req, res, next) => {
  try {
    res.json({ staff: await StaffService.getById(requireStoreId(req), param(req.params, 'id')) });
  } catch (err) {
    next(err);
  }
});

staffRouter.put('/:id', requirePermission('staff:edit'), async (req, res, next) => {
  try {
    const updates = updateSchema.parse(req.body);
    const staff = await StaffService.update(
      requireStoreId(req), req.user!.userId, param(req.params, 'id'), updates as never
    );
    res.json({ staff });
  } catch (err) {
    next(err);
  }
});

staffRouter.post('/:id/deactivate', requirePermission('staff:deactivate'), async (req, res, next) => {
  try {
    const staff = await StaffService.deactivate(requireStoreId(req), req.user!.userId, param(req.params, 'id'));
    res.json({ staff });
  } catch (err) {
    next(err);
  }
});

staffRouter.get('/:id/sessions', requirePermission('staff:view'), async (req, res, next) => {
  try {
    res.json({ sessions: await StaffService.listSessions(requireStoreId(req), param(req.params, 'id')) });
  } catch (err) {
    next(err);
  }
});
