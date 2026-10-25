/**
 * Retraining pipeline — the parts that need no database: cleaning, Excel
 * reading, date splitting, and the model registry that swaps models live.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { preprocess, toDate, toNumber, normSize, LIMITS } from '@/retraining/preprocess';
import { readWorkbook } from '@/retraining/excel-reader';
import { asOfDates, splitDates, isWithinGuardrails } from '@/retraining/tuner';
import { ModelRegistry, type ActiveModel } from '@/services/ai/model-registry';
import { PARAMS, MODEL_VERSION, DEFAULT_PARAMS, resetModel, BASE_MODEL_VERSION } from '@/services/ai/ai-scoring';
import type { CategoryCatalog, RawWorkbook } from '@/retraining/types';

const catalog: CategoryCatalog = {
  categories: [{ id: 'c1', name: "Women's Ethnic" }, { id: 'c2', name: 'Men' }],
  subcategories: [{ id: 's1', name: 'Kurtas', categoryId: 'c1' }],
};

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const NOW = D('2026-10-01');

function wb(over: Partial<RawWorkbook> = {}): RawWorkbook {
  return {
    products: [{ row: 2, code: ' kur-1 ', name: 'Kurta', category: "women's ethnic", subcategory: 'kurta', sellingPrice: '₹1,299', costPrice: null, supplier: 'S' }],
    purchases: [{ row: 2, date: D('2026-01-05'), code: 'KUR-1', size: 'm', quantity: 5, unitCost: 700 }],
    sales: [{ row: 2, date: D('2026-01-10'), invoiceNo: 'A1', code: 'KUR-1', size: 'M', quantity: 2, unitPrice: null, discount: 100 }],
    returns: [],
    ...over,
  };
}

describe('cell parsing', () => {
  it('reads dates written the ways people write them', () => {
    expect(toDate(D('2026-03-31'))?.toISOString().slice(0, 10)).toBe('2026-03-31');
    expect(toDate('2026-03-31')?.toISOString().slice(0, 10)).toBe('2026-03-31');
    expect(toDate('31/03/2026')?.toISOString().slice(0, 10)).toBe('2026-03-31'); // day first
    expect(toDate(46112)?.toISOString().slice(0, 10)).toBe('2026-03-31');       // Excel serial
    expect(toDate('31/13/2026')).toBeNull();
    expect(toDate('not a date')).toBeNull();
  });
  it('reads money and sizes', () => {
    expect(toNumber('₹1,299.50')).toBe(1299.5);
    expect(toNumber('abc')).toBeNull();
    expect(normSize('m')).toBe('M');
    expect(normSize('Free Size')).toBe('One Size');
    expect(normSize(null)).toBe('One Size');
    expect(normSize(32)).toBe('32');
  });
});

describe('preprocess', () => {
  it('normalises codes, categories and fills a missing cost and price', () => {
    const { dataset, quality } = preprocess(wb(), catalog, NOW);
    const p = dataset.products[0];
    expect(p.code).toBe('KUR-1');
    expect(p.categoryName).toBe("Women's Ethnic");
    expect(p.subcategoryId).toBe('s1');
    expect(p.sellingPrice).toBe(1299);
    expect(p.costPrice).toBeCloseTo(1299 * LIMITS.defaultCostShare, 1);
    expect(quality.unitsPurchased).toBe(5);
    expect(quality.unitsSold).toBe(2);
    const sold = dataset.units.flatMap((u) => u.sales);
    expect(sold).toHaveLength(2);
    expect(sold[0].unitPrice).toBe(1299);   // price assumed from the product
    expect(sold[0].discount).toBe(50);      // 100 on a two-piece line
  });

  it('assumes stock the day before a sale that has none, and counts it', () => {
    const raw = wb({ purchases: [] });
    const { dataset, quality } = preprocess(raw, catalog, NOW);
    expect(quality.unitsInferred).toBe(2);
    expect(quality.inferredShare).toBe(1);
    expect(dataset.units.every((u) => u.inferred)).toBe(true);
    expect(quality.blockers.join(' ')).toMatch(/no recorded purchase/);
  });

  it('skips unusable rows, says which, and never lets a bad row through', () => {
    const raw = wb({
      sales: [
        { row: 2, date: D('2026-01-10'), invoiceNo: 'A1', code: 'KUR-1', size: 'M', quantity: 1, unitPrice: 1299, discount: null },
        { row: 3, date: D('2026-01-11'), invoiceNo: 'A2', code: 'NOPE', size: 'M', quantity: 1, unitPrice: 1299, discount: null },
        { row: 4, date: 'garbage', invoiceNo: 'A3', code: 'KUR-1', size: 'M', quantity: 1, unitPrice: 1299, discount: null },
        { row: 5, date: D('2026-01-12'), invoiceNo: 'A4', code: 'KUR-1', size: 'M', quantity: -3, unitPrice: 1299, discount: null },
        { row: 6, date: D('2027-01-12'), invoiceNo: 'A5', code: 'KUR-1', size: 'M', quantity: 1, unitPrice: 1299, discount: null },
      ],
    });
    const { quality } = preprocess(raw, catalog, NOW);
    expect(quality.rowsUsed.sales).toBe(1);
    const rows = quality.issues.filter((i) => i.sheet === 'Sales').map((i) => i.row);
    expect(rows).toEqual(expect.arrayContaining([3, 4, 5, 6]));
    expect(quality.blockers.join(' ')).toMatch(/Sales rows could not be used/);
  });

  it('rejects products in unknown categories and lists the valid ones', () => {
    const raw = wb();
    raw.products[0].category = 'Spaceships';
    const { quality } = preprocess(raw, catalog, NOW);
    expect(quality.rowsUsed.products).toBe(0);
    expect(quality.issues.some((i) => /Valid categories/.test(i.message))).toBe(true);
  });

  it('matches a return to its sale and puts the piece back on the shelf', () => {
    const raw = wb({
      returns: [{ row: 2, date: D('2026-01-15'), invoiceNo: 'A1', code: 'KUR-1', size: 'M', quantity: 1, reason: 'Size issue' }],
      sales: [
        { row: 2, date: D('2026-01-10'), invoiceNo: 'A1', code: 'KUR-1', size: 'M', quantity: 1, unitPrice: 1299, discount: null },
        { row: 3, date: D('2026-01-20'), invoiceNo: 'A2', code: 'KUR-1', size: 'M', quantity: 5, unitPrice: 1299, discount: null },
      ],
    });
    const { dataset, quality } = preprocess(raw, catalog, NOW);
    const returned = dataset.units.flatMap((u) => u.sales).filter((s) => s.returnedAt);
    expect(returned).toHaveLength(1);
    expect(returned[0].returnReason).toBe('Size issue');
    // 5 purchased + 1 sale (returned) + 5 sold: the returned piece is re-sold, so no stock is invented.
    expect(quality.unitsInferred).toBe(0);
  });

  it('refuses a history that is too short to test on', () => {
    const { quality } = preprocess(wb(), catalog, NOW);
    expect(quality.historyDays).toBeLessThan(LIMITS.minHistoryDays);
    expect(quality.blockers.join(' ')).toMatch(/days of history/);
  });
});

describe('excel reader', () => {
  const file = path.join(os.tmpdir(), `ownly-retrain-${process.pid}.xlsx`);
  afterAll(() => { try { fs.unlinkSync(file); } catch { /* already gone */ } });

  it('tolerates header spelling, sheet order, title rows and blank lines', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('README').addRow(['ignore me']);
    const sales = book.addWorksheet('sales');
    sales.addRow(['My shop sales']);                          // title row above the headers
    sales.addRow(['Date', 'Bill No', 'SKU', 'Size', 'Qty', 'Rate']);
    sales.addRow([new Date(Date.UTC(2026, 0, 10)), 'A1', 'kur-1', 'm', 2, 1299]);
    sales.addRow([]);                                         // blank line
    const products = book.addWorksheet('PRODUCTS');
    products.addRow(['Product Code', 'Category', 'Selling Price']);
    products.addRow(['KUR-1', "Women's Ethnic", 1299]);
    const purchases = book.addWorksheet('Purchases');
    purchases.addRow(['date', 'product_code', 'quantity']);
    purchases.addRow([new Date(Date.UTC(2026, 0, 5)), 'KUR-1', 5]);
    await book.xlsx.writeFile(file);

    const { data, problems } = await readWorkbook(file);
    expect(problems).toEqual([]);
    expect(data.products).toHaveLength(1);
    expect(data.sales).toHaveLength(1);
    expect(data.sales[0].code).toBe('kur-1');
    expect(data.sales[0].unitPrice).toBe(1299);
    expect(data.returns).toEqual([]);                         // optional sheet may be absent
  });

  it('names the missing sheet or column instead of failing mysteriously', async () => {
    const book = new ExcelJS.Workbook();
    const p = book.addWorksheet('Products');
    p.addRow(['product_code', 'selling_price']);              // no category column
    p.addRow(['A', 100]);
    await book.xlsx.writeFile(file);
    const { problems } = await readWorkbook(file);
    expect(problems.join(' ')).toMatch(/no "category" column/);
    expect(problems.join(' ')).toMatch(/"Sales" sheet is missing/);
    expect(problems.join(' ')).toMatch(/"Purchases" sheet is missing/);
  });
});

