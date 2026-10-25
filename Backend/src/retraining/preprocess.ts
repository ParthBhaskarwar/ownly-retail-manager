/**
 * Preprocessing — turns whatever the owner typed into a clean, internally
 * consistent history, so they never have to fix their spreadsheet by hand.
 *
 * What it does, in order:
 *   1. Normalises text: trims, upper-cases product codes, standardises sizes
 *      ("m", "Free Size", "FREESIZE" → "M", "One Size").
 *   2. Parses dates: real Excel dates, Excel serial numbers, ISO text and
 *      day-first text (31/03/2026). Future dates are dropped.
 *   3. Matches categories to the app's category list (case/plural tolerant).
 *   4. Drops rows that cannot be used (unknown product, bad quantity or
 *      price) and reports each one with its Excel row number.
 *   5. Fills small gaps with stated assumptions (missing cost → 60% of price;
 *      missing sale price → the product's selling price).
 *   6. Reconciles stock. Walks every product-size's purchases, sales and
 *      returns in date order, oldest stock first. A sale with no stock behind
 *      it gets an assumed purchase the day before ("inferred") — counted, and
 *      if there are too many the data is rejected as incomplete.
 *   7. Matches each return to the sale it reverses and puts the unit back on
 *      the shelf, as the app does.
 *
 * Pure: no database, no clock except the `now` argument — so it is unit-tested
 * on small hand-made workbooks.
 */

import type {
  Cell, CategoryCatalog, CleanDataset, CleanProduct, CleanSale, CleanUnit,
  Issue, IssueLevel, QualityReport, RawWorkbook,
} from './types';

export const LIMITS = {
  /** More than this share of sold units with no purchase behind them → reject. */
  maxInferredShare: 0.25,
  /** More than this share of Sales rows unusable → reject. */
  maxBadSalesShare: 0.1,
  /** Minimum span of history that makes a backtest meaningful. */
  minHistoryDays: 270,
  /** Cost assumed when a product has none, as a share of its selling price. */
  defaultCostShare: 0.6,
  /** Issues listed per kind before the rest are only counted. */
  issueListCap: 8,
};

const DAY = 86_400_000;

// ─── Cell parsing ─────────────────────────────────────────────────────────────

export function toText(v: Cell): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function toNumber(v: Cell): number | null {
  if (v === null || v === undefined || typeof v === 'boolean' || v instanceof Date) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // "₹1,299.00", "1 299", " 450 "
  const cleaned = String(v).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function validYmd(y: number, m: number, d: number): Date | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/** → a Date at 12:00 UTC on that calendar day, or null. */
export function toDate(v: Cell): Date | null {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : validYmd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'number') {
    if (v < 20_000 || v > 80_000) return null; // Excel serial dates ≈ 1954–2119
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * DAY);
    return validYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s); // day-first, as written in India
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validYmd(y, Number(m[2]), Number(m[1]));
  }
  return null;
}

export function normSize(v: Cell): string {
  const s = toText(v);
  if (!s) return 'One Size';
  const key = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['onesize', 'freesize', 'free', 'os', 'na', 'nosize', 'standard'].includes(key)) return 'One Size';
  return /^[a-z]+$/i.test(s) ? s.toUpperCase() : s.trim();
}

const catKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
const ymd = (d: Date): string => d.toISOString().slice(0, 10);

// ─── Issue collection (capped so one bad column doesn't print 5,000 lines) ────

class Issues {
  readonly list: Issue[] = [];
  private counts = new Map<string, number>();

  add(kind: string, level: IssueLevel, sheet: Issue['sheet'], message: string, row?: number): void {
    const n = (this.counts.get(`${sheet}|${kind}`) ?? 0) + 1;
    this.counts.set(`${sheet}|${kind}`, n);
    if (n <= LIMITS.issueListCap) this.list.push({ level, sheet, row, message });
  }

  /** Appends "… and N more" lines for kinds that overflowed. */
  finish(): Issue[] {
    for (const [k, n] of this.counts) {
      if (n > LIMITS.issueListCap) {
        const [sheet] = k.split('|');
        this.list.push({ level: 'info', sheet: sheet as Issue['sheet'], message: `…and ${n - LIMITS.issueListCap} more of the same kind (${k.split('|')[1]}).` });
      }
    }
    return this.list;
  }

