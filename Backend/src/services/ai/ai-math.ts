/**
 * ai-math — the small amount of statistics the Week 7 scoring needs.
 * Pure functions, no I/O, unit-tested in tests/ai-math.test.ts.
 *
 * Demand model: a product's daily sales rate is unknown, so it is given a
 * Gamma(shape, rate) belief — a prior borrowed from comparable products,
 * updated with the product's own sales and in-stock days (Gamma–Poisson
 * conjugacy: shape += units, rate += days). Units over a horizon then follow
 * a Negative Binomial. That one distribution gives the forecast, its interval,
 * the first-sale probability and the dead-stock risk consistently.
 */

export interface GammaBelief {
  /** Shape α — "effective units observed". */
  shape: number;
  /** Rate β — "effective in-stock days observed". */
  rate: number;
}

/** Posterior mean daily sales rate. */
export function gammaMean(g: GammaBelief): number {
  return g.shape / g.rate;
}

/** Gamma–Poisson update with observed units over in-stock days. */
export function updateGamma(prior: GammaBelief, units: number, days: number): GammaBelief {
  return { shape: prior.shape + units, rate: prior.rate + days };
}

/**
 * Method-of-moments Gamma fitted to a sample of daily rates (weighted), with
 * the strength clamped so a handful of peers can never outweigh a product's
 * own history, and a tight peer group can never become near-certain.
 */
export function fitGammaPrior(
  rates: Array<{ rate: number; weight: number }>,
  fallback: GammaBelief,
  bounds = { minRate: 7, maxRate: 60 }
): GammaBelief {
  const totalW = rates.reduce((s, r) => s + r.weight, 0);
  if (rates.length < 3 || totalW <= 0) return fallback;

  const mean = rates.reduce((s, r) => s + r.rate * r.weight, 0) / totalW;
  if (mean <= 0) {
    // Every peer sold nothing: a weak belief in a very low rate.
    return { shape: 0.5, rate: Math.max(bounds.minRate, 0.5 / 0.005) };
  }
  const variance = rates.reduce((s, r) => s + r.weight * (r.rate - mean) ** 2, 0) / totalW;
  // Rate β = mean / variance, clamped; shape follows so the mean is preserved.
  const beta = variance > 0 ? mean / variance : bounds.maxRate;
  const rate = clamp(beta, bounds.minRate, bounds.maxRate);
  return { shape: mean * rate, rate };
}

/**
 * Negative Binomial with the given mean and shape r (variance = μ + μ²/r).
 * Returns the pmf up to the point where the tail is negligible.
 */
export function negBinPmf(mean: number, shape: number, maxK?: number): number[] {
  if (mean <= 1e-9) return [1];
  const r = Math.max(shape, 1e-3);
  const p = r / (r + mean); // success prob in the (r, p) parametrisation
  const limit = maxK ?? Math.ceil(mean + 12 * Math.sqrt(mean + (mean * mean) / r) + 30);
  const pmf: number[] = [];
  // log P(0) = r log p, computed in logs to survive tiny p.
  let current = Math.exp(r * Math.log(p));
  let cdf = 0;
  for (let k = 0; k <= limit; k++) {
    pmf.push(current);
    cdf += current;
    if (cdf > 1 - 1e-9 && k > mean) break;
    current = current * ((k + r) / (k + 1)) * (1 - p);
  }
  return pmf;
}

/** Smallest k with CDF(k) ≥ q. */
export function pmfQuantile(pmf: number[], q: number): number {
  let cdf = 0;
  for (let k = 0; k < pmf.length; k++) {
    cdf += pmf[k];
    if (cdf >= q) return k;
  }
  return pmf.length - 1;
}

