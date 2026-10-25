/**
 * ai-scoring — the Week 7 offline scoring model (ownly-scoring-v1).
 *
 * Pure: takes the store's as-of features (ai-features.repository) and returns
 * an explainable analysis. No I/O, so the live app, the backtest and the unit
 * tests all run exactly the same code.
 *
 * How a forecast is made
 *  1. Own evidence. Units sold per in-stock day over the last 90 days, the
 *     most recent 30 days counted fully and days 31–90 at half weight. A day
 *     only counts in proportion to the share of demand whose sizes were on
 *     the shelf, so a best-seller sold out in M and L is not mistaken for a
 *     slow mover.
 *  2. Prior from comparable products. Photo matches (CLIP) when available,
 *     otherwise the same subcategory in a similar price band (widening to the
 *     category, then the store). A Gamma distribution is fitted to their sales
 *     rates — launch-period rates for a new product.
 *  3. Combine. Gamma–Poisson update: prior + own units / own in-stock days.
 *     Little own history → the peers dominate; months of history → the
 *     product's own record dominates. No hand-tuned blend weight.
 *  4. Seasonality. Next 30 days vs the previous 90, from the same weeks last
 *     year, per category (shrunk toward the store-wide ratio).
 *  5. Predictive distribution. Negative Binomial: the Gamma's uncertainty plus
 *     the extra week-to-week noise real demand has (OVERDISPERSION, calibrated
 *     by the backtest so the q10–q90 band covers ~80% of outcomes).
 *
 * Every score, the decision, the quantity and the size mix are derived from
 * that one distribution, and every reason quotes the number it came from.
 */

import type { ProductFeatures, StoreFeatures, VariantFeatures } from './ai-features.repository';
import {
  allocateLargestRemainder, clamp, fitGammaPrior, gammaMean,
  percentileRank, pmfQuantile, predictiveDemand, round, sizeCappedSales, updateGamma,
  type GammaBelief,
} from './ai-math';
import type {
  AiAnalysis, AiDecision, AiReason, AiScore, Comparable, ConfidenceTier,
  DataSufficiency, LifecycleStage, ProductAction, ProductMetrics, SizeRecommendation,
} from './ai.types';

export const BASE_MODEL_VERSION = 'ownly-scoring-v1';
/**
 * The version stamped on every stored prediction. It is the shipped version
 * until a retrained model is activated (see model-registry.ts), after which it
 * names that model so old and new predictions can be compared fairly.
 */
export let MODEL_VERSION: string = BASE_MODEL_VERSION;
export const HORIZON_DAYS = 30;

/**
 * Tuned on the synthetic store's backtest (14 as-of dates, 28 days apart,
 * 7.7k product-months): WAPE 70.1% vs 73.4% for carry-forward, bias −8.6%,
 * q10–q90 coverage 80.7%. The surface is flat — ±1 point across sensible
 * values — so these are chosen for balance, not squeezed for the last digit.
 */
export interface ModelParams {
  /** NB shape of demand noise beyond parameter uncertainty (sets interval width). */
  overdispersion: number;
  /** Weight of days 31–90 relative to the last 30 days. */
  olderWindowWeight: number;
  /** Peer prior strength in pseudo in-stock days. */
  priorStrength: { minRate: number; maxRate: number };
  /** Pseudo-units pulling a size curve toward the peer curve. */
  sizePriorUnits: number;
  /** Pseudo-units pulling a return rate toward the peer rate. */
  returnPriorUnits: number;
  maxPeers: number;
  /** Wider (category / store) tiers top the pool up to this many peers. */
  minPeersForPrior: number;
  /** A peer's price may differ by up to this factor (1.5 = ±50%). */
  peerPriceFactor: number;
  minPeerDays: number;
}

/** The shipped settings. Retraining searches around these; it never edits them. */
export const DEFAULT_PARAMS: Readonly<ModelParams> = Object.freeze({
  overdispersion: 3,
  olderWindowWeight: 0.75,
  priorStrength: Object.freeze({ minRate: 3, maxRate: 15 }),
  sizePriorUnits: 10,
  returnPriorUnits: 20,
  maxPeers: 12,
  minPeersForPrior: 5,
  peerPriceFactor: 1.5,
  minPeerDays: 14,
});

/** The settings in force. Mutated only by activateModel() / resetModel() below. */
export const PARAMS: ModelParams = {
  ...DEFAULT_PARAMS,
  priorStrength: { ...DEFAULT_PARAMS.priorStrength },
};

/**
 * Switches the live scoring to a (retrained) model. Clears the per-snapshot
 * reference cache, because it was computed under the old settings.
 */
export function activateModel(version: string, params: Partial<ModelParams>): void {
  Object.assign(PARAMS, params, {
    priorStrength: { ...PARAMS.priorStrength, ...(params.priorStrength ?? {}) },
  });
  MODEL_VERSION = version;
  clearScoringCaches();
}

/** Back to the shipped model. */
export function resetModel(): void {
  Object.assign(PARAMS, DEFAULT_PARAMS, { priorStrength: { ...DEFAULT_PARAMS.priorStrength } });
  MODEL_VERSION = BASE_MODEL_VERSION;
  clearScoringCaches();
}

