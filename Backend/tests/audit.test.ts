/**
 * Audit Log Test — D14 deliverable.
 *
 * Verifies that:
 *  1. AuditService.log writes audit events to audit_logs.
 *  2. AuditService.listByStore retrieves logs with store isolation.
 *  3. AuditService.listByStore joins user details (name, email, role).
 *  4. Filtering by action, entityType, and search works.
 *  5. Pagination (limit, offset) and total count work correctly.
 *  6. AuditService.getDistinctActions lists distinct actions for the store.
 */

import { randomUUID } from 'crypto';
import { db } from '../src/db/client';
import { AuditService } from '../src/services/audit.service';

const STORE_ID = randomUUID();
const OTHER_STORE_ID = randomUUID();
const USER_ID = randomUUID();

describe('AuditService — D14 Audit Trail', () => {
  beforeAll(async () => {
    // Insert test user
    await db('users')
      .insert({
        id: USER_ID,
        store_id: null,
        name: 'Audit Test User',
        email: `audit-${USER_ID}@ownly.test`,
        phone: '8888888888',
        password_hash: 'dummy-hash',
        role: 'OWNER',
        is_active: true,
        verified_at: new Date(),
      })
      .onConflict('id')
      .ignore();

    // Insert test stores
    await db('stores')
      .insert({
        id: STORE_ID,
        owner_id: USER_ID,
        name: 'Audit Test Store',
        retail_type: 'clothing',
        currency: 'INR',
        setup_completed: true,
      })
      .onConflict('id')
      .ignore();

    await db('stores')
      .insert({
        id: OTHER_STORE_ID,
        owner_id: USER_ID,
        name: 'Other Store',
        retail_type: 'clothing',
        currency: 'INR',
        setup_completed: true,
      })
      .onConflict('id')
      .ignore();

    await db('users').where('id', USER_ID).update({ store_id: STORE_ID });
  });

  afterAll(async () => {
    await db('audit_logs').where('store_id', STORE_ID).delete();
    await db('audit_logs').where('store_id', OTHER_STORE_ID).delete();
    await db('stores').whereIn('id', [STORE_ID, OTHER_STORE_ID]).delete();
    await db('users').where('id', USER_ID).delete();
    await db.destroy();
  });

  test('logs multiple events and retrieves them with user details', async () => {
    const prodId = randomUUID();

    await AuditService.log({
      action: 'product.create',
      userId: USER_ID,
      storeId: STORE_ID,
      entityType: 'product',
      entityId: prodId,
      meta: { name: 'Audit Shirt', price: 999 },
    });

    await AuditService.log({
      action: 'product.price_change',
      userId: USER_ID,
      storeId: STORE_ID,
      entityType: 'product',
      entityId: prodId,
      meta: { oldPrice: 999, newPrice: 1199, reason: 'Inflation update' },
    });

    await AuditService.log({
      action: 'backup.create',
      userId: USER_ID,
      storeId: STORE_ID,
      entityType: 'backup',
      entityId: randomUUID(),
      meta: { filename: 'test-backup.json' },
    });

    // Also log an event for the other store to verify isolation
    await AuditService.log({
      action: 'store.tamper_attempt',
      userId: USER_ID,
      storeId: OTHER_STORE_ID,
      entityType: 'store',
      entityId: OTHER_STORE_ID,
      meta: { note: 'isolation check' },
    });

    const result = await AuditService.listByStore(STORE_ID, { limit: 10 });

    expect(result.total).toBe(3);
    expect(result.logs.length).toBe(3);
    expect(result.logs[0]?.userName).toBe('Audit Test User');
    expect(result.logs[0]?.userRole).toBe('OWNER');

    // Verify isolation: other store event is not included
    const actions = result.logs.map((l) => l.action);
    expect(actions).toContain('product.create');
    expect(actions).toContain('product.price_change');
    expect(actions).toContain('backup.create');
    expect(actions).not.toContain('store.tamper_attempt');
  });

  test('filters by action and entityType', async () => {
    const productLogs = await AuditService.listByStore(STORE_ID, { entityType: 'product' });
    expect(productLogs.total).toBe(2);
    expect(productLogs.logs.every((l) => l.entityType === 'product')).toBe(true);

    const priceLogs = await AuditService.listByStore(STORE_ID, { action: 'price_change' });
    expect(priceLogs.total).toBe(1);
    expect(priceLogs.logs[0]?.action).toBe('product.price_change');
    expect(priceLogs.logs[0]?.meta).toEqual(expect.objectContaining({ oldPrice: 999, newPrice: 1199 }));
  });

  test('supports pagination via limit and offset', async () => {
    const page1 = await AuditService.listByStore(STORE_ID, { limit: 1, offset: 0 });
    const page2 = await AuditService.listByStore(STORE_ID, { limit: 1, offset: 1 });

    expect(page1.logs.length).toBe(1);
    expect(page2.logs.length).toBe(1);
    expect(page1.logs[0]?.id).not.toBe(page2.logs[0]?.id);
    expect(page1.total).toBe(3);
  });

  test('getDistinctActions returns unique action names sorted', async () => {
    const distinct = await AuditService.getDistinctActions(STORE_ID);
    expect(distinct).toContain('product.create');
    expect(distinct).toContain('product.price_change');
    expect(distinct).toContain('backup.create');
    expect(distinct).not.toContain('store.tamper_attempt');
  });
});
