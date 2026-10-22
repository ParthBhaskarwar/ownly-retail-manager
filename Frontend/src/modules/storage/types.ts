/**
 * Storage Health types — encompasses server disk, PostgreSQL table counts, and browser IndexedDB quota.
 */

export interface DatabaseStorageHealth {
  connected: boolean;
  tableCounts: Record<string, number>;
  totalRecords: number;
}

export interface StorageHealthData {
  backupCount: number;
  latestBackupAt: string | null;
  totalSizeBytes: number;
  backupDirectory: string;
  directoryExists: boolean;
  database?: DatabaseStorageHealth;
  healthTier: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  backupDue: boolean;
}

export interface BrowserStorageEstimate {
  usageBytes: number;
  quotaBytes: number;
  usagePercentage: number;
  persisted: boolean;
  indexedDbSupported: boolean;
}
