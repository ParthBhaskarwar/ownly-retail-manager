/**
 * Backup and Storage Health Types
 */

import type { Category, Subcategory, Supplier } from '@/modules/catalog/types';
import type { AttributeDefinition, ProductAttributeValue, VariantAttributeValue } from '@/modules/attributes/types';
import type { Product, ProductVariant } from '@/modules/product/types';
import type { InventoryItem, InventoryMovement } from '@/modules/inventory/types';
import type { User, Session } from '@/modules/account/types';
import type { Store } from '@/modules/store/types';
import type { StaffMember } from '@/modules/staff/types';
import type { AuditEvent } from '@/shared/audit/AuditService';

export interface BackupMetadata {
  version: string;
  timestamp: string;
  storeId: string;
  storeName: string;
  generator: string;
  checksum: string;
  recordCounts: {
    products: number;
    variants: number;
    inventoryItems: number;
    inventoryMovements: number;
    categories: number;
    subcategories: number;
    suppliers: number;
    attributeDefinitions: number;
    productAttributeValues: number;
    variantAttributeValues: number;
    users?: number;
    staff?: number;
    auditLogs?: number;
  };
}

export interface FullBackupPayload {
  metadata: BackupMetadata;
  dexie: {
    products: Product[];
    productVariants: ProductVariant[];
    inventoryItems: InventoryItem[];
    inventoryMovements: InventoryMovement[];
    categories: Category[];
    subcategories: Subcategory[];
    suppliers: Supplier[];
    attributeDefinitions: AttributeDefinition[];
    productAttributeValues: ProductAttributeValue[];
    variantAttributeValues: VariantAttributeValue[];
  };
  localStorage: {
    users?: User[];
    sessions?: Session[];
    store?: Store | null;
    staff?: StaffMember[];
    auditLogs?: AuditEvent[];
    settings?: Record<string, unknown>;
  };
}

export interface RestoreValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: BackupMetadata;
}

export interface StorageHealthStatus {
  isSupported: boolean;
  quotaBytes: number;
  usageBytes: number;
  percentUsed: number;
  healthTier: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  statusMessage: string;
  tableCounts: Record<string, number>;
  lastBackupDate: string | null;
  backupDue: boolean;
  daysSinceLastBackup: number | null;
}

export interface BackupReminderConfig {
  reminderIntervalDays: number;
  inventoryThresholdWarning: number;
}
