/**
 * Ownly Backend — Express app entry point.
 *
 * Wires middleware, routes, and starts the HTTP server.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env';

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
  res.json({ status: 'ok', version: '0.1.0', env: config.nodeEnv });
});

// ─── Routes (wired in Week 6) ─────────────────────────────────────────────────
// import { authRouter }      from './api/auth/auth.router';
// import { storeRouter }     from './api/store/store.router';
// import { productsRouter }  from './api/products/products.router';
// import { inventoryRouter } from './api/inventory/inventory.router';
// import { billingRouter }   from './api/billing/billing.router';
// import { staffRouter }     from './api/staff/staff.router';

// app.use('/api/auth',      authRouter);
// app.use('/api/store',     storeRouter);
// app.use('/api/products',  productsRouter);
// app.use('/api/inventory', inventoryRouter);
// app.use('/api/billing',   billingRouter);
// app.use('/api/staff',     staffRouter);

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
app.listen(PORT, () => {
  console.log(`🚀 Ownly backend running on http://localhost:${PORT}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});

export default app;