  count(sheet: string, kind: string): number {
    return this.counts.get(`${sheet}|${kind}`) ?? 0;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Ev {
  kind: 0 | 1 | 2; // purchase, sale, return — the order they are applied within a day
  at: Date;
  code: string;
  size: string;
  qty: number;
  row: number;
  cost?: number;
  price?: number;
  discount?: number;
  invoiceNo?: string | null;
  reason?: string | null;
}

export function preprocess(
  raw: RawWorkbook,
  catalog: CategoryCatalog,
  now: Date = new Date()
): { dataset: CleanDataset; quality: QualityReport } {
  const issues = new Issues();
  const blockers: string[] = [];

  // 1. Products
  const catByKey = new Map(catalog.categories.map((c) => [catKey(c.name), c]));
  const products = new Map<string, CleanProduct>();
  const unknownCategories = new Map<string, number>();
  let costAssumed = 0;

  for (const r of raw.products) {
    const code = toText(r.code)?.toUpperCase();
    if (!code) { issues.add('nocode', 'error', 'Products', 'Product has no product_code — row skipped.', r.row); continue; }
    if (products.has(code)) { issues.add('dupcode', 'warning', 'Products', `Duplicate product_code ${code} — the first row is used.`, r.row); continue; }

    const price = toNumber(r.sellingPrice);
    if (price === null || price <= 0) { issues.add('badprice', 'error', 'Products', `${code}: selling_price must be a positive number — row skipped.`, r.row); continue; }

    const catName = toText(r.category);
    const cat = catName ? catByKey.get(catKey(catName)) : undefined;
    if (!cat) {
      unknownCategories.set(catName ?? '(blank)', (unknownCategories.get(catName ?? '(blank)') ?? 0) + 1);
      issues.add('badcat', 'error', 'Products', `${code}: category "${catName ?? ''}" is not one of the app's categories — row skipped.`, r.row);
      continue;
    }

    const subName = toText(r.subcategory);
    const sub = subName
      ? catalog.subcategories.find((s) => s.categoryId === cat.id && catKey(s.name) === catKey(subName))
      : undefined;
    if (subName && !sub) issues.add('badsub', 'warning', 'Products', `${code}: subcategory "${subName}" not found under ${cat.name} — left blank (peers will be matched by category).`, r.row);

    let cost = toNumber(r.costPrice);
    if (cost === null || cost <= 0) { cost = Math.round(price * LIMITS.defaultCostShare * 100) / 100; costAssumed++; }

    products.set(code, {
      code, name: toText(r.name) ?? code,
      categoryId: cat.id, categoryName: cat.name, subcategoryId: sub?.id ?? null,
      supplier: toText(r.supplier), sellingPrice: price, costPrice: cost, sizes: [],
    });
  }
  if (costAssumed) issues.add('costassumed', 'info', 'Products', `${costAssumed} product(s) had no cost_price; assumed ${LIMITS.defaultCostShare * 100}% of selling price (affects profit scores only, not demand forecasts).`);
  if (unknownCategories.size) {
    issues.add('validcats', 'info', 'Products', `Valid categories: ${catalog.categories.map((c) => c.name).join(', ')}.`);
  }

  // 2. Events
  const evs: Ev[] = [];
  const unknownCodes = new Set<string>();
  const future = { n: 0 };

  const baseEvent = (sheet: Issue['sheet'], row: number, dateCell: Cell, codeCell: Cell, sizeCell: Cell, qtyCell: Cell) => {
    const code = toText(codeCell)?.toUpperCase();
    if (!code || !products.has(code)) {
      if (code) unknownCodes.add(code);
      issues.add('unknownproduct', 'error', sheet, `${code ?? '(blank)'} is not in the Products sheet (or its product row was rejected) — row skipped.`, row);
      return null;
    }
    const at = toDate(dateCell);
    if (!at) { issues.add('baddate', 'error', sheet, `${code}: "${toText(dateCell) ?? ''}" is not a valid date — row skipped.`, row); return null; }
    if (at.getTime() > now.getTime()) { future.n++; issues.add('future', 'warning', sheet, `${code}: date ${ymd(at)} is in the future — row skipped.`, row); return null; }
    const q = toNumber(qtyCell);
    if (q === null || q <= 0) { issues.add('badqty', 'error', sheet, `${code}: quantity must be a positive number — row skipped.`, row); return null; }
    if (!Number.isInteger(q)) issues.add('fracqty', 'warning', sheet, `${code}: quantity ${q} is not a whole number — rounded.`, row);
    return { code, at, size: normSize(sizeCell), qty: Math.max(1, Math.round(q)) };
  };

  let purchasesUsed = 0, salesUsed = 0, returnsUsed = 0;
  let pricesAssumed = 0;

  for (const r of raw.purchases) {
    const b = baseEvent('Purchases', r.row, r.date, r.code, r.size, r.quantity);
    if (!b) continue;
    const cost = toNumber(r.unitCost);
    evs.push({ ...b, kind: 0, row: r.row, cost: cost !== null && cost > 0 ? cost : products.get(b.code)!.costPrice });
    purchasesUsed++;
  }
  for (const r of raw.sales) {
    const b = baseEvent('Sales', r.row, r.date, r.code, r.size, r.quantity);
    if (!b) continue;
    const p = products.get(b.code)!;
    let price = toNumber(r.unitPrice);
    if (price === null || price <= 0) { price = p.sellingPrice; pricesAssumed++; }
    const discount = Math.min(Math.max(toNumber(r.discount) ?? 0, 0), price * b.qty);
    evs.push({ ...b, kind: 1, row: r.row, price, discount, invoiceNo: toText(r.invoiceNo) });
    salesUsed++;
  }
  if (pricesAssumed) issues.add('priceassumed', 'info', 'Sales', `${pricesAssumed} sale row(s) had no unit_price; the product's selling_price was used.`);
  for (const r of raw.returns) {
    const b = baseEvent('Returns', r.row, r.date, r.code, r.size, r.quantity);
    if (!b) continue;
    evs.push({ ...b, kind: 2, row: r.row, invoiceNo: toText(r.invoiceNo), reason: toText(r.reason) });
    returnsUsed++;
  }

  // 3. Reconcile stock per product-size
  const byKey = new Map<string, Ev[]>();
  for (const e of evs) {
    const k = `${e.code}|${e.size}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(e);
  }

  const units: CleanUnit[] = [];
  let unitsInferred = 0, unitsSold = 0, unitsPurchased = 0;
  let droppedReturns = 0;

  for (const [, list] of byKey) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime() || a.kind - b.kind || a.row - b.row);
    const queue: CleanUnit[] = []; // on the shelf, oldest first
    const sold = new Map<string, Array<{ unit: CleanUnit; sale: CleanSale }>>();
    const anySold: Array<{ unit: CleanUnit; sale: CleanSale }> = [];

    for (const e of list) {
      if (e.kind === 0) {
        for (let i = 0; i < e.qty; i++) {
          const u: CleanUnit = { productCode: e.code, size: e.size, receivedAt: e.at, cost: e.cost!, inferred: false, sales: [] };
          units.push(u); queue.push(u); unitsPurchased++;
        }
      } else if (e.kind === 1) {
        for (let i = 0; i < e.qty; i++) {
          let u = queue.shift();
          if (!u) {
            u = { productCode: e.code, size: e.size, receivedAt: new Date(e.at.getTime() - DAY), cost: products.get(e.code)!.costPrice, inferred: true, sales: [] };
            units.push(u); unitsInferred++;
          }
          const invoiceNo = e.invoiceNo ?? `AUTO-${e.row}`;
          const sale: CleanSale = {
            at: e.at, invoiceKey: `${invoiceNo}|${ymd(e.at)}`,
            unitPrice: e.price!, discount: Math.round((e.discount! / e.qty) * 100) / 100,
            returnedAt: null, returnReason: null,
          };
          u.sales.push(sale);
          const rec = { unit: u, sale };
          if (!sold.has(invoiceNo)) sold.set(invoiceNo, []);
          sold.get(invoiceNo)!.push(rec); anySold.push(rec);
          unitsSold++;
        }
      } else {
        let remaining = e.qty;
        const candidates = (e.invoiceNo ? sold.get(e.invoiceNo) : undefined) ?? [];
        const pools = [candidates, anySold]; // the named invoice first, then any earlier sale of this item
        for (const pool of pools) {
          for (let i = pool.length - 1; i >= 0 && remaining > 0; i--) {
            const { unit, sale } = pool[i];
            if (sale.returnedAt === null && sale.at.getTime() <= e.at.getTime()) {
              sale.returnedAt = e.at; sale.returnReason = e.reason ?? null;
              queue.push(unit); remaining--;
            }
          }
        }
        if (remaining > 0) {
          droppedReturns += remaining;
          issues.add('orphanreturn', 'warning', 'Returns', `${e.code} ${e.size}: ${remaining} returned unit(s) have no earlier sale to reverse — ignored.`, e.row);
        }
      }
    }
  }

  // 4. Quality summary and blockers
  const dates = evs.map((e) => e.at.getTime());
  const first = dates.length ? Math.min(...dates) : null;
  const last = dates.length ? Math.max(...dates) : null;
  const historyDays = first !== null && last !== null ? Math.round((last - first) / DAY) : 0;
  const inferredShare = unitsSold > 0 ? unitsInferred / unitsSold : 0;

  if (raw.products.length === 0) blockers.push('The Products sheet has no rows.');
  else if (products.size === 0) blockers.push('Every product row was rejected — see the issues list.');
  if (raw.sales.length === 0) blockers.push('The Sales sheet has no rows.');
  else if (salesUsed === 0) blockers.push('Every sales row was rejected — see the issues list.');
  if (raw.sales.length > 0 && 1 - salesUsed / raw.sales.length > LIMITS.maxBadSalesShare) {
    blockers.push(`${Math.round((1 - salesUsed / raw.sales.length) * 100)}% of Sales rows could not be used (limit ${LIMITS.maxBadSalesShare * 100}%). Fix the rows listed below.`);
  }
  if (inferredShare > LIMITS.maxInferredShare) {
    blockers.push(`${Math.round(inferredShare * 100)}% of sold units have no recorded purchase (limit ${LIMITS.maxInferredShare * 100}%). The Purchases sheet looks incomplete — add stock received, including opening stock.`);
  } else if (unitsInferred > 0) {
    issues.add('inferred', 'warning', 'Workbook', `${unitsInferred} sold unit(s) had no purchase recorded; the cleaner assumed stock arrived the day before (${Math.round(inferredShare * 100)}% of units sold).`);
  }
  if (salesUsed > 0 && historyDays < LIMITS.minHistoryDays) {
    blockers.push(`Only ${historyDays} days of history (${first !== null ? ymd(new Date(first)) : '?'} to ${last !== null ? ymd(new Date(last)) : '?'}); at least ${LIMITS.minHistoryDays} are needed to test a retrained model fairly.`);
  }
  if (droppedReturns) issues.add('returnsummary', 'info', 'Returns', `${droppedReturns} returned unit(s) could not be matched to a sale.`);

  // Sizes per product, in a stable order
  const sizesByCode = new Map<string, Set<string>>();
  for (const u of units) {
    if (!sizesByCode.has(u.productCode)) sizesByCode.set(u.productCode, new Set());
    sizesByCode.get(u.productCode)!.add(u.size);
  }
  // Products that were never stocked or sold carry no signal and would only add empty rows.
  const active = [...products.values()].filter((p) => sizesByCode.has(p.code));
  for (const p of active) p.sizes = sortSizes([...sizesByCode.get(p.code)!]);
  const dropped = products.size - active.length;
  if (dropped) issues.add('idle', 'info', 'Products', `${dropped} product(s) have no purchases or sales and were left out.`);

  return {
    dataset: { products: active, units: units.filter((u) => sizesByCode.has(u.productCode)) },
    quality: {
      rowsRead: { products: raw.products.length, purchases: raw.purchases.length, sales: raw.sales.length, returns: raw.returns.length },
      rowsUsed: { products: products.size, purchases: purchasesUsed, sales: salesUsed, returns: returnsUsed - droppedReturns },
      unitsPurchased, unitsSold, unitsInferred, inferredShare,
      firstDate: first !== null ? ymd(new Date(first)) : null,
      lastDate: last !== null ? ymd(new Date(last)) : null,
      historyDays,
      issues: issues.finish(),
      blockers,
    },
  };
}

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL'];
export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}
