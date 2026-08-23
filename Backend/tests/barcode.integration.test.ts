/**
 * Gate 2 test evidence.
 *
 * Plan §Week 2 requires: "A 20-item product entry must generate exactly 20
 * valid and non-duplicated item barcodes."
 *
 * This drives the real Express app through supertest against the real
 * database, so it exercises the actual barcode engine, the
 * UNIQUE (store_id, barcode) constraint and the transaction boundary — not a
 * mock of them.
 *
 * Isolation: every run creates its own owner + store under a unique email, so
 * concurrent or repeated runs never collide. afterAll removes only the rows
 * this run created; the shared clothing template seed is left intact.
 */

import request from 'supertest';
import app from '@/app';
import { db } from '@/db/client';

const RUN_ID = Date.now();
const EMAIL = `gate2-${RUN_ID}@ownly-test.local`;
const PASSWORD = 'TestPass123!';

let token: string;
let userId: string;
let storeId: string;
let categoryId: string;

/** Creates a product and returns its id. */
async function createProduct(body: Record<string, unknown>) {
  return request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send(body);
}

async function barcodesForProduct(productId: string): Promise<string[]> {
  return db('inventory_items as i')
    .join('product_variants as v', 'v.id', 'i.variant_id')
    .where('v.product_id', productId)
    .pluck('i.barcode');
}

