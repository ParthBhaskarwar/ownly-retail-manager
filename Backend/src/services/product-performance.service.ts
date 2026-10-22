/**
 * ProductPerformanceService — Week 6 product-performance calculation service.
 *
 * Computes and caches five metrics per product, all driven by existing
 * PostgreSQL tables (no new data collection needed):
 *
 *   1. Time to first sale    — days from first inventory item to first invoice
 *   2. Sales velocity        — units sold per day (30-day rolling average)
 *   3. Sell-through rate     — sold / (sold + in_stock) across all variants
 *   4. Stock age             — average (NOW() − purchase_date) for in-stock items
 *   5. Size demand           — per-size sell-through breakdown
 *
 * Results are written to product_performance_cache and returned immediately.
 * The cache is invalidated whenever the service is called explicitly (e.g. on
 * product detail page load) or by a scheduled background job.
 */

import { db } from '@/db/client';
import { AppError } from '@/shared/AppError';
import { IN_STOCK_STATUSES } from '@/types/domain';
import type { ProductPerformanceMetrics, SizeDemandEntry } from '@/types/domain';

export const ProductPerformanceService = {
  /**
   * Compute and cache performance metrics for a single product.
   * Always re-computes fresh — the caller controls when to refresh.
   */
  async computeForProduct(
    storeId: string,
    productId: string
  ): Promise<ProductPerformanceMetrics> {
    // Verify the product belongs to this store
    const product = await db('products')
      .where({ id: productId, store_id: storeId })
      .first();
    if (!product) {
      throw AppError.notFound('Product not found.');
    }

    const [
      timeToFirstSaleDays,
      salesVelocity30d,
      sellThroughRate,
      avgStockAgeDays,
      sizeDemand,
    ] = await Promise.all([
      this._timeToFirstSale(productId),
      this._salesVelocity(productId, storeId),
      this._sellThroughRate(productId),
      this._avgStockAge(productId),
      this._sizeDemand(productId, storeId),
    ]);

    const metrics: ProductPerformanceMetrics = {
      productId,
      timeToFirstSaleDays,
      salesVelocity30d,
      sellThroughRate,
      avgStockAgeDays,
      sizeDemand,
      computedAt: new Date().toISOString(),
    };

    // Upsert into cache
    await db('product_performance_cache')
      .insert({
        product_id: productId,
        time_to_first_sale_days: timeToFirstSaleDays,
        sales_velocity_30d: salesVelocity30d,
        sell_through_rate: sellThroughRate,
        avg_stock_age_days: avgStockAgeDays,
        size_demand: JSON.stringify(sizeDemand),
        computed_at: new Date(),
      })
      .onConflict('product_id')
      .merge();

    return metrics;
  },

  /**
   * Retrieve cached metrics for a product, or compute them if no cache entry
   * exists. Use computeForProduct() to force a refresh.
   */
  async getForProduct(
    storeId: string,
    productId: string
  ): Promise<ProductPerformanceMetrics> {
    // Tenant check first: the cache is keyed by product only, so without this a
    // user from another store could read this product's metrics by guessing its id.
    const owned = await db('products').where({ id: productId, store_id: storeId }).first('id');
    if (!owned) throw AppError.notFound('Product not found.');

    const cached = await db('product_performance_cache')
      .where({ product_id: productId })
      .first();

    if (cached) {
      return {
        productId,
        // db rows arrive camelCased (see pg-mapping), so read camelCase keys here.
        timeToFirstSaleDays: cached.timeToFirstSaleDays != null
          ? Number(cached.timeToFirstSaleDays) : null,
        salesVelocity30d: cached.salesVelocity30d != null
          ? Number(cached.salesVelocity30d) : null,
        sellThroughRate: cached.sellThroughRate != null
          ? Number(cached.sellThroughRate) : null,
        avgStockAgeDays: cached.avgStockAgeDays != null
          ? Number(cached.avgStockAgeDays) : null,
        sizeDemand: ((typeof cached.sizeDemand === 'string'
          ? JSON.parse(cached.sizeDemand)
          : cached.sizeDemand) ?? []) as SizeDemandEntry[],
        computedAt: cached.computedAt instanceof Date
          ? cached.computedAt.toISOString()
          : String(cached.computedAt),
      };
    }

    return this.computeForProduct(storeId, productId);
  },

  /**
   * Compute metrics for all products in a store (batch refresh).
   * Returns a summary of how many products were refreshed.
   */
  async computeForStore(storeId: string): Promise<{ refreshed: number }> {
    const products = await db('products')
      .where({ store_id: storeId })
      .select('id');

    let refreshed = 0;
    for (const p of products) {
      try {
        await this.computeForProduct(storeId, p.id as string);
        refreshed++;
      } catch {
        // Individual failure does not abort the batch
      }
    }
    return { refreshed };
  },

  // ── Private calculation helpers ────────────────────────────────────────────

  /** Days from first inventory_item.created_at to first invoice sale. */
  async _timeToFirstSale(productId: string): Promise<number | null> {
    const row = (await db('product_variants as v')
      .join('inventory_items as i', 'i.variant_id', 'v.id')
      .join('invoice_items as ii', function () {
        this.on('ii.variant_id', '=', 'v.id').andOn(
          db.raw('ii.status = ?', ['ACTIVE'])
        );
      })
      .join('invoices as inv', 'inv.id', 'ii.invoice_id')
      .where('v.product_id', productId)
      .whereNotIn('inv.status', ['CANCELLED'])
      .select(
        db.raw('MIN(i.created_at) AS first_stocked'),
        db.raw('MIN(inv.created_at) AS first_sold')
      )
      .first()) as { firstStocked: Date | null; firstSold: Date | null } | undefined;

    if (!row?.firstStocked || !row?.firstSold) return null;

    const msPerDay = 86_400_000;
    const diff =
      new Date(row.firstSold).getTime() - new Date(row.firstStocked).getTime();
    return Math.max(0, Math.round(diff / msPerDay));
  },

  /** Units sold in the most-recent 30-day window, expressed as units per day. */
  async _salesVelocity(productId: string, storeId: string): Promise<number | null> {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const row = (await db('invoice_items as ii')
      .join('invoices as inv', 'inv.id', 'ii.invoice_id')
      .where('inv.store_id', storeId)
      .where('ii.product_id', productId)
      .where('inv.created_at', '>=', since)
      .whereNotIn('inv.status', ['CANCELLED'])
      .where('ii.status', 'ACTIVE')
      .select(db.raw('COUNT(ii.id) AS units_sold'))
      .first()) as { unitsSold: number } | undefined;

    const unitsSold = Number(row?.unitsSold ?? 0);
    if (unitsSold === 0) return 0;
    // velocity = units per day over the 30-day window
    return Math.round((unitsSold / 30) * 100) / 100;
  },

  /**
   * Sell-through rate = sold / (sold + in_stock) across all variants.
   * Returns null when the product has never had stock.
   */
  async _sellThroughRate(productId: string): Promise<number | null> {
    const row = (await db('product_variants as v')
      .leftJoin('inventory_items as i', 'i.variant_id', 'v.id')
      .where('v.product_id', productId)
      .select(
        db.raw(
          `COUNT(i.id) FILTER (WHERE i.status = 'SOLD') AS sold`,
        ),
        db.raw(
          `COUNT(i.id) FILTER (WHERE i.status IN (${IN_STOCK_STATUSES.map(() => '?').join(', ')})) AS in_stock`,
          IN_STOCK_STATUSES
        ),
        db.raw('COUNT(i.id) AS total')
      )
      .first()) as { sold: number; inStock: number; total: number } | undefined;

    const sold = Number(row?.sold ?? 0);
    const inStock = Number(row?.inStock ?? 0);
    const total = sold + inStock;
    if (total === 0) return null;
    return Math.round((sold / total) * 1000) / 1000;
  },

  /**
   * Average (NOW() − purchase_date) in days for currently in-stock items
   * across all variants.
   */
  async _avgStockAge(productId: string): Promise<number | null> {
    const row = (await db('product_variants as v')
      .join('inventory_items as i', 'i.variant_id', 'v.id')
      .where('v.product_id', productId)
      .whereIn('i.status', IN_STOCK_STATUSES as string[])
      .select(
        db.raw(
          `ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - i.purchase_date::timestamp)) / 86400), 1) AS avg_age_days`
        )
      )
      .first()) as { avgAgeDays: number | null } | undefined;

    return row?.avgAgeDays !== null && row?.avgAgeDays !== undefined
      ? Number(row.avgAgeDays)
      : null;
  },

  /**
   * Per-size sell-through breakdown.
   *
   * Joins variant_attribute_values for the 'Size' attribute definition,
   * then computes sold / (sold + in_stock) per size label.
   * Returns an empty array if no size attribute is configured.
   */
  async _sizeDemand(productId: string, storeId: string): Promise<SizeDemandEntry[]> {
    // Find the Size attribute definition for this product's retail template
    const product = await db('products').where({ id: productId }).first();
    if (!product) return [];

    const sizeAttrDef = await db('attribute_definitions')
      .where({ retail_template_id: product.retailTemplateId })
      .whereILike('name', 'size')
      .first();

    if (!sizeAttrDef) return [];

    const rows = (await db('product_variants as v')
      .join('variant_attribute_values as vav', function () {
        this.on('vav.variant_id', '=', 'v.id').andOn(
          'vav.attribute_definition_id',
          '=',
          db.raw('?', [sizeAttrDef.id as string])
        );
      })
      .leftJoin('inventory_items as i', 'i.variant_id', 'v.id')
      .where('v.product_id', productId)
      .groupBy('vav.value')
      .select(
        db.ref('vav.value').as('size'),
        db.raw(`COUNT(i.id) FILTER (WHERE i.status = 'SOLD') AS sold`),
        db.raw(
          `COUNT(i.id) FILTER (WHERE i.status IN (${IN_STOCK_STATUSES.map(() => '?').join(', ')})) AS in_stock`,
          IN_STOCK_STATUSES
        )
      )
      .orderBy('vav.value')) as Array<{
        size: string;
        sold: number;
        inStock: number;
      }>;

    return rows.map((r) => {
      const sold = Number(r.sold);
      const inStock = Number(r.inStock);
      const total = sold + inStock;
      return {
        size: r.size,
        sold,
        inStock,
        sellThroughRate: total > 0 ? Math.round((sold / total) * 1000) / 1000 : 0,
      };
    });
  },
};