describe('time split', () => {
  it('uses only fully observed windows and leaves a gap before the holdout', () => {
    const dates = asOfDates(D('2025-07-01'), D('2026-10-01'), 12);
    expect(dates.length).toBeGreaterThanOrEqual(10);
    expect(dates[dates.length - 1].getTime()).toBeLessThanOrEqual(D('2026-10-01').getTime() - 30 * 86_400_000);
    expect(dates[0].getTime()).toBeGreaterThanOrEqual(D('2025-07-01').getTime() + 90 * 86_400_000);

    const { train, holdout, purged } = splitDates(dates);
    expect(holdout.length).toBeGreaterThanOrEqual(2);
    expect(purged).not.toBeNull();
    expect(train.length + holdout.length + 1).toBe(dates.length);
    expect(Math.max(...train.map((d) => d.getTime()))).toBeLessThan(Math.min(...holdout.map((d) => d.getTime())));
  });

  it('flags ranges that are too narrow or too wide, and large bias', () => {
    const ok = { predictions: 100, wape: 0.7, baselineWape: 0.75, liftOverBaseline: 0.05, bias: -0.05, intervalCoverage: 0.8, brier: 0.18 };
    expect(isWithinGuardrails(ok)).toBe(true);
    expect(isWithinGuardrails({ ...ok, intervalCoverage: 0.6 })).toBe(false);
    expect(isWithinGuardrails({ ...ok, intervalCoverage: 0.95 })).toBe(false);
    expect(isWithinGuardrails({ ...ok, bias: 0.3 })).toBe(false);
  });
});

