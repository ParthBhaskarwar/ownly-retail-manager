/**
 * Backup restore correctness test — Week 5 deliverable.
 *
 * Verifies that:
 *  1. BackupService.createBackup writes a valid JSON file to disk.
 *  2. BackupService.restoreBackup re-inserts all rows after truncation.
 *  3. The restore is idempotent (running it twice does not throw or duplicate rows).
 *
 * Uses a real test database connection (configure TEST_DATABASE_URL in .env or
 * inherit DATABASE_URL). All test data is isolated to a unique store_id prefix
 * and cleaned up in afterAll.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// ── Override backup dir to a temp location ─────────────────────────────────────
const TEST_BACKUP_DIR = path.join(__dirname, '../.test-backups');
process.env['BACKUP_DIR'] = TEST_BACKUP_DIR;

// Import AFTER setting env so config picks up the override
import { db } from '../src/db/client';
import { BackupService } from '../src/services/backup.service';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const STORE_ID = randomUUID();
const OWNER_ID = randomUUID();

async function seedSampleData(): Promise<void> {
  // Minimal rows sufficient to verify backup/restore round-trip

  // Users row (required for FK)
  await db('users').insert({
    id: OWNER_ID,
    store_id: null,
    name: 'Test Owner',
    email: `test-${OWNER_ID}@ownly.test`,
    phone: '9999999999',
    password_hash: 'dummy-hash',
    role: 'OWNER',
    is_active: true,
    verified_at: new Date(),
  }).onConflict('id').ignore();

  // Store row
  await db('stores').insert({
    id: STORE_ID,
    owner_id: OWNER_ID,
    name: 'Test Store (Backup Test)',
    retail_type: 'clothing',
    currency: 'INR',
    setup_completed: true,
  }).onConflict('id').ignore();

  // Update user.store_id
  await db('users').where('id', OWNER_ID).update({ store_id: STORE_ID });

  // Category
  const catId = randomUUID();
  await db('categories').insert({
    id: catId,
    retail_template_id: 'clothing',
    store_id: STORE_ID,
    name: 'Test Category',
    is_system: false,
    is_active: true,
    sort_order: 0,
  }).onConflict('id').ignore();

  // Supplier
  const supplierId = randomUUID();
  await db('suppliers').insert({
    id: supplierId,
    store_id: STORE_ID,
    name: 'Test Supplier',
    code: 'TSUP001',
    is_active: true,
  }).onConflict('id').ignore();

  // Product
  const prodId = randomUUID();
  await db('products').insert({
    id: prodId,
    store_id: STORE_ID,
    retail_template_id: 'clothing',
    category_id: catId,
    name: 'Test Product',
    base_sku: 'TPRD001',
    base_selling_price: 500,
    base_cost_price: 300,
    status: 'ACTIVE',
    image_urls: '[]',
    created_by: OWNER_ID,
    updated_by: OWNER_ID,
  }).onConflict('id').ignore();

  // Variant
  const variantId = randomUUID();
  await db('product_variants').insert({
    id: variantId,
    product_id: prodId,
    sku: 'TPRD001-M',
    display_name: 'Medium',
    is_active: true,
    sort_order: 0,
  }).onConflict('id').ignore();

  // Inventory item
  await db('inventory_items').insert({
    id: randomUUID(),
    store_id: STORE_ID,
    variant_id: variantId,
    barcode: `BKPTEST-${Date.now()}`,
    purchase_cost_price: 300,
    purchase_date: '2026-09-01',
    status: 'IN_STOCK',
    created_by: OWNER_ID,
  }).onConflict('id').ignore();
}

async function cleanupTestData(): Promise<void> {
  // Clean up in reverse FK order
  await db('inventory_movements').where('store_id', STORE_ID).delete();
  await db('restock_batches').where('store_id', STORE_ID).delete();
  await db('inventory_items').where('store_id', STORE_ID).delete();
  await db('product_variants').whereIn(
    'product_id',
    db('products').where('store_id', STORE_ID).select('id')
  ).delete();
  await db('products').where('store_id', STORE_ID).delete();
  await db('categories').where('store_id', STORE_ID).delete();
  await db('suppliers').where('store_id', STORE_ID).delete();
  await db('backups').where('store_id', STORE_ID).delete();
  await db('audit_logs').where('store_id', STORE_ID).delete();
  await db('stores').where('id', STORE_ID).delete();
  await db('users').where('id', OWNER_ID).delete();

  // Remove test backup files
  if (fs.existsSync(TEST_BACKUP_DIR)) {
    fs.readdirSync(TEST_BACKUP_DIR).forEach((f) => {
      if (f.startsWith(`backup-${STORE_ID.slice(0, 8)}`)) {
        fs.unlinkSync(path.join(TEST_BACKUP_DIR, f));
      }
    });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BackupService — restore correctness', () => {
  let backupId: string;
  let backupFilePath: string;

  beforeAll(async () => {
    await seedSampleData();
  }, 30_000);

  afterAll(async () => {
    await cleanupTestData();
    await db.destroy();
  }, 30_000);

  // ── 1. Create backup ───────────────────────────────────────────────────────

  test('createBackup writes a JSON file to disk and records a DB row', async () => {
    const backup = await BackupService.createBackup(STORE_ID, OWNER_ID);

    backupId = backup.id;
    backupFilePath = path.join(TEST_BACKUP_DIR, backup.filename);

    expect(backup.id).toBeTruthy();
    expect(backup.filename).toMatch(/^backup-/);
    expect(backup.fileSizeBytes).toBeGreaterThan(0);
    expect(fs.existsSync(backupFilePath)).toBe(true);

    // Verify JSON is parseable and contains expected tables
    const data = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
    expect(Array.isArray(data['inventory_items'])).toBe(true);
    expect(Array.isArray(data['products'])).toBe(true);
    expect(data['inventory_items'].length).toBeGreaterThan(0);
    expect(data['products'].length).toBeGreaterThan(0);
  }, 30_000);

  // ── 2. Remove inventory_items rows to simulate data loss ──────────────────

  test('after deleting inventory_items, the table has 0 rows for this store', async () => {
    await db('inventory_items').where('store_id', STORE_ID).delete();
    const count = await db('inventory_items').where('store_id', STORE_ID).count('* as n').first();
    expect(Number(count?.n ?? 0)).toBe(0);
  });

  // ── 3. Restore backup ─────────────────────────────────────────────────────

  test('restoreBackup re-inserts the deleted inventory_items', async () => {
    const summary = await BackupService.restoreBackup(STORE_ID, backupId, OWNER_ID);

    expect(summary.backupId).toBe(backupId);
    expect(summary.tablesRestored).toContain('inventory_items');
    expect(summary.rowsInserted['inventory_items']).toBeGreaterThan(0);

    const count = await db('inventory_items').where('store_id', STORE_ID).count('* as n').first();
    expect(Number(count?.n ?? 0)).toBeGreaterThan(0);
  }, 30_000);

  // ── 4. Idempotency — running restore again must not duplicate rows ─────────

  test('running restoreBackup a second time does not duplicate rows', async () => {
    const beforeCount = await db('inventory_items').where('store_id', STORE_ID).count('* as n').first();

    await BackupService.restoreBackup(STORE_ID, backupId, OWNER_ID);

    const afterCount = await db('inventory_items').where('store_id', STORE_ID).count('* as n').first();
    expect(Number(afterCount?.n ?? 0)).toBe(Number(beforeCount?.n ?? 0));
  }, 30_000);

  // ── 5. Storage health ─────────────────────────────────────────────────────

  test('getStorageHealth returns at least 1 backup and a positive total size', async () => {
    const health = await BackupService.getStorageHealth(STORE_ID);

    expect(health.backupCount).toBeGreaterThan(0);
    expect(health.totalSizeBytes).toBeGreaterThan(0);
    expect(health.latestBackupAt).toBeTruthy();
    expect(health.directoryExists).toBe(true);
  });
});
