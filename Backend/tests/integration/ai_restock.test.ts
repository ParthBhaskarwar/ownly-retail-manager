/**
 * Week 7 — AI product analysis and AI-assisted restocking, end to end.
 *
 * Drives the real Express app against the real database: analysis is logged
 * as a prediction, a restock recommendation can be modified by the owner and
 * executed (new unique barcodes, RESTOCK movements, restock batch linked to
 * the prediction), and every decision is validated.
 *
 * Isolation: creates its own owner + store; afterAll removes only those rows.
 */

import request from 'supertest';
import app from '@/app';
import { db } from '@/db/client';

const RUN_ID = Date.now();
const EMAIL = `ai-week7-${RUN_ID}@ownly-test.local`;
const PASSWORD = 'TestPass123!';

let token: string;
let userId: string;
let storeId: string;
let categoryId: string;
let subcategoryId: string;
let productId: string;

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const signup = await request(app).post('/api/auth/signup').send({
    name: 'AI Tester', email: EMAIL, phone: '+919000000001', password: PASSWORD,
  });
  expect(signup.status).toBe(201);
  userId = signup.body.userId;

  const code: string = await db('users').where({ id: userId }).first('verification_code')
    .then((row) => row.verificationCode);
  await request(app).post('/api/auth/verify').send({ userId, code }).expect(200);
  const login = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
  token = login.body.token;

  const store = await request(app).post('/api/store').set(auth()).send({
    name: `AI Store ${RUN_ID}`, address: '1 Test Street', phone: '+919000000001', retailType: 'CLOTHING_FASHION',
  });
  expect(store.status).toBe(201);
  storeId = store.body.store.id;
  token = store.body.token;

  const sub = await db('subcategories as s')
    .join('categories as c', 'c.id', 's.category_id')
    .whereNull('s.store_id')
    .where('c.retail_template_id', 'tpl_clothing')
    .first('s.id', 's.category_id');
  subcategoryId = sub.id;
  categoryId = sub.categoryId;

  const sizeDef = await db('attribute_definitions')
    .where({ retail_template_id: 'tpl_clothing' })
    .whereILike('name', 'size')
    .first('id');

  const base = `AIW7${RUN_ID}`.slice(0, 12);
  const created = await request(app).post('/api/products').set(auth()).send({
    retailTemplateId: 'tpl_clothing',
    categoryId,
    subcategoryId,
    name: 'AI Test Tee',
    baseSku: base,
    baseSellingPrice: 900,
    baseCostPrice: 400,
    attributeValues: [],
    variants: ['M', 'L'].map((size) => ({
      sku: `${base}-${size}`,
      displayName: `AI Test Tee / ${size}`,
      attributeValues: [{ attributeDefinitionId: sizeDef.id, value: size }],
      initialStock: { quantity: 3, purchaseCostPrice: 400, purchaseDate: '2026-09-01' },
    })),
  });
  expect(created.status).toBe(201);
  productId = created.body.product.id;
});

