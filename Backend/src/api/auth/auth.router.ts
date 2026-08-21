/**
 * Auth routes — signup, login, verify, logout.
 * Full implementation in Week 6.
 */

import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';

export const authRouter = Router();

// POST /api/auth/signup
authRouter.post('/signup', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet — coming in Week 6' });
});

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet — coming in Week 6' });
});

// POST /api/auth/verify
authRouter.post('/verify', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet — coming in Week 6' });
});

// POST /api/auth/logout
authRouter.post('/logout', authenticate, async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet — coming in Week 6' });
});
