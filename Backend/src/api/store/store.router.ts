/**
 * Store routes — profile, creation, onboarding state.
 */

import { Router } from 'express';
import { z } from 'zod';
import { StoreService } from '@/services/store.service';
import { AuthService } from '@/services/auth.service';
import { authenticate, requirePermission, requireRole, requireStoreId } from '@/middleware/auth.middleware';

export const storeRouter = Router();
storeRouter.use(authenticate);

const taxSettingsSchema = z.object({
  gstEnabled: z.boolean(),
  gstRate: z.number().min(0).max(100),
  inclusiveTax: z.boolean(),
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'Store name is required.'),
  address: z.string().trim().min(1, 'Address is required.'),
  phone: z.string().trim().min(6, 'Phone number is required.'),
  retailType: z.string().trim().min(1, 'Retail type is required.'),
  currency: z.string().length(3).optional(),
  gstNumber: z.string().trim().optional(),
  taxSettings: taxSettingsSchema.optional(),
});

/** Current user's store, or null if onboarding is incomplete. */
storeRouter.get('/', async (req, res, next) => {
  try {
    const user = await AuthService.me(req.user!.userId);
    const store = user.storeId
      ? await StoreService.getById(user.storeId)
      : await StoreService.getByOwnerId(user.id);
    res.json({ store });
  } catch (err) {
    next(err);
  }
});

storeRouter.get('/onboarding', async (req, res, next) => {
  try {
    res.json(await StoreService.getOnboardingState(req.user!.userId));
  } catch (err) {
    next(err);
  }
});

/**
 * Creating the store changes the caller's storeId, so a fresh token is
 * returned with the response — see POST /api/auth/refresh for the rationale.
 */
storeRouter.post('/', requireRole('OWNER'), async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const store = await StoreService.create(req.user!.userId, input);
    const user = await AuthService.me(req.user!.userId);
    res.status(201).json({ store, user, token: AuthService.issueToken(user) });
  } catch (err) {
    next(err);
  }
});

storeRouter.put('/', requirePermission('settings:edit'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const updates = createSchema.partial().extend({ logoUrl: z.string().optional() }).parse(req.body);
    res.json({ store: await StoreService.update(storeId, req.user!.userId, updates) });
  } catch (err) {
    next(err);
  }
});

storeRouter.post('/complete-setup', requireRole('OWNER'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    res.json({ store: await StoreService.markSetupComplete(storeId, req.user!.userId) });
  } catch (err) {
    next(err);
  }
});
