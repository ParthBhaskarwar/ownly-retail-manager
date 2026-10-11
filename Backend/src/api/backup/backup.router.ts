/**
 * Backup Router — /api/backup
 *
 * POST   /api/backup           → create a new backup
 * GET    /api/backup           → list backup history
 * GET    /api/backup/health    → storage health status
 * GET    /api/backup/:id/download  → download backup JSON file
 * POST   /api/backup/:id/restore   → restore from backup
 *
 * All routes require settings:edit (OWNER / MANAGER only).
 */

import { Router } from 'express';
import fs from 'fs';
import { BackupService } from '@/services/backup.service';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { AppError, param } from '@/shared/AppError';

export const backupRouter = Router();
backupRouter.use(authenticate);
backupRouter.use(requirePermission('settings:edit'));

/** POST /api/backup — create a new full backup */
backupRouter.post('/', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const backup = await BackupService.createBackup(storeId, req.user!.userId);
    res.status(201).json({ backup });
  } catch (err) { next(err); }
});

/** GET /api/backup — list backup records with file-exists flag */
backupRouter.get('/', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const backups = await BackupService.listBackups(storeId);
    res.json({ backups, count: backups.length });
  } catch (err) { next(err); }
});

/** GET /api/backup/health — storage health */
backupRouter.get('/health', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const health = await BackupService.getStorageHealth(storeId);
    res.json({ health });
  } catch (err) { next(err); }
});

/** GET /api/backup/:id/download — stream backup file as download */
backupRouter.get('/:id/download', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const backupId = param(req.params, 'id');
    const filepath = await BackupService.getFilePath(storeId, backupId);

    const filename = filepath.split(/[\\/]/).pop() ?? 'backup.json';
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filepath).pipe(res);
  } catch (err) { next(err); }
});

/** POST /api/backup/:id/restore — restore from a backup file */
backupRouter.post('/:id/restore', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const backupId = param(req.params, 'id');
    const summary = await BackupService.restoreBackup(storeId, backupId, req.user!.userId);
    res.json({ summary });
  } catch (err) { next(err); }
});
