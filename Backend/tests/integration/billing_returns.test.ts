/**
 * Billing, returns, exchanges, credit notes, reports and access control —
 * driven end to end through the real Express app and database.
 *
 * Guards the defects found in the week-8 audit:
 *   - returns / exchanges used to fail on every call (bad audit_logs column)
 *   - checkout trusted client prices, discounts and tax
 *   - billing routes leaked other stores' data when the caller had no store
 *   - a dev-mode fallback turned any bad token into an OWNER
 *   - deactivated staff kept working until their token expired
 *
 * Isolation: creates its own owners / stores / staff and removes only those
 * rows afterwards.
 */

import request from 'supertest';
import app from '@/app';
import { db } from '@/db/client';

jest.setTimeout(120_000);

const RUN_ID = Date.now();
const PASSWORD = 'TestPass123!';
const TAG = `bill${RUN_ID}`;

interface Actor { userId: string; token: string; storeId?: string }

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Email delivery is stubbed, so tests read the code the server stored. */
async function codeFor(userId: string): Promise<string> {
  const row = await db('users').where({ id: userId }).first('verification_code');
  return row.verificationCode as string;
}

async function signupVerifyLogin(label: string): Promise<Actor> {
  const email = `${TAG}-${label}@ownly-test.local`;
  const signup = await request(app).post('/api/auth/signup').send({
    name: `Tester ${label}`, email, phone: '+919000000001', password: PASSWORD,
  });
  expect(signup.status).toBe(201);
  const userId: string = signup.body.userId;
  await request(app).post('/api/auth/verify').send({ userId, code: await codeFor(userId) }).expect(200);
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  return { userId, token: login.body.token };
}

async function createStore(actor: Actor, label: string): Promise<void> {
  const res = await request(app).post('/api/store').set(bearer(actor.token)).send({
    name: `Store ${label} ${RUN_ID}`, address: '1 Test Street', phone: '+919000000001', retailType: 'CLOTHING_FASHION',
  });
  expect(res.status).toBe(201);
  actor.storeId = res.body.store.id;
  actor.token = res.body.token;
}

let owner: Actor;      // store A owner
let cashier: Actor;    // store A cashier
let otherOwner: Actor; // store B owner (different tenant)
let noStore: Actor;    // verified user that never created a store
let cashierUserId: string;

let variantId: string;
let itemIds: string[] = [];

const createdUserIds: string[] = [];
const createdStoreIds: string[] = [];

async function cleanupStore(storeId: string): Promise<void> {
  const invoiceIds: string[] = await db('invoices').where({ store_id: storeId }).pluck('id');
  const returnIds: string[] = await db('returns').where({ store_id: storeId }).pluck('id');
  const productIds: string[] = await db('products').where({ store_id: storeId }).pluck('id');
  const variantIds: string[] = productIds.length
    ? await db('product_variants').whereIn('product_id', productIds).pluck('id') : [];

  await db('exchanges').where({ store_id: storeId }).del();
  await db('credit_notes').where({ store_id: storeId }).del();
  if (returnIds.length) await db('return_items').whereIn('return_id', returnIds).del();
  await db('returns').where({ store_id: storeId }).del();
  if (invoiceIds.length) await db('payments').whereIn('invoice_id', invoiceIds).del();
  if (invoiceIds.length) await db('invoice_items').whereIn('invoice_id', invoiceIds).del();
  await db('invoices').where({ store_id: storeId }).del();
  await db('customers').where({ store_id: storeId }).del();
  await db('inventory_movements').where({ store_id: storeId }).del();
  await db('inventory_items').where({ store_id: storeId }).del();
  await db('restock_batches').where({ store_id: storeId }).del();
  if (variantIds.length) await db('variant_attribute_values').whereIn('variant_id', variantIds).del();
  if (variantIds.length) await db('product_variants').whereIn('id', variantIds).del();
  if (productIds.length) await db('product_attribute_values').whereIn('product_id', productIds).del();
  if (productIds.length) await db('products').whereIn('id', productIds).del();
  await db('audit_logs').where({ store_id: storeId }).del();
}

