/**
 * Auth routes — signup, verify, login, logout, me.
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from '@/services/auth.service';
import { StoreService } from '@/services/store.service';
import { authenticate } from '@/middleware/auth.middleware';
import { AppError } from '@/shared/AppError';
import { rateLimit } from '@/middleware/rateLimit';
import type { DeviceInfo } from '@/types/domain';

export const authRouter = Router();

const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30 });
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
  email: z.string().trim().email('Enter a valid email address.'),
  phone: z.string().trim().min(6, 'Enter a valid phone number.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const verifySchema = z.object({
  userId: z.string().uuid(),
  code: z.string().length(6, 'The verification code is 6 digits.'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
  deviceInfo: z
    .object({ userAgent: z.string(), platform: z.string(), language: z.string() })
    .nullish(),
});

authRouter.post('/signup', signupLimiter, async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    res.status(201).json(await AuthService.signUp(input));
  } catch (err) {
    next(err);
  }
});

authRouter.post('/verify', codeLimiter, async (req, res, next) => {
  try {
    const { userId, code } = verifySchema.parse(req.body);
    await AuthService.verify(userId, code);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/resend-code', codeLimiter, async (req, res, next) => {
  try {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
    res.json(await AuthService.resendCode(userId));
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password, deviceInfo } = loginSchema.parse(req.body);
    res.json(await AuthService.login({ email, password }, (deviceInfo as DeviceInfo) ?? null));
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    await AuthService.logout(req.user!.userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Resolves the caller from their token and returns their store alongside, so
 * the frontend can restore a session in one request on page load.
 */
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await AuthService.me(req.user!.userId);
    const store = user.storeId ? await StoreService.getById(user.storeId) : null;
    res.json({ user, store });
  } catch (err) {
    next(err);
  }
});

/**
 * Issues a fresh token. Needed right after store creation: the original token
 * was signed with storeId=null, so without this the client would keep sending
 * a token that fails requireStoreId until the user logged out and back in.
 */
authRouter.post('/refresh', authenticate, async (req, res, next) => {
  try {
    const user = await AuthService.me(req.user!.userId);
    if (!user) throw AppError.unauthorized();
    res.json({ user, token: AuthService.issueToken(user) });
  } catch (err) {
    next(err);
  }
});
