/**
 * Backup types — mirror the backend /api/backup responses.
 */

export interface BackupRecord {
  id: string;
  filename: string;
  fileSizeBytes: number;
  createdBy: string;
  createdAt: string;
  /** false when the file was deleted from the server's disk after the record was made. */
  fileExists: boolean;
}

export interface BackupHealth {
  backupCount: number;
  latestBackupAt: string | null;
  totalSizeBytes: number;
  directoryExists: boolean;
  database?: {
    connected: boolean;
    tableCounts: Record<string, number>;
    totalRecords: number;
  };
  healthTier?: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  backupDue?: boolean;
}

export interface RestoreSummary {
  backupId: string;
  tablesRestored: string[];
  rowsInserted: Record<string, number>;
  notes: string;
}

export interface BackupStatus {
  backupDue: boolean;
  daysSinceLastBackup: number | null;
  tier: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  message: string;
}