/** E[min(D, S)] — expected units actually sold when only S are available. */
export function expectedSalesCapped(pmf: number[], stock: number): number {
  if (stock <= 0) return 0;
  // E[min(D,S)] = Σ_{k=0}^{S-1} P(D > k)
  let cdf = 0;
  let total = 0;
  for (let k = 0; k < stock; k++) {
    cdf += pmf[k] ?? 0;
    total += Math.max(0, 1 - cdf);
  }
  return total;
}

/**
 * Predictive demand over `days`, combining parameter uncertainty (the Gamma
 * belief) with the product-level overdispersion real demand shows on top of
 * it (week-to-week drift, a common store-wide shock). `overdispersion` is the
 * NB shape of that extra noise; the two combine as 1/r = 1/α + 1/φ.
 */
export function predictiveDemand(
  belief: GammaBelief,
  days: number,
  seasonal: number,
  overdispersion: number
): { mean: number; shape: number; pmf: number[] } {
  const mean = gammaMean(belief) * days * seasonal;
  const shape = 1 / (1 / Math.max(belief.shape, 1e-3) + 1 / overdispersion);
  return { mean, shape, pmf: negBinPmf(mean, shape) };
}

/**
 * Sales when demand is split across sizes and each size is capped by its own
 * stock — 10 units of XXXL cannot serve demand for M.
 *
 * Every size shares the product's uncertain rate, so size s's demand is NB
 * with the product's shape and mean share_s × total. Expected sales is exact
 * (it only needs the marginals). The distribution of total sales convolves
 * the per-size capped distributions, which ignores the shared rate and so is
 * a little too narrow — the backtest calibrates overdispersion around that.
 * P(no sale) is exact: no demand at all for the sizes that are in stock.
 */
export function sizeCappedSales(
  totalMean: number,
  shape: number,
  sizes: Array<{ share: number; stock: number }>
): { expected: number; pmf: number[]; pNoSale: number } {
  let expected = 0;
  let pmf: number[] = [1];
  let availableShare = 0;

  for (const s of sizes) {
    if (s.stock <= 0 || s.share <= 0) continue;
    availableShare += s.share;
    const d = negBinPmf(totalMean * s.share, shape);
    expected += expectedSalesCapped(d, s.stock);

    // Capped pmf: mass at or beyond `stock` collapses onto `stock`.
    const len = Math.min(s.stock, d.length - 1);
    const capped = d.slice(0, len + 1);
    if (len === s.stock) capped[len] = Math.max(0, 1 - d.slice(0, len).reduce((a, b) => a + b, 0));
    pmf = convolve(pmf, capped);
  }

  const availMean = totalMean * availableShare;
  const r = Math.max(shape, 1e-3);
  const pNoSale = availMean <= 1e-9 ? 1 : Math.exp(r * Math.log(r / (r + availMean)));
  return { expected, pmf, pNoSale };
}

function convolve(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  }
  return out;
}

/** Share of `values` strictly below `x`, plus half the ties — in [0, 1]. */
export function percentileRank(sortedValues: number[], x: number): number {
  const n = sortedValues.length;
  if (n === 0) return 0.5;
  let below = 0;
  let equal = 0;
  for (const v of sortedValues) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return (below + equal / 2) / n;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function round(x: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

/**
 * Splits `total` integer units across keys in proportion to `weights`
 * (largest-remainder method), never allocating to a zero-weight key.
 */
export function allocateLargestRemainder(
  weights: Record<string, number>,
  total: number
): Record<string, number> {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0);
  const out: Record<string, number> = Object.fromEntries(Object.keys(weights).map((k) => [k, 0]));
  const sum = keys.reduce((s, k) => s + weights[k], 0);
  if (total <= 0 || sum <= 0) return out;

  const raw = keys.map((k) => ({ k, exact: (weights[k] / sum) * total }));
  let assigned = 0;
  for (const r of raw) {
    out[r.k] = Math.floor(r.exact);
    assigned += out[r.k];
  }
  raw
    .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)))
    .slice(0, total - assigned)
    .forEach((r) => { out[r.k] += 1; });
  return out;
}
