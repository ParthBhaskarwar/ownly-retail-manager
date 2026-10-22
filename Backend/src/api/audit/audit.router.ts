/**
 * Audit Router — /api/audit
 *
 * GET /api/audit          → list audit logs with filters and pagination
 * GET /api/audit/actions  → list distinct logged actions for filter dropdowns
 *
 * Requires audit:view permission (OWNER, MANAGER, ACCOUNTANT).
 */

import { Router } from 'express';
import { AuditService } from '@/services/audit.service';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';

export const auditRouter = Router();
auditRouter.use(authenticate);
auditRouter.use(requirePermission('audit:view'));

/** GET /api/audit — list audit trail records */
auditRouter.get('/', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const limit = req.query['limit'] ? Number(req.query['limit']) : 50;
    const offset = req.query['offset'] ? Number(req.query['offset']) : 0;
    const action = req.query['action'] ? String(req.query['action']) : undefined;
    const entityType = req.query['entityType'] ? String(req.query['entityType']) : undefined;
    const userId = req.query['userId'] ? String(req.query['userId']) : undefined;
    const startDate = req.query['startDate'] ? String(req.query['startDate']) : undefined;
    const endDate = req.query['endDate'] ? String(req.query['endDate']) : undefined;
    const search = req.query['search'] ? String(req.query['search']) : undefined;

    const result = await AuditService.listByStore(storeId, {
      limit,
      offset,
      action,
      entityType,
      userId,
      startDate,
      endDate,
      search,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/audit/actions — distinct actions */
auditRouter.get('/actions', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const actions = await AuditService.getDistinctActions(storeId);
    res.json({ actions });
  } catch (err) {
    next(err);
  }
});
