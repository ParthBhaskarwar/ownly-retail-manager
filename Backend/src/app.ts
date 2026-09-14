/**
 * Ownly Backend — Express app entry point.
 *
 * Wires middleware and routes, verifies the database connection, and starts
 * the HTTP server.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { ZodError } from 'zod';
import { config } from './config/env';
import { assertDbConnection } from './db/client';
import { AppError } from './shared/AppError';

// ─── Routers ─────────────────────────────────────────────────────────────────
import { authRouter } from './api/auth/auth.router';
import { storeRouter } from './api/store/store.router';
import { staffRouter } from './api/staff/staff.router';
import { catalogRouter } from './api/catalog/catalog.router';
import { productsRouter } from './api/products/products.router';
import { inventoryRouter } from './api/inventory/inventory.router';
// Week 4 — billing, POS, returns, exchanges
import { billingRouter } from './api/billing/billing.router';
import { returnsRouter } from './api/returns/returns.router';
import { exchangesRouter } from './api/exchanges/exchanges.router';
import { creditNotesRouter } from './api/credit_notes/credit_notes.router';
import { customersRouter } from './api/customers/customers.router';
// Week 5 — restocking, dashboard, reports, backup
import { restockRouter } from './api/inventory/restock.router';
import { dashboardRouter } from './api/dashboard/dashboard.router';
import { reportsRouter } from './api/reports/reports.router';
import { backupRouter } from './api/backup/backup.router';

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.6.0', env: config.nodeEnv });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/store', storeRouter);
app.use('/api/staff', staffRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/products', productsRouter);
app.use('/api/inventory', inventoryRouter);
// Week 4 routes
app.use('/api/billing', billingRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/exchanges', exchangesRouter);
app.use('/api/credit-notes', creditNotesRouter);
app.use('/api/customers', customersRouter);
// Week 5 routes
app.use('/api/inventory/restock', restockRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/backup', backupRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// Translates the three error kinds services produce into JSON the frontend can
// display directly. Anything unrecognised is a bug: logged in full, returned
// as a generic 500 so internals never leak to the client.
app.use((
  err: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  if (err instanceof ZodError) {
    // Surface the first validation message — the forms show a single error line.
    const first = err.issues[0];
    res.status(400).json({
      error: first?.message ?? 'Invalid request.',
      field: first?.path?.join('.'),
      issues: err.issues,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // Postgres unique violation that escaped a service's own handling.
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
    res.status(409).json({ error: 'That value already exists.' });
    return;
  }

  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    await assertDbConnection();
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', (err as Error).message);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`🚀 Ownly backend running on http://localhost:${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
  });
}

// Only bind a port when run directly (`npm run dev` / `npm start`).
// Integration tests import this module to drive the app through supertest,
// which needs the routes but must not occupy port 4000.
if (require.main === module) {
  void start();
}

export default app;
