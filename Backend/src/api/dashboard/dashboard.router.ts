/**
 * Dashboard Router — GET /api/dashboard/summary
 *
 * Backs the Week 5 operational dashboard. All data is computed from PostgreSQL
 * so the frontend no longer needs to read from browser IndexedDB (Dexie).
 */

import { Router } from 'express';
import { DashboardService } from '@/services/dashboard.service';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

/**
 * GET /api/dashboard/summary
 *
 * Returns:
 *  { salesKpi, stockKpi, topSellers, slowMovers, productPerformance, recentInvoices }
 */
dashboardRouter.get('/summary', requirePermission('dashboard:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const summary = await DashboardService.getSummary(storeId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});
