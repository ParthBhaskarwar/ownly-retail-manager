import { db } from '@/db/db';
import { AuditService } from '@/shared/audit/AuditService';
import type {
  BackupMetadata,
  FullBackupPayload,
  RestoreValidationResult,
  StorageHealthStatus,
} from '../types';

const BACKUP_VERSION = '1.0.0';
const BACKUP_REMINDER_DAYS = 7;

function calculateSimpleChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export const BackupService = {
  async createFullBackup(storeId: string, storeName: string): Promise<FullBackupPayload> {
    if (!db) {
      throw new Error('Database is not initialized.');
    }

    const [
      products,
      productVariants,
      inventoryItems,
      inventoryMovements,
      categories,
      subcategories,
      suppliers,
      attributeDefinitions,
      productAttributeValues,
      variantAttributeValues,
    ] = await Promise.all([
      db.products.toArray(),
      db.productVariants.toArray(),
      db.inventoryItems.toArray(),
      db.inventoryMovements.toArray(),
      db.categories.toArray(),
      db.subcategories.toArray(),
      db.suppliers.toArray(),
      db.attributeDefinitions.toArray(),
      db.productAttributeValues.toArray(),
      db.variantAttributeValues.toArray(),
    ]);

    let users = [];
    let sessions = [];
    let store = null;
    let staff = [];
    let auditLogs = [];

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const u = localStorage.getItem('ownly_users');
        if (u) users = JSON.parse(u);
        const s = localStorage.getItem('ownly_sessions');
        if (s) sessions = JSON.parse(s);
        const st = localStorage.getItem(`ownly_store_${storeId}`) || localStorage.getItem('ownly_current_store');
        if (st) store = JSON.parse(st);
        const stf = localStorage.getItem(`ownly_staff_${storeId}`);
        if (stf) staff = JSON.parse(stf);
        const aud = localStorage.getItem('ownly_audit_logs');
        if (aud) auditLogs = JSON.parse(aud);
      } catch (e) {
        console.warn('Could not read all localStorage data for backup', e);
      }
    }

    const timestamp = new Date().toISOString();
    const recordCounts = {
      products: products.length,
      variants: productVariants.length,
      inventoryItems: inventoryItems.length,
      inventoryMovements: inventoryMovements.length,
      categories: categories.length,
      subcategories: subcategories.length,
      suppliers: suppliers.length,
      attributeDefinitions: attributeDefinitions.length,
      productAttributeValues: productAttributeValues.length,
      variantAttributeValues: variantAttributeValues.length,
      users: users.length,
      staff: staff.length,
      auditLogs: auditLogs.length,
    };

    const rawDataToHash = JSON.stringify({
      productsCount: products.length,
      itemsCount: inventoryItems.length,
      timestamp,
      storeId,
    });
    const checksum = calculateSimpleChecksum(rawDataToHash);

    const metadata: BackupMetadata = {
      version: BACKUP_VERSION,
      timestamp,
      storeId,
      storeName: storeName || 'Ownly Store',
      generator: 'Ownly Backup Engine v1.0',
      checksum,
      recordCounts,
    };

    const payload: FullBackupPayload = {
      metadata,
      dexie: {
        products,
        productVariants,
        inventoryItems,
        inventoryMovements,
        categories,
        subcategories,
        suppliers,
        attributeDefinitions,
        productAttributeValues,
        variantAttributeValues,
      },
      localStorage: {
        users,
        sessions,
        store,
        staff,
        auditLogs,
      },
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`ownly_last_backup_${storeId}`, timestamp);
    }

    AuditService.log('backup.export', storeId, storeId, {
      timestamp,
      recordCounts,
      checksum,
    });

    return payload;
  },

  downloadBackupFile(payload: FullBackupPayload): void {
    if (typeof window === 'undefined') return;

    const dataStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const safeStoreName = (payload.metadata.storeName || 'store')
      .replace(/[^a-z0-9_-]/gi, '_')
      .toLowerCase();
    const datePart = new Date(payload.metadata.timestamp)
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `ownly-backup-${safeStoreName}-${datePart}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  validateBackup(jsonString: string): RestoreValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const data = JSON.parse(jsonString) as Partial<FullBackupPayload>;

      if (!data || typeof data !== 'object') {
        return { isValid: false, errors: ['Invalid backup file: Not a valid JSON object.'], warnings: [] };
      }

      if (!data.metadata) {
        errors.push('Missing backup metadata section.');
      } else {
        if (!data.metadata.version) errors.push('Missing backup schema version.');
        if (!data.metadata.timestamp) errors.push('Missing backup timestamp.');
        if (!data.metadata.recordCounts) warnings.push('Record count statistics missing in metadata.');
      }

      if (!data.dexie || typeof data.dexie !== 'object') {
        errors.push('Missing database tables section (dexie).');
      } else {
        if (!Array.isArray(data.dexie.products)) errors.push('Missing or invalid products table array.');
        if (!Array.isArray(data.dexie.inventoryItems)) errors.push('Missing or invalid inventoryItems table array.');
        if (!Array.isArray(data.dexie.productVariants)) errors.push('Missing or invalid productVariants table array.');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        metadata: data.metadata,
      };
    } catch (e) {
      return {
        isValid: false,
        errors: [`JSON Parse error: ${(e as Error).message}`],
        warnings: [],
      };
    }
  },

  async restoreBackup(payload: FullBackupPayload, currentUserId?: string): Promise<{ success: boolean; restoredCounts: Record<string, number> }> {
    if (!db) {
      throw new Error('Database is not available.');
    }

    const { dexie: d, localStorage: ls, metadata } = payload;

    await db.transaction(
      'rw',
      [
        db.products,
        db.productVariants,
        db.inventoryItems,
        db.inventoryMovements,
        db.categories,
        db.subcategories,
        db.suppliers,
        db.attributeDefinitions,
        db.productAttributeValues,
        db.variantAttributeValues,
      ],
      async () => {
        await Promise.all([
          db.products.clear(),
          db.productVariants.clear(),
          db.inventoryItems.clear(),
          db.inventoryMovements.clear(),
          db.categories.clear(),
          db.subcategories.clear(),
          db.suppliers.clear(),
          db.attributeDefinitions.clear(),
          db.productAttributeValues.clear(),
          db.variantAttributeValues.clear(),
        ]);

        if (d.categories?.length) await db.categories.bulkAdd(d.categories);
        if (d.subcategories?.length) await db.subcategories.bulkAdd(d.subcategories);
        if (d.suppliers?.length) await db.suppliers.bulkAdd(d.suppliers);
        if (d.attributeDefinitions?.length) await db.attributeDefinitions.bulkAdd(d.attributeDefinitions);
        if (d.products?.length) await db.products.bulkAdd(d.products);
        if (d.productVariants?.length) await db.productVariants.bulkAdd(d.productVariants);
        if (d.productAttributeValues?.length) await db.productAttributeValues.bulkAdd(d.productAttributeValues);
        if (d.variantAttributeValues?.length) await db.variantAttributeValues.bulkAdd(d.variantAttributeValues);
        if (d.inventoryItems?.length) await db.inventoryItems.bulkAdd(d.inventoryItems);
        if (d.inventoryMovements?.length) await db.inventoryMovements.bulkAdd(d.inventoryMovements);
      }
    );

    if (typeof window !== 'undefined' && window.localStorage && ls) {
      try {
        if (ls.users && ls.users.length > 0) {
          localStorage.setItem('ownly_users', JSON.stringify(ls.users));
        }
        if (ls.store && metadata.storeId) {
          localStorage.setItem(`ownly_store_${metadata.storeId}`, JSON.stringify(ls.store));
          localStorage.setItem('ownly_current_store', JSON.stringify(ls.store));
        }
        if (ls.staff && metadata.storeId) {
          localStorage.setItem(`ownly_staff_${metadata.storeId}`, JSON.stringify(ls.staff));
        }
        if (ls.auditLogs && ls.auditLogs.length > 0) {
          localStorage.setItem('ownly_audit_logs', JSON.stringify(ls.auditLogs));
        }
        localStorage.setItem(`ownly_last_backup_${metadata.storeId}`, new Date().toISOString());
      } catch (e) {
        console.warn('Could not restore all localStorage items', e);
      }
    }

    AuditService.log('backup.restore', metadata.storeId, metadata.storeId, {
      sourceTimestamp: metadata.timestamp,
      restoredBy: currentUserId || 'system',
      counts: metadata.recordCounts,
    });

    return {
      success: true,
      restoredCounts: metadata.recordCounts as unknown as Record<string, number>,
    };
  },

  async getStorageHealth(storeId?: string): Promise<StorageHealthStatus> {
    let quotaBytes = 0;
    let usageBytes = 0;
    let isSupported = false;

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        quotaBytes = est.quota || 0;
        usageBytes = est.usage || 0;
        isSupported = true;
      } catch {
        isSupported = false;
      }
    }

    const tableCounts: Record<string, number> = {};
    if (db) {
      try {
        const [p, v, i, m, c, s] = await Promise.all([
          db.products.count(),
          db.productVariants.count(),
          db.inventoryItems.count(),
          db.inventoryMovements.count(),
          db.categories.count(),
          db.suppliers.count(),
        ]);
        tableCounts.products = p;
        tableCounts.variants = v;
        tableCounts.inventoryItems = i;
        tableCounts.movements = m;
        tableCounts.categories = c;
        tableCounts.suppliers = s;
      } catch {
        // Fallback
      }
    }

    let lastBackupDate: string | null = null;
    if (storeId && typeof window !== 'undefined' && window.localStorage) {
      lastBackupDate = localStorage.getItem(`ownly_last_backup_${storeId}`);
    }

    let daysSinceLastBackup: number | null = null;
    let backupDue = true;

    if (lastBackupDate) {
      const last = new Date(lastBackupDate).getTime();
      const diffDays = Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24));
      daysSinceLastBackup = Math.max(0, diffDays);
      backupDue = diffDays >= BACKUP_REMINDER_DAYS;
    }

    const percentUsed = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;
    let healthTier: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    let statusMessage = 'Storage health is optimal.';

    if (percentUsed > 85) {
      healthTier = 'CRITICAL';
      statusMessage = 'Storage quota is almost full. Export backup and clear historical records.';
    } else if (percentUsed > 60 || backupDue) {
      healthTier = 'WARNING';
      statusMessage = backupDue
        ? `Backup is recommended (last backup was ${daysSinceLastBackup ?? 'never'} days ago).`
        : 'Storage usage is moderate.';
    }

    return {
      isSupported,
      quotaBytes,
      usageBytes,
      percentUsed,
      healthTier,
      statusMessage,
      tableCounts,
      lastBackupDate,
      backupDue,
      daysSinceLastBackup,
    };
  },
};
