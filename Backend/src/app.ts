/**
 * Ownly Backend — Express app entry point.
 *
 * Wires middleware, routes, and starts the HTTP server.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env';

import { authRouter } from './api/auth/auth.router';
import { productsRouter } from './api/products/products.router';
import { inventoryRouter } from './api/inventory/inventory.router';
import { billingRouter } from './api/billing/billing.router';
import { returnsRouter } from './api/returns/returns.router';
import { exchangesRouter } from './api/exchanges/exchanges.router';
import { creditNotesRouter } from './api/credit_notes/credit_notes.router';
import { customersRouter } from './api/customers/customers.router';

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', env: config.nodeEnv });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/billing', billingRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/exchanges', exchangesRouter);
app.use('/api/credit-notes', creditNotesRouter);
app.use('/api/customers', customersRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = config.port;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Ownly backend running on http://localhost:${PORT}`);
    console.log(`   Environment: ${config.nodeEnv}`);
  });
}

export default app;