export function clearScoringCaches(): void {
  referenceCache = new WeakMap();
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface AnalysisInput {
  /** Existing product being analysed; omit for a garment not yet in the catalogue. */
  productId?: string;
  name?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  sellingPrice?: number;
  costPrice?: number;
  /** Sizes for a new product (existing products use their variants). */
  sizes?: string[];
  plannedQuantity?: number | null;
  /** Owner's own split of the planned quantity by size. */
  plannedSizeMix?: Record<string, number> | null;
  /** Photo-similar products from pgvector, best first. */
  photoPeers?: Array<{ productId: string; similarity: number }>;
  /**
   * Backtest only: stock that actually arrived during the horizon, so the
   * forecast is conditioned on the purchase plan that really happened.
   */
  receivedDuringHorizon?: number;
  receivedBySize?: Record<string, number>;
}

// ─── Per-store reference data (memoised per features snapshot) ────────────────

interface ProductStats {
  p: ProductFeatures;
  unitsEff: number;
  daysEff: number;
  /** In-stock days weighted by the share of demand whose sizes were available. */
  days30: number;
  days31to90: number;
  currentRate: number | null;
  launchRate: number | null;
  realisation: number | null;
  returnRate: number | null;
  sizeWeights: Map<string, number>;
}

interface StoreReference {
  stats: Map<string, ProductStats>;
  demandRates: number[];
  gmroi: number[];
  storePrior: GammaBelief;
  storeLaunchPrior: GammaBelief;
  sizeCurveBySubcategory: Map<string, Map<string, number>>;
  sizeCurveStore: Map<string, number>;
  medianPriceBySubcategory: Map<string, number>;
  realisationStore: number;
}

let referenceCache = new WeakMap<StoreFeatures, StoreReference>();

/** Demand share per size, smoothed, used to weight in-stock days by size. */
function sizeWeightsOf(variants: VariantFeatures[]): Map<string, number> {
  const total = variants.reduce((s, v) => s + v.unitsLifetime + 1, 0);
  return new Map(variants.map((v) => [v.size, (v.unitsLifetime + 1) / total]));
}

function statsOf(p: ProductFeatures): ProductStats {
  const sizeWeights = sizeWeightsOf(p.variants);
  let d30 = p.inStockDays30;
  let d31to90 = p.inStockDays31to90;
  if (p.variants.length > 0) {
    d30 = 0;
    d31to90 = 0;
    for (const v of p.variants) {
      const w = sizeWeights.get(v.size) ?? 0;
      d30 += w * v.inStockDays30;
      d31to90 += w * v.inStockDays31to90;
    }
  }
  const unitsEff = p.units30 + PARAMS.olderWindowWeight * p.units31to90;
  const daysEff = d30 + PARAMS.olderWindowWeight * d31to90;
  return {
    p,
    unitsEff,
    daysEff,
    days30: d30,
    days31to90: d31to90,
    currentRate: daysEff >= PARAMS.minPeerDays ? unitsEff / daysEff : null,
    launchRate: p.launchComplete && p.launchInStockDays >= PARAMS.minPeerDays
      ? p.launchUnits / p.launchInStockDays : null,
    realisation: p.grossRevenue > 0 ? p.realisedRevenue / p.grossRevenue : null,
    returnRate: p.unitsLifetime >= 10 ? p.returns / p.unitsLifetime : null,
    sizeWeights,
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function referenceFor(store: StoreFeatures): StoreReference {
  const cached = referenceCache.get(store);
  if (cached) return cached;

  const stats = new Map(store.products.map((p) => [p.productId, statsOf(p)]));
  const all = [...stats.values()];

  const fallback: GammaBelief = { shape: 0.5, rate: 10 };
  const storePrior = fitGammaPrior(
    all.filter((s) => s.currentRate !== null).map((s) => ({ rate: s.currentRate!, weight: 1 })),
    fallback, PARAMS.priorStrength
  );
  const storeLaunchPrior = fitGammaPrior(
    all.filter((s) => s.launchRate !== null).map((s) => ({ rate: s.launchRate!, weight: 1 })),
    storePrior, PARAMS.priorStrength
  );

  // Size curves from in-stock-adjusted per-size rates (censoring-aware).
  const sizeCurveBySubcategory = new Map<string, Map<string, number>>();
  const sizeCurveStore = new Map<string, number>();
  for (const s of all) {
    for (const v of s.p.variants) {
      if (v.inStockDays180 < 7) continue;
      const rate = v.units180 / v.inStockDays180;
      sizeCurveStore.set(v.size, (sizeCurveStore.get(v.size) ?? 0) + rate);
      if (s.p.subcategoryId) {
        if (!sizeCurveBySubcategory.has(s.p.subcategoryId)) sizeCurveBySubcategory.set(s.p.subcategoryId, new Map());
        const curve = sizeCurveBySubcategory.get(s.p.subcategoryId)!;
        curve.set(v.size, (curve.get(v.size) ?? 0) + rate);
      }
    }
  }

  const pricesBySub = new Map<string, number[]>();
  for (const s of all) {
    if (!s.p.subcategoryId) continue;
    if (!pricesBySub.has(s.p.subcategoryId)) pricesBySub.set(s.p.subcategoryId, []);
    pricesBySub.get(s.p.subcategoryId)!.push(s.p.sellingPrice);
  }
  const medianPriceBySubcategory = new Map([...pricesBySub].map(([k, v]) => [k, median(v)]));

  const realisations = all.filter((s) => s.realisation !== null).map((s) => s.realisation!);
  const realisationStore = realisations.length ? median(realisations) : 0.92;

  const ref: StoreReference = {
    stats,
    demandRates: [],
    gmroi: [],
    storePrior,
    storeLaunchPrior,
    sizeCurveBySubcategory,
    sizeCurveStore,
    medianPriceBySubcategory,
    realisationStore,
  };

  // Reference distributions for the two percentile scores, over products that
  // were actually on sale recently.
  for (const s of all) {
    if (s.currentRate === null) continue;
    const posterior = updateGamma(ref.storePrior, s.unitsEff, s.daysEff);
    ref.demandRates.push(gammaMean(posterior));
    const d = predictiveDemand(posterior, HORIZON_DAYS, 1, PARAMS.overdispersion);
    const sizes = s.p.variants.length ? s.p.variants.map((v) => v.size) : ['One Size'];
    const shares = sizeShares(sizes, s.p.variants, ref, s.p.subcategoryId);
    const bySize = sizes.map((sz) => ({ share: shares.get(sz)!, stock: s.p.variants.find((v) => v.size === sz)?.stock ?? 0 }));
    if (s.p.stockNow === 0) bySize[0].stock = 1;
    const stock = bySize.reduce((t, x) => t + x.stock, 0);
    const unitCost = s.p.avgUnitCostSold ?? s.p.costPrice;
    const unitMargin = s.p.sellingPrice * (s.realisation ?? realisationStore) - unitCost;
    const sold = sizeCappedSales(d.mean, d.shape, bySize).expected;
    if (unitCost > 0) ref.gmroi.push((unitMargin * sold) / (stock * unitCost));
  }
  ref.demandRates.sort((a, b) => a - b);
  ref.gmroi.sort((a, b) => a - b);

  referenceCache.set(store, ref);
  return ref;
}

// ─── Peers ────────────────────────────────────────────────────────────────────

interface Peer {
  stats: ProductStats;
  basis: Comparable['basis'];
  weight: number;
  rate: number;
}

function findPeers(
  store: StoreFeatures,
  ref: StoreReference,
  subject: { productId?: string; categoryId: string | null; subcategoryId: string | null; price: number },
  useLaunchRate: boolean,
  photoPeers: Array<{ productId: string; similarity: number }>
): Peer[] {
  const rateOf = (s: ProductStats) => (useLaunchRate ? s.launchRate : s.currentRate);
  const peers = new Map<string, Peer>();

  for (const pp of photoPeers) {
    const s = ref.stats.get(pp.productId);
    const rate = s ? rateOf(s) : null;
    if (!s || rate === null || pp.productId === subject.productId) continue;
    // Photo matches are the most specific evidence: count them double.
    peers.set(pp.productId, { stats: s, basis: 'PHOTO', weight: 2 * pp.similarity, rate });
  }

  const priceWeight = (price: number) => {
    if (subject.price <= 0 || price <= 0) return 0.5;
    const ratio = Math.abs(Math.log(price / subject.price));
    if (ratio > Math.log(PARAMS.peerPriceFactor)) return 0;
    return Math.exp(-ratio / 0.25);
  };

  const tiers: Array<{ basis: Comparable['basis']; match: (s: ProductStats) => boolean; scale: number }> = [
    { basis: 'SUBCATEGORY_PRICE', match: (s) => !!subject.subcategoryId && s.p.subcategoryId === subject.subcategoryId, scale: 1 },
    { basis: 'CATEGORY_PRICE', match: (s) => !!subject.categoryId && s.p.categoryId === subject.categoryId, scale: 0.5 },
    { basis: 'STORE', match: () => true, scale: 0.25 },
  ];

  for (const [i, tier] of tiers.entries()) {
    if (peers.size >= 3) break;
    // The subcategory tier may fill the pool; wider tiers only top it up, so a
    // handful of dupattas can never outvote the one kurta set that exists.
    const room = i === 0 ? PARAMS.maxPeers - peers.size : PARAMS.minPeersForPrior - peers.size;
    const candidates: Peer[] = [];
    for (const s of ref.stats.values()) {
      if (s.p.productId === subject.productId || peers.has(s.p.productId) || !tier.match(s)) continue;
      const rate = rateOf(s);
      if (rate === null) continue;
      const w = (tier.basis === 'STORE' ? 0.5 : priceWeight(s.p.sellingPrice)) * tier.scale;
      if (w > 0) candidates.push({ stats: s, basis: tier.basis, weight: w, rate });
    }
    candidates
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.max(0, room))
      .forEach((c) => peers.set(c.stats.p.productId, c));
  }

  return [...peers.values()].sort((a, b) => b.weight - a.weight).slice(0, PARAMS.maxPeers);
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function labelHigh(value: number): AiScore['label'] {
  return value >= 65 ? 'High' : value >= 35 ? 'Medium' : 'Low';
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const perWeek = (ratePerDay: number) => round(ratePerDay * 7, 1);

function tierOf(conf: number): ConfidenceTier {
  return conf >= 0.65 ? 'HIGH' : conf >= 0.4 ? 'MEDIUM' : 'LOW';
}

function lifecycleOf(p: ProductFeatures, s: ProductStats, asOf: Date): LifecycleStage {
  if (!p.firstStockedAt) return 'NEW';
  const ageDays = (asOf.getTime() - new Date(p.firstStockedAt).getTime()) / 86_400_000;
  if (ageDays < 30) return 'NEW';
  if (p.units30 + p.units31to90 === 0 && p.stockNow > 0 && ageDays >= 60) return 'DEAD';
  // Size-availability-weighted days, so a sell-out of the popular sizes is not
  // mistaken for demand slowing down.
  const recent = s.days30 >= 7 ? p.units30 / s.days30 : null;
  const older = s.days31to90 >= 14 ? p.units31to90 / s.days31to90 : null;
  if (recent !== null && older !== null && older > 0) {
    const trend = recent / older;
    if (trend >= 1.3 && ageDays < 180) return 'GROWING';
    if (trend <= 0.6) return 'DECLINING';
  }
  if (recent === 0 && s.currentRate !== null && s.currentRate < 0.02) return 'DECLINING';
  return 'MATURE';
}

// ─── Size mix ─────────────────────────────────────────────────────────────────

function sizeShares(
  sizes: string[],
  variants: VariantFeatures[],
  ref: StoreReference,
  subcategoryId: string | null
): Map<string, number> {
  const curve = (subcategoryId && ref.sizeCurveBySubcategory.get(subcategoryId)) || ref.sizeCurveStore;
  const priorRaw = sizes.map((s) => curve.get(s) ?? 0);
  const priorSum = priorRaw.reduce((a, b) => a + b, 0);
  const prior = priorSum > 0 ? priorRaw.map((v) => v / priorSum) : sizes.map(() => 1 / sizes.length);

  // Own evidence: units per in-stock day, scaled to 180 days so it is in units.
  const own = sizes.map((size) => {
    const v = variants.find((x) => x.size === size);
    if (!v || v.inStockDays180 < 7) return 0;
    return (v.units180 / v.inStockDays180) * 180;
  });
  const ownSum = own.reduce((a, b) => a + b, 0);
  const m = PARAMS.sizePriorUnits;
  return new Map(sizes.map((s, i) => [s, (own[i] + m * prior[i]) / (ownSum + m)]));
}

function allocateSizes(
  quantity: number,
  shares: Map<string, number>,
  onHand: Map<string, number>
): SizeRecommendation[] {
  const sizes = [...shares.keys()];
  const totalAfter = quantity + sizes.reduce((s, k) => s + (onHand.get(k) ?? 0), 0);
  const need: Record<string, number> = {};
  for (const s of sizes) need[s] = Math.max(0, shares.get(s)! * totalAfter - (onHand.get(s) ?? 0));
  const needSum = Object.values(need).reduce((a, b) => a + b, 0);
  const weights = needSum > 0 ? need : Object.fromEntries(sizes.map((s) => [s, shares.get(s)!]));
  const alloc = allocateLargestRemainder(weights, quantity);
  return sizes.map((s) => ({
    size: s,
    quantity: alloc[s] ?? 0,
    demandShare: round(shares.get(s)!, 3),
    onHand: onHand.get(s) ?? 0,
  }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function analyse(store: StoreFeatures, input: AnalysisInput): AiAnalysis {
  const ref = referenceFor(store);
  const asOf = new Date(store.asOf);
  const product = input.productId ? store.byId.get(input.productId) : undefined;
  if (input.productId && !product) throw new Error(`Product ${input.productId} has no data as of ${store.asOf}.`);
  const own = product ? ref.stats.get(product.productId)! : null;

  const categoryId = input.categoryId ?? product?.categoryId ?? null;
  const subcategoryId = input.subcategoryId ?? product?.subcategoryId ?? null;
  const sellingPrice = input.sellingPrice ?? product?.sellingPrice ?? 0;
  const costPrice = input.costPrice ?? product?.avgCostInStock ?? product?.costPrice ?? 0;
  const categoryName = product?.categoryName
    ?? store.products.find((p) => p.categoryId === categoryId)?.categoryName ?? null;
  const subcategoryName = product?.subcategoryName
    ?? store.products.find((p) => p.subcategoryId === subcategoryId)?.subcategoryName ?? null;

  const isNew = !own || own.daysEff < PARAMS.minPeerDays;
  const stockOnHand = product?.stockNow ?? 0;
  const planned = input.plannedQuantity ?? null;

  // ── Belief about the daily sales rate ──
  const peers = findPeers(store, ref, { productId: product?.productId, categoryId, subcategoryId, price: sellingPrice },
    isNew, input.photoPeers ?? []);
  const prior = fitGammaPrior(peers.map((p) => ({ rate: p.rate, weight: p.weight })),
    isNew ? ref.storeLaunchPrior : ref.storePrior, PARAMS.priorStrength);
  const belief = own ? updateGamma(prior, own.unitsEff, own.daysEff) : prior;
  const rate = gammaMean(belief);
  const seasonal = (categoryId && store.seasonal.byCategory.get(categoryId)) || store.seasonal.store;

  const d30 = predictiveDemand(belief, HORIZON_DAYS, seasonal, PARAMS.overdispersion);
  const d45 = predictiveDemand(belief, 45, seasonal, PARAMS.overdispersion);
  const d90 = predictiveDemand(belief, 90, 1, PARAMS.overdispersion);

  // ── Sizes: demand share and stock per size ──
  const sizes = product?.variants.length ? product.variants.map((v) => v.size) : (input.sizes?.length ? input.sizes : ['One Size']);
  const shares = sizeShares(sizes, product?.variants ?? [], ref, subcategoryId);
  const onHandBySize = new Map((product?.variants ?? []).map((v) => [v.size, v.stock]));

  /** Per-size stock after adding `extra` units split the way the model would buy them. */
  const stockWith = (extra: number, extraBySize?: Record<string, number>) => {
    const add = extraBySize ?? Object.fromEntries(allocateSizes(extra, shares, onHandBySize).map((x) => [x.size, x.quantity]));
    return sizes.map((sz) => ({ share: shares.get(sz)!, stock: (onHandBySize.get(sz) ?? 0) + (add[sz] ?? 0) }));
  };
  const totalOf = (list: Array<{ stock: number }>) => list.reduce((t, x) => t + x.stock, 0);

  // Days of cover, per size: each size lasts stock / (its share of demand);
  // averaged by demand share and capped, so 13 leftover size-S units do not
  // count as three weeks of cover when M, L and XL are sold out.
  const dailyDemand = d30.mean / HORIZON_DAYS;
  const naiveCover = dailyDemand > 0.05 / HORIZON_DAYS ? stockOnHand / dailyDemand : null;
  const coverDays = naiveCover === null || !product ? null : sizes.reduce((t, sz) => {
    const share = shares.get(sz)!;
    const perSize = share > 0 ? (onHandBySize.get(sz) ?? 0) / (share * dailyDemand) : 0;
    return t + share * Math.min(perSize, 120);
  }, 0);

  // ── Stock the forecast assumes: on hand + planned (or actually received) ──
  const extra = input.receivedDuringHorizon ?? planned
    ?? (stockOnHand > 0 ? 0 : Math.max(1, Math.round(d30.mean)));
  let heldBySize = stockWith(extra, input.receivedBySize ?? input.plannedSizeMix ?? undefined);
  if (totalOf(heldBySize) === 0) heldBySize = stockWith(1);
  const held = totalOf(heldBySize);

  // Stock clears when its slowest size does.
  const clearanceDays = rate > 0
    ? Math.min(365, Math.round(Math.max(...heldBySize.map((x) =>
      x.stock > 0 ? x.stock / Math.max(x.share * rate * seasonal, 1e-6) : 0))))
    : null;

  const sales30 = sizeCappedSales(d30.mean, d30.shape, heldBySize);
  const sales90 = sizeCappedSales(d90.mean, d90.shape, heldBySize);
  const expectedSales = sales30.expected;
  const sellThrough = expectedSales / held;
  const unsold90 = 1 - sales90.expected / held;
  // The decision is about the product, not the owner's number: judge it on
  // holding one more month of supply. The displayed scores use `held`, so an
  // oversized plan shows up as its own risk instead of flipping the decision.
  const monthSupply = stockWith(Math.max(1, Math.round(d30.mean)));
  const unsold90AtMonthSupply = 1 - sizeCappedSales(d90.mean, d90.shape, monthSupply).expected / totalOf(monthSupply);

  // ── Economics ──
  const realisation = own?.realisation ?? (() => {
    const r = peers.filter((p) => p.stats.realisation !== null);
    return r.length ? r.reduce((s, p) => s + p.stats.realisation! * p.weight, 0) / r.reduce((s, p) => s + p.weight, 0)
      : ref.realisationStore;
  })();
  const realisedPrice = sellingPrice * realisation;
  const unitMargin = realisedPrice - costPrice;
  const gmroi = costPrice > 0 ? (unitMargin * expectedSales) / (held * costPrice) : 0;

  const peerReturn = (() => {
    const r = peers.filter((p) => p.stats.returnRate !== null);
    return r.length ? r.reduce((s, p) => s + p.stats.returnRate! * p.weight, 0) / r.reduce((s, p) => s + p.weight, 0)
      : store.storeReturnRate;
  })();
  const k = PARAMS.returnPriorUnits;
  const returnRate = ((product?.returns ?? 0) + k * peerReturn) / ((product?.unitsLifetime ?? 0) + k);

  // ── Scores ──
  const demandPct = percentileRank(ref.demandRates, rate);
  const demandScore = Math.round(demandPct * 100);
  const sellingScore = Math.round(sellThrough * 100);
  const profitScore = Math.round(percentileRank(ref.gmroi, gmroi) * 100);
  const deadStockScore = Math.round(unsold90 * 100);
  const decisionDeadStock = Math.round(unsold90AtMonthSupply * 100);
  const returnScore = Math.round(clamp(returnRate / (2.5 * Math.max(store.storeReturnRate, 0.005)), 0, 1) * 100);

  // ── Confidence & data sufficiency ──
  const daysEff = own?.daysEff ?? 0;
  const photoCount = peers.filter((p) => p.basis === 'PHOTO').length;
  const peerQuality = peers.length
    ? peers.reduce((s, p) => s + (p.basis === 'PHOTO' ? 1 : p.basis === 'SUBCATEGORY_PRICE' ? 0.75 : 0.4), 0) / peers.length
    : 0;
  const evidence = daysEff / (daysEff + 45);
  const peerEvidence = Math.min(1, peers.length / 8) * peerQuality;
  const stability = 1 / (1 + 1 / Math.sqrt(Math.max(d30.shape, 1e-3)));
  const confidence = round(clamp(0.5 * evidence + 0.3 * peerEvidence + 0.2 * stability, 0.05, 0.95), 2);
  const tier = tierOf(confidence);
  const sufficiency: DataSufficiency =
    daysEff >= 45 && (product?.unitsLifetime ?? 0) >= 5 ? 'SUFFICIENT'
      : daysEff >= PARAMS.minPeerDays || peers.length >= 3 ? 'LIMITED' : 'INSUFFICIENT';

  // ── Decision & quantity ──
  let decision: AiDecision;
  if (coverDays !== null && coverDays >= 60) decision = 'HOLD';
  // Returns alone veto only a weak seller; for a strong one they cap the buy (below).
  else if ((returnScore >= 90 && demandScore < 50) || decisionDeadStock >= 70 || (demandScore < 15 && profitScore < 25)) decision = 'AVOID';
  else if (sufficiency === 'INSUFFICIENT') decision = 'TRIAL';
  else if (!isNew && demandScore >= 65 && decisionDeadStock < 35 && profitScore >= 40 && returnScore < 60 && tier !== 'LOW') decision = 'STRONG_BUY';
  else if (demandScore >= 30 && decisionDeadStock < 55) decision = isNew && sufficiency === 'LIMITED' && peers.length < 3 ? 'TRIAL' : 'CONTROLLED_BUY';
  else if (isNew) decision = 'TRIAL';
  else decision = 'HOLD';

  // Target stock from the total-demand distribution, then buy per size what
  // that size is short of — leftover XXXL never offsets a shortage of M.
  let target = 0;
  if (decision === 'STRONG_BUY') target = pmfQuantile(d45.pmf, 0.6);
  else if (decision === 'CONTROLLED_BUY') target = pmfQuantile(d30.pmf, 0.5);
  let quantity = 0;
  if (target > 0) {
    const need: Record<string, number> = {};
    for (const sz of sizes) need[sz] = Math.max(0, shares.get(sz)! * target - (onHandBySize.get(sz) ?? 0));
    quantity = Math.round(Object.values(need).reduce((a, b) => a + b, 0));
  } else if (decision === 'TRIAL') {
    quantity = clamp(Math.round(d30.mean * 0.5), sizes.length, 2 * sizes.length);
  }

  let holdBecauseCovered = false;
  if ((decision === 'STRONG_BUY' || decision === 'CONTROLLED_BUY') && quantity === 0) {
    decision = 'HOLD';
    holdBecauseCovered = true;
  }

  const sizeMix = allocateSizes(quantity, shares, onHandBySize);

  // ── Product-level metrics (§2.14) ──
  const lifecycle = product && own ? lifecycleOf(product, own, asOf) : 'NEW';
  let metrics: ProductMetrics | null = null;
  if (product && own) {
    const medPrice = subcategoryId ? ref.medianPriceBySubcategory.get(subcategoryId) : undefined;
    const rel = medPrice ? product.sellingPrice / medPrice : null;
    metrics = {
      units7: product.units7,
      units15: product.units15,
      units30: product.units30,
      timeToFirstSaleDays: product.firstStockedAt && product.firstSaleAt
        ? Math.max(0, Math.round((new Date(product.firstSaleAt).getTime() - new Date(product.firstStockedAt).getTime()) / 86_400_000))
        : null,
      sellThroughLifetime: product.unitsReceived > 0 ? round(product.unitsLifetime / product.unitsReceived, 3) : null,
      avgStockAgeDays: product.avgStockAgeDays !== null ? Math.round(product.avgStockAgeDays) : null,
      discountDependency: product.unitsLifetime > 0 ? round(product.discountedUnits / product.unitsLifetime, 3) : null,
      returnRate: product.unitsLifetime > 0 ? round(product.returns / product.unitsLifetime, 3) : null,
      realisedMarginPct: realisedPrice > 0 ? round(unitMargin / realisedPrice, 3) : null,
      priceBand: rel === null ? null : {
        band: rel < 0.85 ? 'Budget' : rel > 1.2 ? 'Premium' : 'Mid',
        relativeToSubcategory: round(rel, 2),
      },
      lifecycleStage: lifecycle,
      sizeDemand: product.variants.map((v) => ({
        size: v.size,
        unitsPerWeek: v.inStockDays180 >= 7 ? perWeek(v.units180 / v.inStockDays180) : 0,
        onHand: v.stock,
        soldLast180: v.units180,
      })),
    };
  }

  let productAction: ProductAction;
  const age = product?.avgStockAgeDays ?? 0;
  if (stockOnHand > 0 && (lifecycle === 'DEAD' || (deadStockScore >= 75 && age >= 120))) productAction = 'CLEARANCE';
  else if (stockOnHand > 0 && deadStockScore >= 50 && age >= 60) productAction = 'DISCOUNT';
  else productAction = ({
    STRONG_BUY: 'RESTOCK', CONTROLLED_BUY: 'CONTROLLED_BUY', TRIAL: 'TRIAL', HOLD: 'HOLD', AVOID: 'AVOID',
  } as const)[decision];

  // ── Reasons ──
  const reasons: AiReason[] = [];
  const buying = decision === 'STRONG_BUY' || decision === 'CONTROLLED_BUY';
  if (buying && (productAction === 'DISCOUNT' || productAction === 'CLEARANCE')) {
    const slow = sizes.filter((sz) => (onHandBySize.get(sz) ?? 0) > 0
      && (onHandBySize.get(sz) ?? 0) / Math.max(shares.get(sz)! * dailyDemand, 1e-6) > 90);
    productAction = 'DISCOUNT';
    reasons.push({
      text: `Buy the sizes that sell, and discount the slow ones${slow.length ? ` (${slow.join(', ')})` : ''} — that stock is unlikely to sell at full price.`,
      impact: 'neutral',
    });
  }
  const catalogueShare = Math.round(demandPct * 100);
  if (!isNew && own) {
    reasons.push({
      text: `Sells about ${perWeek(rate)} units/week while in stock — faster than ${catalogueShare}% of your catalogue.`,
      impact: demandScore >= 60 ? 'positive' : demandScore <= 30 ? 'negative' : 'neutral',
    });
    const availability = own.daysEff / (HORIZON_DAYS + PARAMS.olderWindowWeight * 60);
    if (availability < 0.8) {
      reasons.push({
        text: `Some sizes were sold out for part of the last 90 days (${pct(availability)} availability); the rate is adjusted for time on the shelf.`,
        impact: 'neutral',
      });
    }
  }
  if (peers.length) {
    const byBasis = (b: Comparable['basis']) => peers.filter((p) => p.basis === b).length;
    const parts = [
      photoCount ? `${photoCount} photo match${photoCount > 1 ? 'es' : ''}` : '',
      byBasis('SUBCATEGORY_PRICE') ? `${byBasis('SUBCATEGORY_PRICE')} ${subcategoryName ?? 'same-subcategory'} product${byBasis('SUBCATEGORY_PRICE') > 1 ? 's' : ''}` : '',
      byBasis('CATEGORY_PRICE') ? `${byBasis('CATEGORY_PRICE')} other ${categoryName ?? 'same-category'} product${byBasis('CATEGORY_PRICE') > 1 ? 's' : ''}` : '',
      byBasis('STORE') ? `${byBasis('STORE')} store-wide product${byBasis('STORE') > 1 ? 's' : ''}` : '',
    ].filter(Boolean);
    const basis = `${parts.join(', ')} at a similar price`;
    const peerRate = peers.reduce((s, p) => s + p.rate * p.weight, 0) / peers.reduce((s, p) => s + p.weight, 0);
    reasons.push({
      text: isNew
        ? `No sales history yet, so this is based on ${basis}, which sold about ${perWeek(peerRate)} units/week in their first 60 days.`
        : sufficiency !== 'SUFFICIENT'
          ? `Own history is short, so the estimate also leans on ${basis} (${perWeek(peerRate)} units/week).`
          : `Comparable products (${basis}) sell about ${perWeek(peerRate)} units/week.`,
      impact: 'neutral',
    });
  }
  if (Math.abs(seasonal - 1) >= 0.15) {
    reasons.push({
      text: `Seasonality: the next 30 days are usually ${round(seasonal, 2)}× the previous 90 for ${categoryName ?? 'this category'} (last year's pattern).`,
      impact: seasonal > 1 ? 'positive' : 'negative',
    });
  }
  if (lifecycle === 'GROWING') reasons.push({ text: 'Sales are accelerating: the last 30 days beat the previous 60 by 30% or more.', impact: 'positive' });
  if (lifecycle === 'DECLINING') reasons.push({ text: 'Sales are slowing: the last 30 days are well below the previous 60.', impact: 'negative' });
  if (lifecycle === 'DEAD') reasons.push({ text: 'No sales in the last 90 days despite stock on the shelf.', impact: 'negative' });
  if (stockOnHand > 0 && coverDays !== null) {
    const skewed = naiveCover !== null && coverDays < 0.6 * naiveCover;
    reasons.push({
      text: skewed
        ? `${stockOnHand} in stock, but mostly in sizes that sell slowly — about ${Math.round(coverDays)} days of cover for the sizes customers want.`
        : `${stockOnHand} in stock — about ${Math.round(coverDays)} days of cover at the expected rate.`,
      impact: coverDays >= 60 ? 'negative' : coverDays <= 14 ? 'positive' : 'neutral',
    });
  } else if (stockOnHand === 0 && product) {
    reasons.push({ text: 'Currently out of stock — every sale from here needs new stock.', impact: 'neutral' });
  }
  if (holdBecauseCovered) reasons.push({ text: 'Current stock already covers expected demand, so no purchase is needed now.', impact: 'neutral' });
  if (planned !== null && planned !== quantity && Math.abs(planned - quantity) >= Math.max(2, 0.25 * Math.max(quantity, 1))) {
    const clear = input.plannedQuantity !== undefined && input.receivedDuringHorizon === undefined ? clearanceDays : null;
    reasons.push({
      text: `You planned ${planned}; ${quantity} is recommended.` +
        (clear !== null ? ` With ${planned}, stock would take about ${clear} days to clear.` : ''),
      impact: planned > quantity ? 'negative' : 'neutral',
    });
  }
  if (realisedPrice > 0 && costPrice > 0) {
    const discountText = realisation < 0.97 ? ` after an average ${pct(1 - realisation)} discount` : '';
    reasons.push({
      text: `Realised margin ${pct(unitMargin / realisedPrice)} per unit${discountText}.`,
      impact: profitScore >= 60 ? 'positive' : profitScore <= 30 ? 'negative' : 'neutral',
    });
  }
  if (metrics?.discountDependency !== null && metrics?.discountDependency !== undefined && metrics.discountDependency >= 0.4) {
    reasons.push({ text: `${pct(metrics.discountDependency)} of units sold only on discount.`, impact: 'negative' });
  }
  if (returnScore >= 50) {
    const capped = decision === 'CONTROLLED_BUY' && demandScore >= 65;
    reasons.push({
      text: `Return risk ${pct(returnRate)} vs store average ${pct(store.storeReturnRate)}` +
        (capped ? ' — so a controlled quantity, not a full order, even though it sells well.' : '.'),
      impact: 'negative',
    });
  }
  if (deadStockScore >= 40) {
    reasons.push({ text: `About ${deadStockScore}% of the ${held} units held would still be unsold after 90 days.`, impact: 'negative' });
  } else if (sellingScore >= 60) {
    reasons.push({ text: `About ${sellingScore}% of the ${held} units held should sell within 30 days.`, impact: 'positive' });
  }
  if (sizes.length > 1 && quantity > 0) {
    const top = [...sizeMix].sort((a, b) => b.demandShare - a.demandShare)[0];
    const stockShare = stockOnHand > 0 ? top.onHand / stockOnHand : 0;
    reasons.push({
      text: `Size ${top.size} is about ${pct(top.demandShare)} of demand` +
        (stockOnHand > 0 ? ` but ${pct(stockShare)} of current stock.` : '.'),
      impact: 'neutral',
    });
  }

  // ── Output ──
  const score = (value: number, detail: string): AiScore => ({ value, detail, label: labelHigh(value) });

  const confidenceExplanation = [
    own && daysEff > 0 ? `${Math.round(daysEff)} effective in-stock days of own history` : 'no own sales history',
    peers.length ? `${peers.length} comparable products${photoCount ? ` (${photoCount} by photo)` : ''}` : 'no comparable products',
  ].join('; ');

  return {
    modelVersion: MODEL_VERSION,
    asOf: store.asOf,
    subject: {
      productId: product?.productId ?? null,
      name: product?.name ?? input.name ?? 'New product',
      categoryName,
      subcategoryName,
      sellingPrice,
      costPrice: round(costPrice),
      stockOnHand,
      plannedQuantity: planned,
    },
    scores: {
      selling: score(sellingScore, `${sellingScore}% of the ${held} units held expected to sell in 30 days`),
      demand: score(demandScore, `Faster than ${catalogueShare}% of the catalogue`),
      profitability: score(profitScore, `30-day gross-margin return beats ${profitScore}% of products`),
      deadStockRisk: score(deadStockScore, `${deadStockScore}% of units held likely unsold after 90 days`),
      returnRisk: score(returnScore, `Estimated return rate ${pct(returnRate)} (store ${pct(store.storeReturnRate)})`),
    },
    forecast: {
      horizonDays: HORIZON_DAYS,
      demandMean: round(d30.mean, 1),
      demandQ10: pmfQuantile(d30.pmf, 0.1),
      demandQ90: pmfQuantile(d30.pmf, 0.9),
      expectedSales: round(expectedSales, 1),
      expectedSalesQ10: pmfQuantile(sales30.pmf, 0.1),
      expectedSalesQ90: pmfQuantile(sales30.pmf, 0.9),
      firstSaleProbability: round(1 - sales30.pNoSale, 3),
      expectedSellThrough: round(sellThrough, 3),
      clearanceDays,
      unitsPerWeek: perWeek(rate),
      seasonalFactor: round(seasonal, 2),
      stockAssumed: held,
    },
    metrics,
    recommendation: {
      decision,
      quantity,
      sizeMix,
      coverDays: coverDays !== null ? Math.round(coverDays) : null,
      productAction,
    },
    confidence: { value: confidence, tier, dataSufficiency: sufficiency, explanation: confidenceExplanation },
    reasons,
    comparables: peers.slice(0, 6).map((p) => ({
      productId: p.stats.p.productId,
      name: p.stats.p.name,
      basis: p.basis,
      weight: round(p.basis === 'PHOTO' ? p.weight / 2 : p.weight, 3),
      sellingPrice: p.stats.p.sellingPrice,
      unitsPerWeek: perWeek(p.rate),
    })),
    baselineUnits: product ? Math.min(product.units30, held) : null,
  };
}

/** Scores every product that has been on sale; used by the store overview and the backtest. */
export function analyseAll(
  store: StoreFeatures,
  options: {
    onlyWithHistory?: boolean;
    received?: Map<string, number>;
    receivedBySize?: Map<string, Record<string, number>>;
  } = {}
): AiAnalysis[] {
  const ref = referenceFor(store);
  const out: AiAnalysis[] = [];
  for (const p of store.products) {
    const s = ref.stats.get(p.productId)!;
    if (options.onlyWithHistory && s.daysEff <= 0 && p.stockNow === 0) continue;
    out.push(analyse(store, {
      productId: p.productId,
      receivedDuringHorizon: options.received ? options.received.get(p.productId) ?? 0 : undefined,
      receivedBySize: options.receivedBySize?.get(p.productId),
    }));
  }
  return out;
}