beforeAll(async () => {
  owner = await signupVerifyLogin('owner');
  createdUserIds.push(owner.userId);
  await createStore(owner, 'A');
  createdStoreIds.push(owner.storeId!);

  otherOwner = await signupVerifyLogin('other');
  createdUserIds.push(otherOwner.userId);
  await createStore(otherOwner, 'B');
  createdStoreIds.push(otherOwner.storeId!);

  noStore = await signupVerifyLogin('nostore');
  createdUserIds.push(noStore.userId);

  // Cashier for store A
  const staffEmail = `${TAG}-cashier@ownly-test.local`;
  const staff = await request(app).post('/api/staff').set(bearer(owner.token)).send({
    name: 'Casey Cashier', email: staffEmail, phone: '+919000000002', password: PASSWORD, role: 'CASHIER',
  });
  expect(staff.status).toBe(201);
  cashierUserId = staff.body.staff.id;
  createdUserIds.push(cashierUserId);
  const cashierLogin = await request(app).post('/api/auth/login').send({ email: staffEmail, password: PASSWORD });
  expect(cashierLogin.status).toBe(200);
  cashier = { userId: cashierUserId, token: cashierLogin.body.token, storeId: owner.storeId };

  // Product with 8 physical units at ₹1000 (variant price comes from the product)
  const sub = await db('subcategories as s')
    .join('categories as c', 'c.id', 's.category_id')
    .whereNull('s.store_id')
    .where('c.retail_template_id', 'tpl_clothing')
    .first('s.id', 's.category_id');
  const sizeDef = await db('attribute_definitions')
    .where({ retail_template_id: 'tpl_clothing' })
    .whereILike('name', 'size')
    .first('id');

  const base = `BR${RUN_ID}`.slice(0, 12);
  const created = await request(app).post('/api/products').set(bearer(owner.token)).send({
    retailTemplateId: 'tpl_clothing',
    categoryId: sub.categoryId,
    subcategoryId: sub.id,
    name: 'Billing Test Tee',
    baseSku: base,
    baseSellingPrice: 1000,
    baseCostPrice: 400,
    attributeValues: [],
    variants: [{
      sku: `${base}-M`,
      displayName: 'Billing Test Tee / M',
      attributeValues: [{ attributeDefinitionId: sizeDef.id, value: 'M' }],
      initialStock: { quantity: 8, purchaseCostPrice: 400, purchaseDate: '2026-09-01' },
    }],
  });
  expect(created.status).toBe(201);

  variantId = (await db('product_variants').where({ sku: `${base}-M` }).first('id')).id;
  itemIds = await db('inventory_items').where({ variant_id: variantId }).orderBy('barcode').pluck('id');
  expect(itemIds).toHaveLength(8);
});

afterAll(async () => {
  for (const storeId of createdStoreIds) await cleanupStore(storeId);
  for (const userId of createdUserIds) {
    await db('audit_logs').where({ user_id: userId }).del();
    await db('sessions').where({ user_id: userId }).del();
    await db('users').where({ id: userId }).update({ store_id: null });
  }
  for (const storeId of createdStoreIds) await db('stores').where({ id: storeId }).del();
  for (const userId of createdUserIds) await db('users').where({ id: userId }).del();
  await db.destroy();
});

const checkout = (actor: Actor, body: Record<string, unknown>) =>
  request(app).post('/api/billing/checkout').set(bearer(actor.token)).send(body);

describe('authentication', () => {
  test('a missing or garbage token is rejected — no dev-mode fallback', async () => {
    await request(app).get('/api/billing/invoices').expect(401);
    await request(app).get('/api/billing/invoices').set(bearer('not-a-real-token')).expect(401);
  });

  test('a user with no store cannot read anyone else\'s billing data', async () => {
    const invoices = await request(app).get('/api/billing/invoices').set(bearer(noStore.token));
    expect(invoices.status).toBe(400);
    const customers = await request(app).get('/api/customers').set(bearer(noStore.token));
    expect(customers.status).toBe(400);
  });

  test('wrong verification codes are rate-limited per account', async () => {
    const email = `${TAG}-lock@ownly-test.local`;
    const signup = await request(app).post('/api/auth/signup').send({
      name: 'Lock Test', email, phone: '+919000000009', password: PASSWORD,
    });
    createdUserIds.push(signup.body.userId);
    const realCode = await codeFor(signup.body.userId);
    const wrong = realCode === '000000' ? '111111' : '000000';

    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await request(app).post('/api/auth/verify').send({ userId: signup.body.userId, code: wrong })).status;
    }
    expect(last).toBe(429);

    // Even the right code is refused while locked; a resend issues a fresh code and clears the lock.
    const locked = await request(app).post('/api/auth/verify').send({ userId: signup.body.userId, code: realCode });
    expect(locked.status).toBe(429);
    const resend = await request(app).post('/api/auth/resend-code').send({ userId: signup.body.userId });
    expect(resend.status).toBe(200);
    await request(app).post('/api/auth/verify').send({ userId: signup.body.userId, code: await codeFor(signup.body.userId) }).expect(200);
  });
});

