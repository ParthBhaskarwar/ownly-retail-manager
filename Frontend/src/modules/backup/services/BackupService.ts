/**
 * BackupService — thin client over the server-side backup API.
 *
 * Backups are JSON snapshots the server writes for the caller's store. The
 * browser never assembles a backup itself (the old version built an empty
 * payload from a local database that no longer holds any data).
 */

import { apiClient } from '@/lib/apiClient';
import type { BackupHealth, BackupRecord, BackupStatus, RestoreSummary } from '../types';

export const BACKUP_REMINDER_DAYS = 7;

/** Pure: turns "when was the last backup" into the reminder shown on the page. */
export function getBackupStatus(latestBackupAt: string | null, now: number = Date.now()): BackupStatus {
  if (!latestBackupAt) {
    return {
      backupDue: true,
      daysSinceLastBackup: null,
      tier: 'CRITICAL',
      message: 'No backup has been created for this store yet.',
    };
  }
  const days = Math.max(0, Math.floor((now - new Date(latestBackupAt).getTime()) / 86_400_000));
  if (days >= BACKUP_REMINDER_DAYS) {
    return {
      backupDue: true,
      daysSinceLastBackup: days,
      tier: 'WARNING',
      message: `Last backup was ${days} day${days === 1 ? '' : 's'} ago. Weekly backups are recommended.`,
    };
  }
  return {
    backupDue: false,
    daysSinceLastBackup: days,
    tier: 'HEALTHY',
    message: days === 0 ? 'Backed up today.' : `Last backup was ${days} day${days === 1 ? '' : 's'} ago.`,
  };
}

export const BackupService = {
  async createBackup(): Promise<BackupRecord> {
    const { backup } = await apiClient.post<{ backup: BackupRecord }>('/api/backup');
    return backup;
  },

  async listBackups(): Promise<BackupRecord[]> {
    const { backups } = await apiClient.get<{ backups: BackupRecord[] }>('/api/backup');
    return backups;
  },

  async getHealth(): Promise<BackupHealth> {
    const { health } = await apiClient.get<{ health: BackupHealth }>('/api/backup/health');
    return health;
  },

  /** Downloads the backup file through the browser (with the auth header). */
  async downloadBackup(record: Pick<BackupRecord, 'id' | 'filename'>): Promise<void> {
    const blob = await apiClient.getBlob(`/api/backup/${record.id}/download`);
    if (typeof window === 'undefined') return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = record.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Re-inserts any rows from the snapshot that are missing from the database.
   * Rows that still exist are left as they are (it never overwrites newer data).
   */
  async restoreBackup(id: string): Promise<RestoreSummary> {
    const { summary } = await apiClient.post<{ summary: RestoreSummary }>(`/api/backup/${id}/restore`);
    return summary;
  },
};