afterAll(async () => {
  if (storeId) {
    await db('ai_predictions').where({ store_id: storeId }).del();
    const productIds: string[] = await db('products').where({ store_id: storeId }).pluck('id');
    const variantIds: string[] = productIds.length
      ? await db('product_variants').whereIn('product_id', productIds).pluck('id') : [];
    await db('inventory_movements').where({ store_id: storeId }).del();
    await db('inventory_items').where({ store_id: storeId }).del();
    await db('restock_batches').where({ store_id: storeId }).del();
    if (variantIds.length) await db('variant_attribute_values').whereIn('variant_id', variantIds).del();
    if (variantIds.length) await db('product_variants').whereIn('id', variantIds).del();
    if (productIds.length) await db('product_attribute_values').whereIn('product_id', productIds).del();
    if (productIds.length) await db('products').whereIn('id', productIds).del();
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

describe('Week 7 — AI analysis and AI-assisted restocking', () => {
  test('rejects unauthenticated requests', async () => {
    await request(app).get('/api/ai/overview').expect(401);
  });

  test('product analysis returns explainable scores and is logged once per day', async () => {
    const first = await request(app).get(`/api/ai/products/${productId}/analysis`).set(auth());
    expect(first.status).toBe(200);
    const a = first.body.analysis;
    expect(a.subject.productId).toBe(productId);
    expect(a.subject.stockOnHand).toBe(6);
    for (const key of ['selling', 'demand', 'profitability', 'deadStockRisk', 'returnRisk']) {
      expect(a.scores[key].value).toBeGreaterThanOrEqual(0);
      expect(a.scores[key].value).toBeLessThanOrEqual(100);
      expect(typeof a.scores[key].detail).toBe('string');
    }
    expect(['STRONG_BUY', 'CONTROLLED_BUY', 'TRIAL', 'HOLD', 'AVOID']).toContain(a.recommendation.decision);
    // A brand-new product with no sales can never claim sufficient data.
    expect(a.confidence.dataSufficiency).not.toBe('SUFFICIENT');
    expect(a.reasons.length).toBeGreaterThan(0);
    expect(a.recommendation.sizeMix.map((s: { size: string }) => s.size).sort()).toEqual(['L', 'M']);

    const second = await request(app).get(`/api/ai/products/${productId}/analysis`).set(auth());
    expect(second.body.predictionId).toBe(first.body.predictionId);
  });

  test('owner can modify a recommendation and execute it as a real restock', async () => {
    const rec = await request(app).post('/api/ai/restock/recommend').set(auth())
      .send({ productId, plannedQuantity: 6 });
    expect(rec.status).toBe(201);
    expect(rec.body.analysis.subject.plannedQuantity).toBe(6);
    const predictionId = rec.body.predictionId;

    // Rejecting needs a reason.
    const noReason = await request(app).post(`/api/ai/predictions/${predictionId}/decision`).set(auth())
      .send({ action: 'REJECTED' });
    expect(noReason.status).toBe(400);

    const decided = await request(app).post(`/api/ai/predictions/${predictionId}/decision`).set(auth())
      .send({ action: 'MODIFIED', sizeMix: [{ size: 'M', quantity: 2 }, { size: 'L', quantity: 1 }], execute: true, note: 'Festival week' });
    expect(decided.status).toBe(200);
    expect(decided.body.restock.totalUnits).toBe(3);
    expect(decided.body.prediction.ownerAction).toBe('MODIFIED');
    expect(decided.body.prediction.ownerQuantity).toBe(3);
    expect(decided.body.prediction.restockBatchId).toBe(decided.body.restock.batchId);

    const movements = await db('inventory_movements').where({ store_id: storeId, movement_type: 'RESTOCK' }).count('* as c').first();
    expect(Number(movements!.c)).toBe(3);
    const barcodes: string[] = await db('inventory_items').where({ store_id: storeId }).pluck('barcode');
    expect(barcodes).toHaveLength(9);
    expect(new Set(barcodes).size).toBe(9);

    // Acting twice on the same recommendation would double the stock.
    const again = await request(app).post(`/api/ai/predictions/${predictionId}/decision`).set(auth())
      .send({ action: 'ACCEPTED', execute: true });
    expect(again.status).toBe(409);

    const audit = await db('audit_logs').where({ store_id: storeId, action: 'ai.recommendation_decision' }).first();
    expect(audit).toBeDefined();
  });

  test('a garment not yet in the catalogue can be analysed but not restocked', async () => {
    const rec = await request(app).post('/api/ai/restock/recommend').set(auth()).send({
      name: 'New kurta', subcategoryId, sellingPrice: 1200, costPrice: 500, sizes: ['S', 'M', 'L'], plannedQuantity: 12,
    });
    expect(rec.status).toBe(201);
    expect(rec.body.analysis.subject.productId).toBeNull();
    expect(rec.body.analysis.recommendation.sizeMix).toHaveLength(3);

    const exec = await request(app).post(`/api/ai/predictions/${rec.body.predictionId}/decision`).set(auth())
      .send({ action: 'ACCEPTED', execute: true });
    if (rec.body.analysis.recommendation.quantity > 0) {
      expect(exec.status).toBe(400);
    }

    const ignored = await request(app).post(`/api/ai/predictions/${rec.body.predictionId}/decision`).set(auth())
      .send({ action: 'IGNORED' });
    expect(ignored.status).toBe(200);
    expect(ignored.body.prediction.ownerAction).toBe('IGNORED');
  });

  test('a new-garment request needs a subcategory and a price', async () => {
    const res = await request(app).post('/api/ai/restock/recommend').set(auth()).send({ sizes: ['M'] });
    expect(res.status).toBe(400);
  });

  test('prediction history, evaluation and overview', async () => {
    const list = await request(app).get('/api/ai/predictions?source=LIVE').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(3);

    const evaluation = await request(app).get('/api/ai/evaluation?source=LIVE').set(auth());
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.count).toBe(0); // nothing has reached its 30-day horizon yet
    expect(evaluation.body.ownerDecisions.MODIFIED).toBe(1);
    expect(evaluation.body.ownerDecisions.IGNORED).toBe(1);

    const overview = await request(app).get('/api/ai/overview').set(auth());
    expect(overview.status).toBe(200);
    expect(overview.body.productsScored).toBe(1);
  });
});