describe('checkout', () => {
  test('the server prices items itself — a forged unit price is ignored', async () => {
    const res = await checkout(owner, {
      items: [{ inventoryItemId: itemIds[0], unitPrice: 1 }],
      payments: [{ paymentMethod: 'CASH', amount: 1000 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.grandTotal).toBe(1000);
    expect(res.body.items[0].unitPrice).toBe(1000);
  });

  test('paying less than the real price is refused', async () => {
    const res = await checkout(owner, {
      items: [{ inventoryItemId: itemIds[1], unitPrice: 1 }],
      payments: [{ paymentMethod: 'CASH', amount: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient payment/i);
  });

  test('an item cannot be sold twice', async () => {
    const res = await checkout(owner, {
      items: [{ inventoryItemId: itemIds[0] }],
      payments: [{ paymentMethod: 'CASH', amount: 1000 }],
    });
    expect(res.status).toBe(409);
  });

  test('a cashier is capped at a 10% bill discount; a manager-level owner is not', async () => {
    const tooMuch = await checkout(cashier, {
      items: [{ inventoryItemId: itemIds[1] }],
      discountType: 'PERCENTAGE', discountValue: 25,
      payments: [{ paymentMethod: 'CASH', amount: 1000 }],
    });
    expect(tooMuch.status).toBe(403);

    const ok = await checkout(cashier, {
      items: [{ inventoryItemId: itemIds[1] }],
      discountType: 'PERCENTAGE', discountValue: 5,
      payments: [{ paymentMethod: 'CASH', amount: 950 }],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.discountAmount).toBe(50);
    expect(ok.body.grandTotal).toBe(950);
  });

  test('GST from the store settings is added on the server', async () => {
    await request(app).put('/api/store').set(bearer(owner.token))
      .send({ taxSettings: { gstEnabled: true, gstRate: 18, inclusiveTax: false } }).expect(200);

    const res = await checkout(owner, {
      items: [{ inventoryItemId: itemIds[2] }],
      payments: [{ paymentMethod: 'UPI', amount: 1180, transactionReference: 'UPI123' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.taxAmount).toBe(180);
    expect(res.body.grandTotal).toBe(1180);

    // Switch GST back off so the remaining tests use round numbers.
    await request(app).put('/api/store').set(bearer(owner.token))
      .send({ taxSettings: { gstEnabled: false, gstRate: 0, inclusiveTax: false } }).expect(200);
  });

  test('simultaneous checkouts get distinct invoice numbers', async () => {
    const results = await Promise.all(
      [itemIds[3], itemIds[4], itemIds[5]].map((id) =>
        checkout(owner, { items: [{ inventoryItemId: id }], payments: [{ paymentMethod: 'CASH', amount: 1000 }] })
      )
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    const numbers = results.map((r) => r.body.invoiceNumber);
    expect(new Set(numbers).size).toBe(3);
  });

  test('a role without billing permission cannot sell', async () => {
    const email = `${TAG}-viewer@ownly-test.local`;
    const staff = await request(app).post('/api/staff').set(bearer(owner.token)).send({
      name: 'Vera Viewer', email, phone: '+919000000003', password: PASSWORD, role: 'VIEWER',
    });
    expect(staff.status).toBe(201);
    createdUserIds.push(staff.body.staff.id);
    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    const res = await checkout({ userId: staff.body.staff.id, token: login.body.token }, {
      items: [{ inventoryItemId: itemIds[6] }],
      payments: [{ paymentMethod: 'CASH', amount: 1000 }],
    });
    expect(res.status).toBe(403);
  });
});

describe('returns', () => {
  let invoiceNumber: string;
  let invoiceId: string;
  let invoiceItemId: string;

  beforeAll(async () => {
    const sale = await checkout(owner, {
      items: [{ inventoryItemId: itemIds[6] }],
      payments: [{ paymentMethod: 'CASH', amount: 1000 }],
    });
    expect(sale.status).toBe(201);
    invoiceNumber = sale.body.invoiceNumber;
    invoiceId = sale.body.id;
  });

  test('lists what is eligible, with the refundable amount', async () => {
    const res = await request(app).get(`/api/returns/eligible/${invoiceNumber}`).set(bearer(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].eligibleForReturn).toBe(true);
    expect(res.body.items[0].refundableAmount).toBe(1000);
    invoiceItemId = res.body.items[0].id;
  });

  test('another store cannot see or return this invoice', async () => {
    await request(app).get(`/api/returns/eligible/${invoiceNumber}`).set(bearer(otherOwner.token)).expect(404);
    const res = await request(app).post('/api/returns').set(bearer(otherOwner.token)).send({
      originalInvoiceId: invoiceId, items: [{ invoiceItemId }], refundMethod: 'CASH',
    });
    expect(res.status).toBe(404);
  });

  test('a refund larger than what was paid is refused', async () => {
    const res = await request(app).post('/api/returns').set(bearer(owner.token)).send({
      originalInvoiceId: invoiceId,
      items: [{ invoiceItemId, refundAmount: 5000 }],
      refundMethod: 'CASH',
    });
    expect(res.status).toBe(400);
  });

  test('a store-credit return restocks the item and issues a credit note', async () => {
    const res = await request(app).post('/api/returns').set(bearer(owner.token)).send({
      originalInvoiceId: invoiceId,
      items: [{ invoiceItemId, condition: 'RESELLABLE', reason: 'Size too small' }],
      refundMethod: 'CREDIT_NOTE',
    });
    expect(res.status).toBe(201);
    expect(res.body.totalRefundAmount).toBe(1000);
    expect(res.body.invoiceStatus).toBe('FULLY_RETURNED');
    expect(res.body.creditNote.creditNoteNumber).toMatch(/^CN-/);

    const item = await db('inventory_items').where({ id: itemIds[6] }).first('status');
    expect(item.status).toBe('RETURNED_TO_STOCK');

    const audit = await db('audit_logs').where({ store_id: owner.storeId, action: 'return.processed' }).first('meta');
    expect(audit).toBeTruthy();

    creditNoteNumber = res.body.creditNote.creditNoteNumber;
  });

  test('the same item cannot be returned twice', async () => {
    const res = await request(app).post('/api/returns').set(bearer(owner.token)).send({
      originalInvoiceId: invoiceId, items: [{ invoiceItemId }], refundMethod: 'CASH',
    });
    expect(res.status).toBe(400); // invoice is fully returned
  });
});

let creditNoteNumber: string;

describe('credit notes', () => {
  test('a credit note pays for part of a later sale, atomically', async () => {
    // Sell item 7 (₹1000): ₹400 by credit note, ₹600 cash.
    const res = await checkout(owner, {
      items: [{ inventoryItemId: itemIds[7] }],
      payments: [
        { paymentMethod: 'CREDIT_NOTE', amount: 400, transactionReference: creditNoteNumber },
        { paymentMethod: 'CASH', amount: 600 },
      ],
    });
    expect(res.status).toBe(201);

    const cn = await db('credit_notes').where({ credit_note_number: creditNoteNumber, store_id: owner.storeId }).first();
    expect(Number(cn.remainingAmount)).toBe(600);
    expect(cn.status).toBe('ACTIVE');
  });

  test('another store cannot look up or redeem it', async () => {
    await request(app).get(`/api/credit-notes/${creditNoteNumber}`).set(bearer(otherOwner.token)).expect(404);
    const res = await request(app).post('/api/credit-notes/redeem').set(bearer(otherOwner.token))
      .send({ creditNoteNumber, amountToRedeem: 10 });
    expect(res.status).toBe(404);
  });

  test('a credit note cannot pay more than its balance', async () => {
    const item = await db('inventory_items').where({ variant_id: variantId, status: 'RETURNED_TO_STOCK' }).first('id');
    const res = await checkout(owner, {
      items: [{ inventoryItemId: item.id }],
      payments: [{ paymentMethod: 'CREDIT_NOTE', amount: 1000, transactionReference: creditNoteNumber }],
    });
    expect(res.status).toBe(400);
  });
});

describe('exchanges', () => {
  test('return one item and take a replacement in a single step', async () => {
    // Receive two fresh units, sell one, then exchange it for the other.
    await request(app).post('/api/inventory/stock').set(bearer(owner.token)).send({
      variantId, quantity: 2, purchaseCostPrice: 400, purchaseDate: '2026-09-02',
    }).expect(201);
    const stockItem = await db('inventory_items')
      .where({ variant_id: variantId, status: 'IN_STOCK' }).orderBy('barcode').limit(2);
    expect(stockItem.length).toBe(2);
    const [soldItem, replacement] = stockItem;

    const sale = await checkout(owner, {
      items: [{ inventoryItemId: soldItem.id }],
      payments: [{ paymentMethod: 'CASH', amount: 1000 }],
    });
    expect(sale.status).toBe(201);

    const eligible = await request(app).get(`/api/returns/eligible/${sale.body.invoiceNumber}`).set(bearer(owner.token));
    const invoiceItemId = eligible.body.items[0].id;

    const res = await request(app).post('/api/exchanges').set(bearer(owner.token)).send({
      originalInvoiceId: sale.body.id,
      returnedItems: [{ invoiceItemId, condition: 'RESELLABLE' }],
      replacementItems: [{ inventoryItemId: replacement.id, unitPrice: 1 }], // forged price is ignored
      paymentMethod: 'CASH',
    });
    expect(res.status).toBe(201);
    expect(res.body.returnedValue).toBe(1000);
    expect(res.body.replacementValue).toBe(1000);
    expect(res.body.differenceAmount).toBe(0);
    expect(res.body.paymentStatus).toBe('BALANCED');

    const after = await db('inventory_items').whereIn('id', [soldItem.id, replacement.id]).select('id', 'status');
    const status = Object.fromEntries(after.map((r: { id: string; status: string }) => [r.id, r.status]));
    expect(status[soldItem.id]).toBe('RETURNED_TO_STOCK');
    expect(status[replacement.id]).toBe('SOLD');
  });
});

describe('reports', () => {
  test('sales summary is built from real invoice lines', async () => {
    const res = await request(app).get('/api/reports/sales/summary').set(bearer(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.totalRevenue).toBeGreaterThan(0);
    expect(res.body.totalCostOfGoodsSold).toBeGreaterThan(0);
    expect(res.body.grossProfit).toBeCloseTo(res.body.totalRevenue - res.body.totalCostOfGoodsSold, 2);
    expect(res.body.salesByProduct[0].productName).toBe('Billing Test Tee');
    // Payment split is what customers actually paid, not a made-up ratio.
    expect(res.body.salesByPaymentMode.Cash).toBeGreaterThan(0);
    expect(res.body.salesByPaymentMode.UPI).toBe(1180);
  });

  test('returns summary reflects the store-credit return', async () => {
    const res = await request(app).get('/api/reports/returns/summary').set(bearer(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.totalReturnsCount).toBeGreaterThanOrEqual(1);
    expect(res.body.returnsByReason['Size too small']).toBe(1);
  });

  test('staff activity lists the store team, and other stores see only their own', async () => {
    const mine = await request(app).get('/api/reports/staff/activity').set(bearer(owner.token));
    expect(mine.status).toBe(200);
    expect(mine.body.staffMembers.length).toBeGreaterThanOrEqual(2);

    const theirs = await request(app).get('/api/reports/staff/activity').set(bearer(otherOwner.token));
    expect(theirs.body.staffMembers.every((s: { staffId: string }) => s.staffId !== cashierUserId)).toBe(true);
  });

  test('a cashier cannot open reports', async () => {
    await request(app).get('/api/reports/sales/summary').set(bearer(cashier.token)).expect(403);
  });
});

describe('staff and store rules', () => {
  test('a manager cannot create another manager; the owner can', async () => {
    const email = `${TAG}-mgr@ownly-test.local`;
    const mgr = await request(app).post('/api/staff').set(bearer(owner.token)).send({
      name: 'Morgan Manager', email, phone: '+919000000004', password: PASSWORD, role: 'MANAGER',
    });
    expect(mgr.status).toBe(201);
    createdUserIds.push(mgr.body.staff.id);
    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });

    const res = await request(app).post('/api/staff').set(bearer(login.body.token)).send({
      name: 'Second Manager', email: `${TAG}-mgr2@ownly-test.local`, phone: '+919000000005', password: PASSWORD, role: 'MANAGER',
    });
    expect(res.status).toBe(403);
  });

  test('only an owner can create a store', async () => {
    const res = await request(app).post('/api/store').set(bearer(cashier.token)).send({
      name: 'Rogue Store', address: 'x', phone: '+919000000006', retailType: 'CLOTHING_FASHION',
    });
    expect(res.status).toBe(403);
  });

  test('a deactivated staff member is locked out immediately, not at token expiry', async () => {
    await request(app).get('/api/billing/invoices').set(bearer(cashier.token)).expect(200);
    await request(app).post(`/api/staff/${cashierUserId}/deactivate`).set(bearer(owner.token)).expect(200);
    await request(app).get('/api/billing/invoices').set(bearer(cashier.token)).expect(403);
  });
});
