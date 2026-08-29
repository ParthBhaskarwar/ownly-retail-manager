/**
 * Auth routes — signup, login, verify, logout.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';

export const authRouter = Router();

// POST /api/auth/signup
authRouter.post('/signup', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/auth/verify
authRouter.post('/verify', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/auth/logout
authRouter.post('/logout', authenticate, async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});