beforeAll(async () => {
  const signup = await request(app).post('/api/auth/signup').send({
    name: 'Gate Two Tester',
    email: EMAIL,
    phone: '+919000000000',
    password: PASSWORD,
  });
  expect(signup.status).toBe(201);
  userId = signup.body.userId;

  // Read the code from the database rather than the signup response:
  // `devCode` is only returned when NODE_ENV is 'development', and Jest sets
  // it to 'test'.
  const verificationCode: string = await db('users')
    .where({ id: userId })
    .first('verification_code')
    .then((row) => row.verificationCode);
  expect(verificationCode).toHaveLength(6);

  await request(app)
    .post('/api/auth/verify')
    .send({ userId, code: verificationCode })
    .expect(200);

  const login = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
  expect(login.status).toBe(200);
  token = login.body.token;

  const store = await request(app)
    .post('/api/store')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Gate2 Store ${RUN_ID}`,
      address: '1 Test Street',
      phone: '+919000000000',
      retailType: 'CLOTHING_FASHION',
    });
  expect(store.status).toBe(201);
  storeId = store.body.store.id;
  // Creating the store changes storeId, which is embedded in the JWT.
  token = store.body.token;

  const categories = await request(app)
    .get('/api/catalog/categories?retailTemplateId=tpl_clothing')
    .set('Authorization', `Bearer ${token}`);
  expect(categories.status).toBe(200);
  expect(categories.body.categories.length).toBeGreaterThan(0);
  categoryId = categories.body.categories[0].id;
});

afterAll(async () => {
  // FK-safe teardown, scoped to this run's store only.
  if (storeId) {
    const productIds: string[] = await db('products').where({ store_id: storeId }).pluck('id');
    const variantIds: string[] = productIds.length
      ? await db('product_variants').whereIn('product_id', productIds).pluck('id')
      : [];

    await db('inventory_movements').where({ store_id: storeId }).del();
    await db('inventory_items').where({ store_id: storeId }).del();
    if (variantIds.length) await db('variant_attribute_values').whereIn('variant_id', variantIds).del();
    if (variantIds.length) await db('product_variants').whereIn('id', variantIds).del();
    if (productIds.length) await db('product_attribute_values').whereIn('product_id', productIds).del();
    if (productIds.length) await db('products').whereIn('id', productIds).del();
    await db('suppliers').where({ store_id: storeId }).del();
    await db('audit_logs').where({ store_id: storeId }).del();
  }
  if (userId) {
    await db('audit_logs').where({ user_id: userId }).del();
    await db('sessions').where({ user_id: userId }).del();
    await db('users').where({ id: userId }).update({ store_id: null });
  }
  if (storeId) await db('stores').where({ id: storeId }).del();
  if (userId) await db('users').where({ id: userId }).del();

  await db.destroy();
});

describe('Gate 2 — quantity N produces exactly N unique barcodes', () => {
  test('a 20-item entry creates exactly 20 items with 20 distinct barcodes', async () => {
    const res = await createProduct({
      retailTemplateId: 'tpl_clothing',
      categoryId,
      name: 'Gate2 Test Jacket',
      baseSku: `G2A${RUN_ID}`.slice(0, 20),
      baseSellingPrice: 1800,
      baseCostPrice: 1100,
      attributeValues: [],
      variants: [
        {
          sku: `G2A${RUN_ID}-XL`.slice(0, 40),
          displayName: 'Gate2 Test Jacket — XL',
          attributeValues: [],
          initialStock: { quantity: 20, purchaseCostPrice: 1100, purchaseDate: '2026-08-23' },
        },
      ],
    });

    expect(res.status).toBe(201);
    const productId = res.body.product.id;

    const barcodes = await barcodesForProduct(productId);
    expect(barcodes).toHaveLength(20);
    expect(new Set(barcodes).size).toBe(20);

    const items = await db('inventory_items as i')
      .join('product_variants as v', 'v.id', 'i.variant_id')
      .where('v.product_id', productId)
      .select('i.status', 'i.purchase_cost_price');
    expect(items.every((i) => i.status === 'IN_STOCK')).toBe(true);

    const movements = await db('inventory_movements as m')
      .join('inventory_items as i', 'i.id', 'm.inventory_item_id')
      .join('product_variants as v', 'v.id', 'i.variant_id')
      .where('v.product_id', productId)
      .select('m.movement_type');
    expect(movements).toHaveLength(20);
    expect(movements.every((m) => m.movementType === 'PURCHASE')).toBe(true);
  });

  test('sibling size variants whose SKUs truncate identically still get unique barcodes', async () => {
    // Regression: the barcode's SKU segment is truncated to 8 chars, so
    // 'SIBLINGA-M' and 'SIBLINGA-L' both reduce to 'SIBLINGA'. A
    // variant-scoped sequence handed both variants the same barcode.
    const base = `SIB${RUN_ID}`.slice(0, 8);
    const res = await createProduct({
      retailTemplateId: 'tpl_clothing',
      categoryId,
      name: 'Sibling Truncation Jacket',
      baseSku: base,
      baseSellingPrice: 1800,
      baseCostPrice: 1100,
      attributeValues: [],
      variants: [
        {
          sku: `${base}-M`,
          displayName: 'Sibling — M',
          attributeValues: [],
          initialStock: { quantity: 5, purchaseCostPrice: 1100, purchaseDate: '2026-08-23' },
        },
        {
          sku: `${base}-L`,
          displayName: 'Sibling — L',
          attributeValues: [],
          initialStock: { quantity: 7, purchaseCostPrice: 1100, purchaseDate: '2026-08-23' },
        },
      ],
    });

    expect(res.status).toBe(201);

    const barcodes = await barcodesForProduct(res.body.product.id);
    expect(barcodes).toHaveLength(12);
    expect(new Set(barcodes).size).toBe(12);
  });

  test('adding stock later continues the sequence without colliding', async () => {
    const base = `SEQ${RUN_ID}`.slice(0, 8);
    const created = await createProduct({
      retailTemplateId: 'tpl_clothing',
      categoryId,
      name: 'Sequence Jacket',
      baseSku: base,
      baseSellingPrice: 900,
      baseCostPrice: 500,
      attributeValues: [],
      variants: [
        {
          sku: `${base}-S`,
          displayName: 'Sequence — S',
          attributeValues: [],
          initialStock: { quantity: 3, purchaseCostPrice: 500, purchaseDate: '2026-08-23' },
        },
      ],
    });
    expect(created.status).toBe(201);

    const variantId = await db('product_variants')
      .where({ product_id: created.body.product.id })
      .first()
      .then((v) => v.id as string);

    const added = await request(app)
      .post('/api/inventory/stock')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId, quantity: 4, purchaseCostPrice: 520, purchaseDate: '2026-08-24' });
    expect(added.status).toBe(201);
    expect(added.body.count).toBe(4);

    const barcodes = await barcodesForProduct(created.body.product.id);
    expect(barcodes).toHaveLength(7);
    expect(new Set(barcodes).size).toBe(7);
  });

  test('an explicit duplicate barcode is rejected rather than silently accepted', async () => {
    const base = `DUP${RUN_ID}`.slice(0, 8);
    const created = await createProduct({
      retailTemplateId: 'tpl_clothing',
      categoryId,
      name: 'Duplicate Barcode Jacket',
      baseSku: base,
      baseSellingPrice: 700,
      baseCostPrice: 400,
      attributeValues: [],
      variants: [
        {
          sku: `${base}-M`,
          displayName: 'Duplicate — M',
          attributeValues: [],
          initialStock: { quantity: 1, purchaseCostPrice: 400, purchaseDate: '2026-08-23' },
        },
      ],
    });
    expect(created.status).toBe(201);

    const variantId = await db('product_variants')
      .where({ product_id: created.body.product.id })
      .first()
      .then((v) => v.id as string);

    const barcode = `MANUAL-${RUN_ID}`;
    const first = await request(app)
      .post('/api/inventory/stock')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId, quantity: 1, purchaseCostPrice: 400,
        purchaseDate: '2026-08-23', barcodes: [barcode],
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/inventory/stock')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId, quantity: 1, purchaseCostPrice: 400,
        purchaseDate: '2026-08-23', barcodes: [barcode],
      });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already exist/i);
  });

  test('barcode count must match quantity when barcodes are supplied manually', async () => {
    const variantId = await db('product_variants as v')
      .join('products as p', 'p.id', 'v.product_id')
      .where('p.store_id', storeId)
      .first('v.id')
      .then((v) => v.id as string);

    const res = await request(app)
      .post('/api/inventory/stock')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId, quantity: 3, purchaseCostPrice: 400,
        purchaseDate: '2026-08-23', barcodes: ['ONLY-ONE'],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not match quantity/i);
  });
});
