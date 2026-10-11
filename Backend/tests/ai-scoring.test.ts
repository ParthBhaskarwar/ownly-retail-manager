/**
 * Week 7 AI — unit tests for the pure parts: statistics, scoring, evaluation.
 * No database: the store is built in memory, so every expectation is about
 * the model's logic, not about data.
 */

import {
  allocateLargestRemainder, expectedSalesCapped, fitGammaPrior, negBinPmf,
  percentileRank, pmfQuantile, sizeCappedSales, updateGamma,
} from '@/services/ai/ai-math';
import { analyse, analyseAll, MODEL_VERSION } from '@/services/ai/ai-scoring';
import { summarise } from '@/services/ai/ai-evaluation.service';
import type { ProductFeatures, StoreFeatures, VariantFeatures } from '@/services/ai/ai-features.repository';
import type { PredictionRow } from '@/services/ai/ai-prediction.repository';

// ─── Fixture builders ─────────────────────────────────────────────────────────

const AS_OF = '2026-09-01T00:00:00.000Z';
const SIZES = ['S', 'M', 'L', 'XL'];

function variant(size: string, over: Partial<VariantFeatures> = {}): VariantFeatures {
  return {
    variantId: `v-${size}-${Math.random()}`, size, stock: 3,
    units30: 0, units31to90: 0, units180: 0, unitsLifetime: 0,
    inStockDays30: 30, inStockDays31to90: 60, inStockDays180: 180, ...over,
  };
}

/** A product selling `perDay` units a day, evenly across sizes, always in stock. */
function product(id: string, perDay: number, over: Partial<ProductFeatures> = {}): ProductFeatures {
  const perSize = perDay / SIZES.length;
  const variants = over.variants ?? SIZES.map((s) => variant(s, {
    units30: Math.round(perSize * 30), units31to90: Math.round(perSize * 60),
    units180: Math.round(perSize * 180), unitsLifetime: Math.round(perSize * 365),
  }));
  const sum = (k: keyof VariantFeatures) => variants.reduce((t, v) => t + (v[k] as number), 0);
  return {
    productId: id, name: `Product ${id}`, baseSku: id.toUpperCase(),
    categoryId: 'cat', categoryName: 'Topwear', subcategoryId: 'sub', subcategoryName: 'T-Shirts',
    supplierId: null, sellingPrice: 1000, costPrice: 500, status: 'ACTIVE', hasPhoto: false,
    firstStockedAt: '2025-06-01T00:00:00.000Z', unitsReceived: sum('unitsLifetime') + sum('stock'),
    stockNow: sum('stock'), avgStockAgeDays: 40, avgCostInStock: 500,
    inStockDays30: 30, inStockDays31to90: 60, inStockDays180: 180,
    launchInStockDays: 60, launchUnits: Math.round(perDay * 60), launchComplete: true,
    units7: Math.round(perDay * 7), units15: Math.round(perDay * 15),
    units30: sum('units30'), units31to90: sum('units31to90'), units180: sum('units180'),
    unitsLifetime: sum('unitsLifetime'), firstSaleAt: '2025-06-02T00:00:00.000Z',
    grossRevenue: sum('unitsLifetime') * 1000, realisedRevenue: sum('unitsLifetime') * 950,
    discountedUnits: 0, avgUnitCostSold: 500, returns: 0,
    ...over, variants,
  };
}

function store(products: ProductFeatures[], over: Partial<StoreFeatures> = {}): StoreFeatures {
  return {
    storeId: 'store', asOf: AS_OF, products,
    byId: new Map(products.map((p) => [p.productId, p])),
    seasonal: { store: 1, byCategory: new Map(), hasHistory: false },
    storeReturnRate: 0.03,
    ...over,
  };
}

/** A catalogue of 20 peers spanning slow to fast sellers. */
function catalogue(): ProductFeatures[] {
  return Array.from({ length: 20 }, (_, i) => product(`peer${i}`, 0.05 + i * 0.05));
}

// ─── ai-math ──────────────────────────────────────────────────────────────────

