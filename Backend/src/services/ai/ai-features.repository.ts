/**
 * AiFeaturesRepository — reconstructs every product's state "as of" a moment T.
 *
 * All AI scoring reads from here and nowhere else, which is what makes the
 * backtest honest: the same code runs for "now" and for a date two years ago,
 * and it only ever sees rows dated before T.
 *
 * Leakage rules (see datagen/README.md "Leakage traps"):
 *  - inventory_items.status is NEVER read — it is today's state, and for a
 *    historical T it literally contains the answer. Stock at T is rebuilt from
 *    inventory_movements with performed_at < T.
 *  - invoice_items.status is never read either (a later return flips it);
 *    returns are counted from the returns table by their own date.
 *
 * In-stock days: a product can only sell while it is on the shelf, so rates
 * are units per *in-stock day*, not per calendar day. Otherwise a best-seller
 * that was sold out for three weeks looks like a slow mover.
 *
 * Everything is computed for the whole store in a handful of set-based
 * queries — the scoring needs peers and percentiles anyway.
 */

import { db } from '@/db/client';

export interface VariantFeatures {
  variantId: string;
  size: string;
  stock: number;
  units30: number;
  units31to90: number;
  units180: number;
  unitsLifetime: number;
  inStockDays30: number;
  inStockDays31to90: number;
  inStockDays180: number;
}

export interface ProductFeatures {
  productId: string;
  name: string;
  baseSku: string;
  categoryId: string | null;
  categoryName: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  supplierId: string | null;
  sellingPrice: number;
  costPrice: number;
  status: string;
  hasPhoto: boolean;

  firstStockedAt: string | null;
  unitsReceived: number;
  stockNow: number;
  avgStockAgeDays: number | null;
  avgCostInStock: number | null;

  inStockDays30: number;
  inStockDays31to90: number;
  inStockDays180: number;
  /** In-stock days in the first 60 days after first stocking. */
  launchInStockDays: number;
  launchUnits: number;
  /** True once 60 days have passed since first stocking (launch stats are final). */
  launchComplete: boolean;

  units7: number;
  units15: number;
  units30: number;
  units31to90: number;
  units180: number;
  unitsLifetime: number;
  firstSaleAt: string | null;
  grossRevenue: number;
  realisedRevenue: number;
  discountedUnits: number;
  avgUnitCostSold: number | null;
  returns: number;

  variants: VariantFeatures[];
}

export interface StoreFeatures {
  storeId: string;
  asOf: string;
  products: ProductFeatures[];
  byId: Map<string, ProductFeatures>;
  /** Next-30-days vs previous-90-days demand ratio, from the same weeks last year. */
  seasonal: { store: number; byCategory: Map<string, number>; hasHistory: boolean };
  storeReturnRate: number;
}

const INBOUND = `('PURCHASE','RESTOCK','TRANSFER_IN')`;
const IN_STOCK = `('IN_STOCK','RETURNED_TO_STOCK')`;

/** Days of overlap between [a, b) and [lo, hi). */
const OVERLAP = (a: string, b: string, lo: string, hi: string) =>
  `GREATEST(0, EXTRACT(EPOCH FROM (LEAST(${b}, ${hi}) - GREATEST(${a}, ${lo}))) / 86400.0)`;

/** +1 when an item enters sellable stock, −1 when it leaves. */
const STOCK_DELTA = `
  CASE WHEN m.movement_type IN ${INBOUND} THEN 1
       ELSE (CASE WHEN m.to_status IN ${IN_STOCK} THEN 1 ELSE 0 END)
          - (CASE WHEN m.from_status IN ${IN_STOCK} THEN 1 ELSE 0 END)
  END`;

type RawRow = Record<string, unknown>;