describe('model registry — replacing the live model', () => {
  const dir = path.join(os.tmpdir(), `ownly-model-${process.pid}`);
  const metrics = { predictions: 100, wape: 0.6, baselineWape: 0.7, liftOverBaseline: 0.14, bias: 0, intervalCoverage: 0.8, brier: 0.17 };
  const model = (version: string, overdispersion: number): ActiveModel => ({
    schema: 1, version, baseVersion: BASE_MODEL_VERSION,
    params: { ...DEFAULT_PARAMS, priorStrength: { ...DEFAULT_PARAMS.priorStrength }, overdispersion },
    trainedAt: new Date().toISOString(),
    trainedOn: { source: 'excel', label: 'test', from: '2025-01-01', to: '2026-01-01', products: 10, saleLines: 100 },
    holdout: metrics, previousHoldout: metrics, previousVersion: BASE_MODEL_VERSION,
  });

  beforeEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    process.env.MODEL_DIR = dir;
    fs.mkdirSync(dir, { recursive: true });
    resetModel();
  });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.MODEL_DIR; resetModel(); });

  it('runs the shipped model when no file exists', () => {
    ModelRegistry.applyActive();
    expect(MODEL_VERSION).toBe(BASE_MODEL_VERSION);
    expect(PARAMS.overdispersion).toBe(DEFAULT_PARAMS.overdispersion);
  });

  it('goes live as soon as a model is installed, and archives the one it replaced', () => {
    ModelRegistry.applyActive();
    ModelRegistry.install(model('v-a', 5));
    ModelRegistry.applyActive();
    expect(MODEL_VERSION).toBe('v-a');
    expect(PARAMS.overdispersion).toBe(5);

    ModelRegistry.install(model('v-b', 7));
    ModelRegistry.applyActive();
    expect(MODEL_VERSION).toBe('v-b');
    expect(fs.existsSync(path.join(dir, 'archive', 'v-a.json'))).toBe(true);
  });

  it('rolls back one step at a time, down to the shipped model', () => {
    ModelRegistry.install(model('v-a', 5));
    ModelRegistry.install(model('v-b', 7));
    expect(ModelRegistry.rollback().restored).toBe('v-a');
    ModelRegistry.applyActive();
    expect(PARAMS.overdispersion).toBe(5);
    expect(ModelRegistry.rollback().restored).toBe(BASE_MODEL_VERSION);
    ModelRegistry.applyActive();
    expect(MODEL_VERSION).toBe(BASE_MODEL_VERSION);
    expect(PARAMS.overdispersion).toBe(DEFAULT_PARAMS.overdispersion);
  });

  it('will not install or run settings outside safe bounds', () => {
    expect(() => ModelRegistry.install(model('bad', 9999))).toThrow(/outside/);
    fs.writeFileSync(path.join(dir, 'active-model.json'), JSON.stringify(model('hand-edited', 9999)));
    ModelRegistry.applyActive();
    expect(MODEL_VERSION).toBe(BASE_MODEL_VERSION);            // falls back to the shipped model
  });

  it('ignores a corrupt file instead of crashing the API', () => {
    fs.writeFileSync(path.join(dir, 'active-model.json'), '{ not json');
    expect(() => ModelRegistry.applyActive()).not.toThrow();
    expect(MODEL_VERSION).toBe(BASE_MODEL_VERSION);
  });
});