describe('ai-math', () => {
  test('negative binomial pmf sums to 1 and has the requested mean', () => {
    const pmf = negBinPmf(6, 3);
    const total = pmf.reduce((a, b) => a + b, 0);
    const mean = pmf.reduce((s, p, k) => s + p * k, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(mean).toBeCloseTo(6, 2);
  });

  test('quantiles are ordered and bracket the mean', () => {
    const pmf = negBinPmf(10, 4);
    const q10 = pmfQuantile(pmf, 0.1);
    const q90 = pmfQuantile(pmf, 0.9);
    expect(q10).toBeLessThan(10);
    expect(q90).toBeGreaterThan(10);
  });

  test('sales can never exceed stock, and more stock never sells less', () => {
    const pmf = negBinPmf(8, 3);
    const s5 = expectedSalesCapped(pmf, 5);
    const s10 = expectedSalesCapped(pmf, 10);
    expect(s5).toBeLessThanOrEqual(5);
    expect(s10).toBeGreaterThanOrEqual(s5);
    expect(expectedSalesCapped(pmf, 1000)).toBeCloseTo(8, 1);
  });

  test('stock in a size nobody wants does not sell', () => {
    const even = sizeCappedSales(8, 3, [{ share: 0.5, stock: 10 }, { share: 0.5, stock: 10 }]);
    const wrong = sizeCappedSales(8, 3, [{ share: 0.98, stock: 0 }, { share: 0.02, stock: 20 }]);
    expect(even.expected).toBeGreaterThan(7);
    expect(wrong.expected).toBeLessThan(0.5);
    expect(wrong.pNoSale).toBeGreaterThan(even.pNoSale);
  });

  test('Gamma–Poisson: own history pulls the belief away from the prior', () => {
    const prior = { shape: 2, rate: 10 }; // 0.2/day
    const post = updateGamma(prior, 90, 90); // observed 1/day for 90 days
    expect(post.shape / post.rate).toBeGreaterThan(0.9);
  });

  test('peer prior falls back when there are too few peers, and clamps its strength', () => {
    const fallback = { shape: 1, rate: 10 };
    expect(fitGammaPrior([{ rate: 1, weight: 1 }], fallback)).toBe(fallback);
    const tight = fitGammaPrior([1, 1.01, 0.99, 1].map((r) => ({ rate: r, weight: 1 })), fallback, { minRate: 3, maxRate: 15 });
    expect(tight.rate).toBe(15);
    expect(tight.shape / tight.rate).toBeCloseTo(1, 2);
  });

  test('largest-remainder allocation hits the total exactly', () => {
    const out = allocateLargestRemainder({ S: 1, M: 3, L: 3, XL: 0 }, 10);
    expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(10);
    expect(out.XL).toBe(0);
    expect(out.M).toBeGreaterThan(out.S);
  });

  test('percentile rank', () => {
    expect(percentileRank([1, 2, 3, 4], 5)).toBe(1);
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
    expect(percentileRank([1, 2, 3, 4], 2.5)).toBe(0.5);
  });
});

// ─── Scoring ──────────────────────────────────────────────────────────────────

describe('ai-scoring', () => {
  test('a fast seller that is nearly out of stock is a buy, with a quantity and reasons', () => {
    const fast = product('fast', 1.2, {
      variants: SIZES.map((s) => variant(s, { stock: 1, units30: 9, units31to90: 18, units180: 54, unitsLifetime: 110 })),
    });
    const a = analyse(store([...catalogue(), fast]), { productId: 'fast' });

    expect(a.modelVersion).toBe(MODEL_VERSION);
    expect(['STRONG_BUY', 'CONTROLLED_BUY']).toContain(a.recommendation.decision);
    expect(a.recommendation.quantity).toBeGreaterThan(0);
    expect(a.recommendation.sizeMix.reduce((t, s) => t + s.quantity, 0)).toBe(a.recommendation.quantity);
    expect(a.scores.demand.value).toBeGreaterThanOrEqual(80);
    expect(a.reasons.length).toBeGreaterThan(2);
    expect(a.reasons.some((r) => r.impact === 'positive')).toBe(true);
    expect(a.confidence.dataSufficiency).toBe('SUFFICIENT');
  });

  test('a product with months of stock on hand is a hold, whatever its demand', () => {
    const covered = product('covered', 0.5, {
      variants: SIZES.map((s) => variant(s, { stock: 40, units30: 4, units31to90: 8, units180: 24, unitsLifetime: 50 })),
    });
    const a = analyse(store([...catalogue(), covered]), { productId: 'covered' });
    expect(a.recommendation.decision).toBe('HOLD');
    expect(a.recommendation.quantity).toBe(0);
    expect(a.recommendation.coverDays).toBeGreaterThan(60);
  });

  test('a product that has not sold in 90 days with stock on the shelf is flagged for clearance', () => {
    const dead = product('dead', 0, {
      avgStockAgeDays: 200,
      variants: SIZES.map((s) => variant(s, { stock: 5, units30: 0, units31to90: 0, units180: 1, unitsLifetime: 3 })),
    });
    const a = analyse(store([...catalogue(), dead]), { productId: 'dead' });
    expect(a.metrics?.lifecycleStage).toBe('DEAD');
    expect(a.recommendation.productAction).toBe('CLEARANCE');
    expect(a.scores.deadStockRisk.value).toBeGreaterThanOrEqual(50);
  });

  test('size mix buys the sizes that sell, not the sizes left over', () => {
    // M sells fastest and is sold out; XL has a pile of leftovers.
    const skew = product('skew', 0.8, {
      variants: [
        variant('S', { stock: 1, units30: 3, units31to90: 6, units180: 18, unitsLifetime: 30 }),
        variant('M', { stock: 0, units30: 12, units31to90: 24, units180: 72, unitsLifetime: 120 }),
        variant('L', { stock: 1, units30: 8, units31to90: 16, units180: 48, unitsLifetime: 80 }),
        variant('XL', { stock: 12, units30: 1, units31to90: 2, units180: 6, unitsLifetime: 10 }),
      ],
    });
    const a = analyse(store([...catalogue(), skew]), { productId: 'skew' });
    const qty = Object.fromEntries(a.recommendation.sizeMix.map((s) => [s.size, s.quantity]));
    expect(a.recommendation.quantity).toBeGreaterThan(0);
    expect(qty.M).toBeGreaterThan(qty.XL);
    expect(qty.XL).toBe(0);
  });

  test('stock is judged per size: leftovers in unwanted sizes do not count as sellable', () => {
    const base = { units30: 0, units31to90: 0, units180: 0, unitsLifetime: 0 };
    const make = (id: string, stock: Record<string, number>) => product(id, 1, {
      variants: [
        variant('M', { ...base, stock: stock.M, units30: 28, units31to90: 56, units180: 170, unitsLifetime: 340 }),
        variant('XXL', { ...base, stock: stock.XXL, units30: 1, units31to90: 1, units180: 3, unitsLifetime: 6 }),
      ],
    });
    const s = store([...catalogue(), make('good', { M: 20, XXL: 0 }), make('bad', { M: 0, XXL: 20 })]);
    const good = analyse(s, { productId: 'good' });
    const bad = analyse(s, { productId: 'bad' });
    expect(good.forecast.expectedSales).toBeGreaterThan(5 * bad.forecast.expectedSales);
  });

  test('leftovers in a slow size do not count as cover, and a size sell-out is not "slowing sales"', () => {
    // Popular sizes sold out in the last 30 days; only slow-selling S remains.
    const soldOut = product('soldout', 1, {
      variants: [
        variant('S', { stock: 13, units30: 1, units31to90: 2, units180: 6, unitsLifetime: 12, inStockDays30: 30 }),
        variant('M', { stock: 0, units30: 4, units31to90: 20, units180: 60, unitsLifetime: 120, inStockDays30: 6 }),
        variant('L', { stock: 0, units30: 4, units31to90: 18, units180: 54, unitsLifetime: 110, inStockDays30: 6 }),
      ],
    });
    const a = analyse(store([...catalogue(), soldOut]), { productId: 'soldout' });
    expect(a.recommendation.coverDays!).toBeLessThan(15);
    expect(a.recommendation.decision).not.toBe('HOLD');
    expect(a.metrics?.lifecycleStage).not.toBe('DECLINING');
    expect(a.reasons.some((r) => r.text.includes('mostly in sizes that sell slowly'))).toBe(true);
    expect(a.recommendation.sizeMix.find((s) => s.size === 'S')!.quantity).toBe(0);
  });

  test('a new garment borrows from comparable products and is never a Strong Buy', () => {
    const a = analyse(store(catalogue()), {
      name: 'New tee', categoryId: 'cat', subcategoryId: 'sub', sellingPrice: 1000, costPrice: 450, sizes: SIZES,
    });
    expect(a.subject.productId).toBeNull();
    expect(a.metrics).toBeNull();
    expect(a.recommendation.decision).not.toBe('STRONG_BUY');
    expect(a.comparables.length).toBeGreaterThanOrEqual(3);
    expect(a.comparables[0].basis).toBe('SUBCATEGORY_PRICE');
    expect(a.reasons[0].text).toMatch(/No sales history yet/);
  });

  test('photo matches are preferred over price matches', () => {
    const a = analyse(store(catalogue()), {
      categoryId: 'cat', subcategoryId: 'sub', sellingPrice: 1000, costPrice: 450, sizes: SIZES,
      photoPeers: [{ productId: 'peer19', similarity: 0.93 }, { productId: 'peer18', similarity: 0.9 }],
    });
    expect(a.comparables[0].basis).toBe('PHOTO');
    expect(a.comparables[0].productId).toBe('peer19');
  });

  test("an oversized plan raises the plan's risk but does not flip the product's decision", () => {
    const s = store(catalogue());
    const input = { categoryId: 'cat', subcategoryId: 'sub', sellingPrice: 1000, costPrice: 450, sizes: SIZES };
    const sensible = analyse(s, { ...input, plannedQuantity: 8 });
    const huge = analyse(s, { ...input, plannedQuantity: 400 });
    expect(huge.recommendation.decision).toBe(sensible.recommendation.decision);
    expect(huge.scores.deadStockRisk.value).toBeGreaterThan(sensible.scores.deadStockRisk.value);
    expect(huge.reasons.some((r) => r.text.includes('You planned 400'))).toBe(true);
  });

  test('confidence rises with evidence', () => {
    const s = store([...catalogue(), product('old', 0.6)]);
    const known = analyse(s, { productId: 'old' });
    const unknown = analyse(s, { categoryId: 'cat', subcategoryId: 'sub', sellingPrice: 1000, costPrice: 500, sizes: SIZES });
    expect(known.confidence.value).toBeGreaterThan(unknown.confidence.value);
  });

  test('a high return rate is surfaced as a risk', () => {
    const returns = product('ret', 0.6, { returns: 40 });
    const a = analyse(store([...catalogue(), returns]), { productId: 'ret' });
    expect(a.scores.returnRisk.value).toBeGreaterThanOrEqual(75);
    expect(a.reasons.some((r) => r.text.startsWith('Return risk'))).toBe(true);
  });

  test('high returns cap a strong seller at a controlled buy instead of vetoing it', () => {
    const popular = product('pop', 1.2, {
      returns: 40,
      variants: SIZES.map((s) => variant(s, { stock: 1, units30: 9, units31to90: 18, units180: 54, unitsLifetime: 110 })),
    });
    const a = analyse(store([...catalogue(), popular]), { productId: 'pop' });
    expect(a.scores.returnRisk.value).toBeGreaterThanOrEqual(75);
    expect(a.recommendation.decision).toBe('CONTROLLED_BUY');
    expect(a.reasons.some((r) => r.text.includes('controlled quantity'))).toBe(true);
  });

  test('seasonality scales the forecast', () => {
    const products = [...catalogue(), product('x', 0.5)];
    const flat = analyse(store(products), { productId: 'x' });
    const peak = analyse(store(products, { seasonal: { store: 1.5, byCategory: new Map([['cat', 1.5]]), hasHistory: true } }), { productId: 'x' });
    expect(peak.forecast.demandMean).toBeCloseTo(flat.forecast.demandMean * 1.5, 0);
  });

  test('analyseAll scores every product and is deterministic', () => {
    const s = store(catalogue());
    const a = analyseAll(s).map((x) => x.forecast.expectedSales);
    const b = analyseAll(s).map((x) => x.forecast.expectedSales);
    expect(a).toHaveLength(20);
    expect(a).toEqual(b);
  });
});

// ─── Evaluation ───────────────────────────────────────────────────────────────

describe('evaluation summary', () => {
  const row = (predicted: number, actual: number, baseline: number, over: Partial<PredictionRow> = {}): PredictionRow => ({
    predictedUnits: predicted, predictedUnitsQ10: Math.max(0, predicted - 2), predictedUnitsQ90: predicted + 2,
    actualUnits: actual, baselineUnits: baseline, firstSaleProbability: 0.8, expectedSellThrough: 0.5,
    actualSellThrough: 0.5, stockAtAsOf: 5, confidenceTier: 'MEDIUM', decision: 'HOLD',
    asOf: AS_OF, modelVersion: MODEL_VERSION, ...over,
  } as PredictionRow);

  test('computes WAPE, lift over the carry-forward baseline and interval coverage', () => {
    const rows = [row(5, 5, 8), row(3, 4, 0), row(10, 7, 12)];
    const s = summarise('BACKTEST', rows, { ACCEPTED: 0, MODIFIED: 0, IGNORED: 0, REJECTED: 0, PENDING: 0 });
    expect(s.count).toBe(3);
    expect(s.forecast.wape).toBeCloseTo(4 / 16, 3);
    expect(s.forecast.baselineWape).toBeCloseTo(12 / 16, 3);
    expect(s.forecast.liftOverBaseline).toBeCloseTo(1 - 0.25 / 0.75, 3);
    expect(s.forecast.intervalCoverage).toBeCloseTo(2 / 3, 3); // 10 vs 7 falls outside [8, 12]
  });

  test('ignores predictions that have no actual yet', () => {
    const s = summarise('LIVE', [row(5, 5, 5), { ...row(5, 0, 5), actualUnits: null }],
      { ACCEPTED: 1, MODIFIED: 0, IGNORED: 0, REJECTED: 0, PENDING: 2 });
    expect(s.count).toBe(1);
    expect(s.ownerDecisions.PENDING).toBe(2);
  });
});