async function rows(sql: string, bindings: unknown[]): Promise<RawRow[]> {
  const result = await db.raw(sql, bindings as never);
  return (result as { rows: RawRow[] }).rows;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

// ─── Queries ──────────────────────────────────────────────────────────────────

function productMeta(storeId: string, t: string) {
  return rows(
    `SELECT p.id AS "productId", p.name, p.base_sku AS "baseSku",
            p.category_id AS "categoryId", c.name AS "categoryName",
            p.subcategory_id AS "subcategoryId", s.name AS "subcategoryName",
            p.supplier_id AS "supplierId",
            p.base_selling_price AS "sellingPrice", p.base_cost_price AS "costPrice",
            p.status, jsonb_array_length(COALESCE(p.image_urls, '[]'::jsonb)) > 0 AS "hasPhoto"
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN subcategories s ON s.id = p.subcategory_id
      WHERE p.store_id = ? AND p.created_at < ?::timestamptz`,
    [storeId, t]
  );
}

/** Variant list with its Size attribute (falls back to the display-name suffix). */
function variantMeta(storeId: string) {
  return rows(
    `SELECT v.id AS "variantId", v.product_id AS "productId",
            COALESCE(vav.value, NULLIF(split_part(v.display_name, ' / ', 2), ''), 'One Size') AS size,
            v.sort_order AS "sortOrder"
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN variant_attribute_values vav
              ON vav.variant_id = v.id
             AND vav.attribute_definition_id IN (SELECT id FROM attribute_definitions WHERE name ILIKE 'size')
      WHERE p.store_id = ?
      ORDER BY v.product_id, v.sort_order`,
    [storeId]
  );
}

/**
 * Stock-level timeline per product (or per variant) → in-stock days in the
 * windows the model uses. The running SUM of stock deltas is the stock level
 * after each movement; a segment [ts, next_ts) counts when that level is > 0.
 */
function exposure(storeId: string, t: string, level: 'product' | 'variant') {
  const key = level === 'product' ? 'v.product_id' : 'i.variant_id';
  const seg = (lo: string, hi: string) => OVERLAP('ts', 'COALESCE(next_ts, t)', lo, hi);
  return rows(
    `WITH params AS (SELECT ?::timestamptz AS t),
     ev AS (
       SELECT ${key} AS k, m.performed_at AS ts, ${STOCK_DELTA} AS d,
              (m.movement_type IN ${INBOUND})::int AS inbound
         FROM inventory_movements m
         JOIN inventory_items i ON i.id = m.inventory_item_id
         JOIN product_variants v ON v.id = i.variant_id
        CROSS JOIN params
        WHERE m.store_id = ? AND m.performed_at < params.t
     ),
     lv AS (
       SELECT k, ts, d, inbound,
              SUM(d) OVER w AS lvl,
              LEAD(ts) OVER w AS next_ts,
              MIN(ts) FILTER (WHERE inbound = 1) OVER (PARTITION BY k) AS first_in
         FROM ev
       WINDOW w AS (PARTITION BY k ORDER BY ts, d DESC ROWS UNBOUNDED PRECEDING)
     )
     SELECT k AS "key",
            SUM(inbound) AS "unitsReceived",
            MIN(first_in) AS "firstStockedAt",
            COALESCE(SUM(${seg("t - interval '30 days'", 't')}) FILTER (WHERE lvl > 0), 0) AS "d30",
            COALESCE(SUM(${seg("t - interval '90 days'", "t - interval '30 days'")}) FILTER (WHERE lvl > 0), 0) AS "d31to90",
            COALESCE(SUM(${seg("t - interval '180 days'", 't')}) FILTER (WHERE lvl > 0), 0) AS "d180",
            COALESCE(SUM(${seg('first_in', "LEAST(first_in + interval '60 days', t)")}) FILTER (WHERE lvl > 0), 0) AS "launchDays"
       FROM lv CROSS JOIN params
      GROUP BY k`,
    [t, storeId]
  );
}

/** Units in sellable stock at T per variant, with their average age and cost. */
function stockAtT(storeId: string, t: string) {
  return rows(
    `WITH params AS (SELECT ?::timestamptz AS t),
     last AS (
       SELECT DISTINCT ON (m.inventory_item_id) m.inventory_item_id, m.to_status
         FROM inventory_movements m CROSS JOIN params
        WHERE m.store_id = ? AND m.performed_at < params.t
        ORDER BY m.inventory_item_id, m.performed_at DESC
     )
     SELECT i.variant_id AS "variantId", COUNT(*) AS stock,
            SUM(EXTRACT(EPOCH FROM (params.t - i.purchase_date::timestamptz)) / 86400.0) AS "ageDaysSum",
            SUM(i.purchase_cost_price) AS "costSum"
       FROM last
       JOIN inventory_items i ON i.id = last.inventory_item_id
      CROSS JOIN params
      WHERE last.to_status IN ${IN_STOCK}
      GROUP BY i.variant_id`,
    [t, storeId]
  );
}

/**
 * Sales windows per variant. Realised price spreads the bill-level discount
 * over its lines in proportion to their value.
 */
function sales(storeId: string, t: string) {
  return rows(
    `WITH params AS (SELECT ?::timestamptz AS t),
     fi AS (
       SELECT v.product_id, MIN(m.performed_at) AS first_in
         FROM inventory_movements m
         JOIN inventory_items i ON i.id = m.inventory_item_id
         JOIN product_variants v ON v.id = i.variant_id
        CROSS JOIN params
        WHERE m.store_id = ? AND m.performed_at < params.t AND m.movement_type IN ${INBOUND}
        GROUP BY v.product_id
     ),
     s AS (
       SELECT ii.product_id, ii.variant_id, inv.created_at AS ts, ii.unit_price,
              ii.final_price * (1 - COALESCE(inv.discount_amount, 0) / NULLIF(inv.subtotal, 0)) AS realised,
              it.purchase_cost_price AS cost, fi.first_in
         FROM invoice_items ii
         JOIN invoices inv ON inv.id = ii.invoice_id
         LEFT JOIN inventory_items it ON it.id = ii.inventory_item_id
         LEFT JOIN fi ON fi.product_id = ii.product_id
        CROSS JOIN params
        WHERE inv.store_id = ? AND inv.created_at < params.t AND inv.status <> 'CANCELLED'
     )
     SELECT s.product_id AS "productId", s.variant_id AS "variantId",
            COUNT(*) FILTER (WHERE ts >= t - interval '7 days') AS u7,
            COUNT(*) FILTER (WHERE ts >= t - interval '15 days') AS u15,
            COUNT(*) FILTER (WHERE ts >= t - interval '30 days') AS u30,
            COUNT(*) FILTER (WHERE ts >= t - interval '90 days' AND ts < t - interval '30 days') AS u31to90,
            COUNT(*) FILTER (WHERE ts >= t - interval '180 days') AS u180,
            COUNT(*) AS lifetime,
            COUNT(*) FILTER (WHERE ts < first_in + interval '60 days') AS launch,
            MIN(ts) AS "firstSaleAt",
            SUM(unit_price) AS gross,
            SUM(COALESCE(realised, unit_price)) AS realised,
            COUNT(*) FILTER (WHERE COALESCE(realised, unit_price) < unit_price * 0.95) AS discounted,
            AVG(cost) AS "avgCost"
       FROM s CROSS JOIN params
      GROUP BY s.product_id, s.variant_id`,
    [t, storeId, storeId]
  );
}

function returnsByProduct(storeId: string, t: string) {
  return rows(
    `SELECT ii.product_id AS "productId", COUNT(*) AS returns
       FROM return_items ri
       JOIN returns r ON r.id = ri.return_id
       JOIN invoice_items ii ON ii.id = ri.original_invoice_item_id
      WHERE r.store_id = ? AND r.created_at < ?::timestamptz
      GROUP BY ii.product_id`,
    [storeId, t]
  );
}

/** Units per category in the two windows last year that bracket "next 30 days". */
function seasonality(storeId: string, t: string) {
  return rows(
    `WITH params AS (SELECT ?::timestamptz AS t)
     SELECT p.category_id AS "categoryId",
            COUNT(*) FILTER (WHERE inv.created_at >= t - interval '365 days' AND inv.created_at < t - interval '335 days') AS "nextLy",
            COUNT(*) FILTER (WHERE inv.created_at >= t - interval '455 days' AND inv.created_at < t - interval '365 days') AS "prevLy"
       FROM invoice_items ii
       JOIN invoices inv ON inv.id = ii.invoice_id
       JOIN products p ON p.id = ii.product_id
      CROSS JOIN params
      WHERE inv.store_id = ? AND inv.status <> 'CANCELLED'
        AND inv.created_at >= t - interval '455 days' AND inv.created_at < t - interval '335 days'
      GROUP BY p.category_id`,
    [t, storeId]
  );
}

/** Seasonal ratio: (units/day next 30d) / (units/day previous 90d), last year. */
function seasonalRatio(nextLy: number, prevLy: number): number {
  if (prevLy <= 0) return 1;
  return (nextLy / 30) / (prevLy / 90);
}

// ─── Assembly ─────────────────────────────────────────────────────────────────

async function loadStoreFeatures(storeId: string, asOf: Date = new Date()): Promise<StoreFeatures> {
  const t = asOf.toISOString();
  const [meta, variants, prodExp, varExp, stock, sale, rets, seas] = await Promise.all([
    productMeta(storeId, t),
    variantMeta(storeId),
    exposure(storeId, t, 'product'),
    exposure(storeId, t, 'variant'),
    stockAtT(storeId, t),
    sales(storeId, t),
    returnsByProduct(storeId, t),
    seasonality(storeId, t),
  ]);

  const byKey = <T extends RawRow>(list: T[], key: string) => new Map(list.map((r) => [r[key] as string, r]));
  const prodExpBy = byKey(prodExp, 'key');
  const varExpBy = byKey(varExp, 'key');
  const stockBy = byKey(stock, 'variantId');
  const salesByVariant = byKey(sale, 'variantId');
  const returnsBy = byKey(rets, 'productId');

  const variantsByProduct = new Map<string, RawRow[]>();
  for (const v of variants) {
    const pid = v.productId as string;
    if (!variantsByProduct.has(pid)) variantsByProduct.set(pid, []);
    variantsByProduct.get(pid)!.push(v);
  }

  const tMs = asOf.getTime();
  const products: ProductFeatures[] = meta.map((m) => {
    const pid = m.productId as string;
    const pe = prodExpBy.get(pid);
    const vlist = variantsByProduct.get(pid) ?? [];

    let stockNow = 0, ageSum = 0, costSum = 0;
    let u7 = 0, u15 = 0, u30 = 0, u31to90 = 0, u180 = 0, lifetime = 0, launch = 0;
    let gross = 0, realised = 0, discounted = 0, costWeighted = 0, costUnits = 0;
    let firstSale: number | null = null;

    const variantFeatures: VariantFeatures[] = vlist.map((v) => {
      const vid = v.variantId as string;
      const st = stockBy.get(vid);
      const sl = salesByVariant.get(vid);
      const ve = varExpBy.get(vid);
      stockNow += num(st?.stock);
      ageSum += num(st?.ageDaysSum);
      costSum += num(st?.costSum);
      if (sl) {
        u7 += num(sl.u7); u15 += num(sl.u15); u30 += num(sl.u30); u31to90 += num(sl.u31to90);
        u180 += num(sl.u180); lifetime += num(sl.lifetime); launch += num(sl.launch);
        gross += num(sl.gross); realised += num(sl.realised); discounted += num(sl.discounted);
        if (sl.avgCost !== null && sl.avgCost !== undefined) {
          costWeighted += num(sl.avgCost) * num(sl.lifetime);
          costUnits += num(sl.lifetime);
        }
        const fs = sl.firstSaleAt ? new Date(sl.firstSaleAt as string).getTime() : null;
        if (fs !== null && (firstSale === null || fs < firstSale)) firstSale = fs;
      }
      return {
        variantId: vid,
        size: String(v.size),
        stock: num(st?.stock),
        units30: num(sl?.u30),
        units31to90: num(sl?.u31to90),
        units180: num(sl?.u180),
        unitsLifetime: num(sl?.lifetime),
        inStockDays30: num(ve?.d30),
        inStockDays31to90: num(ve?.d31to90),
        inStockDays180: num(ve?.d180),
      };
    });

    const firstStockedAt = iso(pe?.firstStockedAt);
    return {
      productId: pid,
      name: m.name as string,
      baseSku: m.baseSku as string,
      categoryId: (m.categoryId as string) ?? null,
      categoryName: (m.categoryName as string) ?? null,
      subcategoryId: (m.subcategoryId as string) ?? null,
      subcategoryName: (m.subcategoryName as string) ?? null,
      supplierId: (m.supplierId as string) ?? null,
      sellingPrice: num(m.sellingPrice),
      costPrice: num(m.costPrice),
      status: m.status as string,
      hasPhoto: Boolean(m.hasPhoto),

      firstStockedAt,
      unitsReceived: num(pe?.unitsReceived),
      stockNow,
      avgStockAgeDays: stockNow > 0 ? ageSum / stockNow : null,
      avgCostInStock: stockNow > 0 ? costSum / stockNow : null,

      inStockDays30: num(pe?.d30),
      inStockDays31to90: num(pe?.d31to90),
      inStockDays180: num(pe?.d180),
      launchInStockDays: num(pe?.launchDays),
      launchUnits: launch,
      launchComplete: firstStockedAt !== null && tMs - new Date(firstStockedAt).getTime() >= 60 * 86_400_000,

      units7: u7, units15: u15, units30: u30, units31to90: u31to90, units180: u180,
      unitsLifetime: lifetime,
      firstSaleAt: firstSale !== null ? new Date(firstSale).toISOString() : null,
      grossRevenue: gross,
      realisedRevenue: realised,
      discountedUnits: discounted,
      avgUnitCostSold: costUnits > 0 ? costWeighted / costUnits : null,
      returns: num(returnsBy.get(pid)?.returns),
      variants: variantFeatures,
    };
  });

  // Seasonality: category ratio shrunk toward the store ratio by its volume.
  let storeNext = 0, storePrev = 0;
  for (const s of seas) { storeNext += num(s.nextLy); storePrev += num(s.prevLy); }
  const hasHistory = storePrev >= 90; // about a unit a day in last year's window
  const storeRatio = hasHistory ? clampSeasonal(seasonalRatio(storeNext, storePrev)) : 1;
  const byCategory = new Map<string, number>();
  for (const s of seas) {
    if (!hasHistory || !s.categoryId) continue;
    const prev = num(s.prevLy);
    const w = prev / (prev + 60);
    byCategory.set(s.categoryId as string,
      clampSeasonal(w * seasonalRatio(num(s.nextLy), prev) + (1 - w) * storeRatio));
  }

  const totalSold = products.reduce((s, p) => s + p.unitsLifetime, 0);
  const totalReturns = products.reduce((s, p) => s + p.returns, 0);

  return {
    storeId,
    asOf: t,
    products,
    byId: new Map(products.map((p) => [p.productId, p])),
    seasonal: { store: storeRatio, byCategory, hasHistory },
    storeReturnRate: totalSold > 0 ? totalReturns / totalSold : 0.03,
  };
}

function clampSeasonal(x: number): number {
  return Math.min(2.5, Math.max(0.4, x));
}

// ─── Actuals (evaluation) ─────────────────────────────────────────────────────

export interface ActualOutcome {
  productId: string;
  units: number;
  firstSaleAt: string | null;
  /** Units received during the window — the purchase plan that actually happened. */
  unitsReceived: number;
  receivedBySize: Record<string, number>;
}

/** What really happened to each product in [from, to). */
async function loadActuals(storeId: string, from: Date, to: Date, productIds?: string[]): Promise<Map<string, ActualOutcome>> {
  const filter = productIds?.length ? `AND ii.product_id = ANY(?::uuid[])` : '';
  const filterIn = productIds?.length ? `AND v.product_id = ANY(?::uuid[])` : '';
  const f = from.toISOString();
  const tt = to.toISOString();

  const [sold, received] = await Promise.all([
    rows(
      `SELECT ii.product_id AS "productId", COUNT(*) AS units, MIN(inv.created_at) AS "firstSaleAt"
         FROM invoice_items ii JOIN invoices inv ON inv.id = ii.invoice_id
        WHERE inv.store_id = ? AND inv.status <> 'CANCELLED'
          AND inv.created_at >= ?::timestamptz AND inv.created_at < ?::timestamptz ${filter}
        GROUP BY ii.product_id`,
      productIds?.length ? [storeId, f, tt, productIds] : [storeId, f, tt]
    ),
    rows(
      `SELECT v.product_id AS "productId",
              COALESCE(vav.value, NULLIF(split_part(v.display_name, ' / ', 2), ''), 'One Size') AS size,
              COUNT(*) AS units
         FROM inventory_movements m
         JOIN inventory_items i ON i.id = m.inventory_item_id
         JOIN product_variants v ON v.id = i.variant_id
         LEFT JOIN variant_attribute_values vav
                ON vav.variant_id = v.id
               AND vav.attribute_definition_id IN (SELECT id FROM attribute_definitions WHERE name ILIKE 'size')
        WHERE m.store_id = ? AND m.movement_type IN ${INBOUND}
          AND m.performed_at >= ?::timestamptz AND m.performed_at < ?::timestamptz ${filterIn}
        GROUP BY 1, 2`,
      productIds?.length ? [storeId, f, tt, productIds] : [storeId, f, tt]
    ),
  ]);

  const out = new Map<string, ActualOutcome>();
  const get = (pid: string) => {
    if (!out.has(pid)) out.set(pid, { productId: pid, units: 0, firstSaleAt: null, unitsReceived: 0, receivedBySize: {} });
    return out.get(pid)!;
  };
  for (const r of sold) {
    const o = get(r.productId as string);
    o.units = num(r.units);
    o.firstSaleAt = iso(r.firstSaleAt);
  }
  for (const r of received) {
    const o = get(r.productId as string);
    o.unitsReceived += num(r.units);
    o.receivedBySize[String(r.size)] = num(r.units);
  }
  return out;
}

export const AiFeaturesRepository = {
  loadStoreFeatures,
  loadActuals,
};
