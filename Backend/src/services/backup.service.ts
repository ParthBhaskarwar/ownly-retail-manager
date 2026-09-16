/**
 * BackupService — Week 5 full backup, restore and storage health.
 *
 * Backup strategy:
 *   - A "backup" is a JSON file written to BACKUP_DIR (configurable via .env).
 *   - The file contains every store-scoped table's rows as JSON arrays.
 *   - A `backups` DB row tracks the file name, size and who created it.
 *
 * Restore strategy:
 *   - Reads the backup JSON file and re-inserts every table using
 *     INSERT ... ON CONFLICT DO NOTHING so the operation is fully idempotent.
 *   - Returns a summary of how many rows were (re)inserted per table.
 *
 * No external binaries (pg_dump etc.) are required — everything runs in Node.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { db } from '@/db/client';
import { config } from '@/config/env';
import { AppError } from '@/shared/AppError';
import { AuditService } from './audit.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackupRecord {
  id: string;
  storeId: string;
  filename: string;
  fileSizeBytes: number;
  createdBy: string;
  createdAt: string;
  fileExists?: boolean;
}

export interface StorageHealth {
  backupCount: number;
  latestBackupAt: string | null;
  totalSizeBytes: number;
  backupDirectory: string;
  directoryExists: boolean;
}

export interface RestoreSummary {
  backupId: string;
  tablesRestored: string[];
  rowsInserted: Record<string, number>;
  notes: string;
}

/** Tables included in every backup, in dependency order. */
const BACKUP_TABLES: { table: string; storeColumn: string }[] = [
  { table: 'categories',             storeColumn: 'store_id' },
  { table: 'subcategories',          storeColumn: 'store_id' },
  { table: 'suppliers',              storeColumn: 'store_id' },
  { table: 'customers',              storeColumn: 'store_id' },
  { table: 'products',               storeColumn: 'store_id' },
  { table: 'product_attribute_values', storeColumn: '' }, // derived via products
  { table: 'product_variants',        storeColumn: '' }, // derived via products
  { table: 'variant_attribute_values', storeColumn: '' }, // derived via variants
  { table: 'inventory_items',         storeColumn: 'store_id' },
  { table: 'inventory_movements',     storeColumn: 'store_id' },
  { table: 'restock_batches',         storeColumn: 'store_id' },
  { table: 'invoices',                storeColumn: 'store_id' },
  { table: 'invoice_items',           storeColumn: '' }, // derived via invoices
  { table: 'payments',                storeColumn: '' }, // derived via invoices
  { table: 'returns',                 storeColumn: 'store_id' },
  { table: 'return_items',            storeColumn: '' }, // derived via returns
  { table: 'exchanges',               storeColumn: 'store_id' },
  { table: 'credit_notes',            storeColumn: 'store_id' },
  { table: 'audit_logs',              storeColumn: 'store_id' },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function ensureBackupDir(): string {
  const dir = path.resolve(config.backupDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const BackupService = {

  /**
   * Creates a full store backup as a JSON file on disk and records it in the
   * `backups` table.
   */
  async createBackup(storeId: string, performedBy: string): Promise<BackupRecord> {
    const dir = ensureBackupDir();
    const backupId = randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${storeId.slice(0, 8)}-${timestamp}.json`;
    const filepath = path.join(dir, filename);

    // ── Collect data ──────────────────────────────────────────────────────────
    const data: Record<string, unknown[]> = { _meta: [{ storeId, createdAt: new Date().toISOString(), backupId }] as unknown[] };

    // Products (for deriving child table IDs)
    const products = await db('products').where('store_id', storeId);
    const productIds = products.map((p: { id: string }) => p.id);

    const variants = productIds.length
      ? await db('product_variants').whereIn('product_id', productIds)
      : [];
    const variantIds = variants.map((v: { id: string }) => v.id);

    const invoices = await db('invoices').where('store_id', storeId);
    const invoiceIds = invoices.map((i: { id: string }) => i.id);

    const returns = await db('returns').where('store_id', storeId);
    const returnIds = returns.map((r: { id: string }) => r.id);

    // Populate data map
    data['categories']              = await db('categories').where('store_id', storeId);
    data['subcategories']           = await db('subcategories').where('store_id', storeId);
    data['suppliers']               = await db('suppliers').where('store_id', storeId);
    data['customers']               = await db('customers').where('store_id', storeId);
    data['products']                = products;
    data['product_attribute_values'] = productIds.length
      ? await db('product_attribute_values').whereIn('product_id', productIds) : [];
    data['product_variants']        = variants;
    data['variant_attribute_values'] = variantIds.length
      ? await db('variant_attribute_values').whereIn('variant_id', variantIds) : [];
    data['inventory_items']         = await db('inventory_items').where('store_id', storeId);
    data['inventory_movements']     = await db('inventory_movements').where('store_id', storeId);
    data['restock_batches']         = await db('restock_batches').where('store_id', storeId);
    data['invoices']                = invoices;
    data['invoice_items']           = invoiceIds.length
      ? await db('invoice_items').whereIn('invoice_id', invoiceIds) : [];
    data['payments']                = invoiceIds.length
      ? await db('payments').whereIn('invoice_id', invoiceIds) : [];
    data['returns']                 = returns;
    data['return_items']            = returnIds.length
      ? await db('return_items').whereIn('return_id', returnIds) : [];
    data['exchanges']               = await db('exchanges').where('store_id', storeId);
    data['credit_notes']            = await db('credit_notes').where('store_id', storeId);
    data['audit_logs']              = await db('audit_logs').where('store_id', storeId);

    // ── Write file ────────────────────────────────────────────────────────────
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(filepath, json, 'utf8');
    const fileSizeBytes = fs.statSync(filepath).size;

    // ── Record in DB ──────────────────────────────────────────────────────────
    await db('backups').insert({
      id: backupId,
      store_id: storeId,
      filename,
      file_size_bytes: fileSizeBytes,
      created_by: performedBy,
    });

    await AuditService.log({
      action: 'backup.create',
      userId: performedBy,
      storeId,
      entityType: 'backup',
      entityId: backupId,
      meta: { filename, fileSizeBytes },
    });

    return {
      id: backupId,
      storeId,
      filename,
      fileSizeBytes,
      createdBy: performedBy,
      createdAt: new Date().toISOString(),
      fileExists: true,
    };
  },

  /** Lists backup history for the store, decorated with whether the file still exists on disk. */
  async listBackups(storeId: string): Promise<BackupRecord[]> {
    const rows = (await db('backups')
      .where('store_id', storeId)
      .orderBy('created_at', 'desc')) as BackupRecord[];

    const dir = path.resolve(config.backupDir);
    return rows.map((r) => ({
      ...r,
      fileExists: fs.existsSync(path.join(dir, r.filename)),
    }));
  },

  /** Returns the absolute path to a backup file, or throws if not found. */
  async getFilePath(storeId: string, backupId: string): Promise<string> {
    const row = (await db('backups')
      .where({ id: backupId, store_id: storeId })
      .first()) as BackupRecord | undefined;
    if (!row) throw AppError.notFound(`Backup ${backupId} not found.`);

    const filepath = path.join(path.resolve(config.backupDir), row.filename);
    if (!fs.existsSync(filepath)) {
      throw AppError.notFound(`Backup file "${row.filename}" no longer exists on disk.`);
    }
    return filepath;
  },

  /**
   * Restores from a backup file using INSERT ... ON CONFLICT DO NOTHING.
   * Safe to run multiple times — already-present rows are skipped.
   */
  async restoreBackup(storeId: string, backupId: string, performedBy: string): Promise<RestoreSummary> {
    const filepath = await this.getFilePath(storeId, backupId);
    const raw = fs.readFileSync(filepath, 'utf8');
    const data: Record<string, unknown[]> = JSON.parse(raw);

    const rowsInserted: Record<string, number> = {};
    const tablesRestored: string[] = [];

    const INSERTION_ORDER = [
      'categories', 'subcategories', 'suppliers', 'customers',
      'products', 'product_attribute_values', 'product_variants', 'variant_attribute_values',
      'inventory_items', 'inventory_movements', 'restock_batches',
      'invoices', 'invoice_items', 'payments',
      'returns', 'return_items', 'exchanges', 'credit_notes',
      'audit_logs',
    ];

    await db.transaction(async (trx) => {
      for (const table of INSERTION_ORDER) {
        const rows = data[table];
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
          rowsInserted[table] = 0;
          continue;
        }

        // Insert in chunks of 500 to avoid hitting Postgres parameter limits
        let inserted = 0;
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const result = await trx(table)
            .insert(chunk)
            .onConflict('id')
            .ignore();
          inserted += (result as { rowCount?: number })?.rowCount ?? chunk.length;
        }

        rowsInserted[table] = inserted;
        if (inserted > 0) tablesRestored.push(table);
      }
    });

    await AuditService.log({
      action: 'backup.restore',
      userId: performedBy,
      storeId,
      entityType: 'backup',
      entityId: backupId,
      meta: { rowsInserted, tablesRestored },
    });

    return {
      backupId,
      tablesRestored,
      rowsInserted,
      notes: `Restored ${tablesRestored.length} tables. Existing rows were skipped (idempotent).`,
    };
  },

  /** Returns storage health metadata for the store's backups. */
  async getStorageHealth(storeId: string): Promise<StorageHealth> {
    const rows = (await db('backups')
      .where('store_id', storeId)
      .select('created_at', 'file_size_bytes')
      .orderBy('created_at', 'desc')) as Array<{ createdAt: string; fileSizeBytes: number }>;

    const dir = path.resolve(config.backupDir);

    return {
      backupCount: rows.length,
      latestBackupAt: rows[0]?.createdAt ?? null,
      totalSizeBytes: rows.reduce((sum, r) => sum + Number(r.fileSizeBytes), 0),
      backupDirectory: dir,
      directoryExists: fs.existsSync(dir),
    };
  },
};
