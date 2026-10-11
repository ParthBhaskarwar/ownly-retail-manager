/**
 * DashboardService — Week 5 operational dashboard.
 *
 * Computes all KPIs directly from PostgreSQL, replacing the previous Dexie
 * (browser IndexedDB) reads in the frontend dashboard page.
 *
 * All queries are single SQL statements to keep response latency low even on
 * large datasets. The endpoint is called once per dashboard page load.
 */

import { db } from '@/db/client';
import { IN_STOCK_STATUSES } from '@/types/domain';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalesKpi {
  todayRevenue: number;
  todayOrders: number;
  weekRevenue: number;
  monthRevenue: number;
  todayGrossProfit: number;
}

export interface StockKpi {
  totalInStock: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalProducts: number;
  returnsToday: number;
  exchangesToday: number;
}

export interface TopSeller {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
}

export interface SlowMover {
  productId: string;
  productName: string;
  variantSku: string;
  inStock: number;
  lastSoldAt: string | null;
}

export interface ProductPerformance {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
  grossProfit: number;
  returnCount: number;
}

export interface RecentInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  grandTotal: number;
  status: string;
  createdAt: string;
}

export interface DashboardSummary {
  salesKpi: SalesKpi;
  stockKpi: StockKpi;
  topSellers: TopSeller[];
  slowMovers: SlowMover[];
  productPerformance: ProductPerformance[];
  recentInvoices: RecentInvoice[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

const LOW_STOCK_THRESHOLD = 3;

export const DashboardService = {
  async getSummary(storeId: string): Promise<DashboardSummary> {
    const [salesKpi, stockKpi, topSellers, slowMovers, productPerformance, recentInvoices] =
      await Promise.all([
        this.getSalesKpi(storeId),
        this.getStockKpi(storeId),
        this.getTopSellers(storeId),
        this.getSlowMovers(storeId),
        this.getProductPerformance(storeId),
        this.getRecentInvoices(storeId),
      ]);

    return { salesKpi, stockKpi, topSellers, slowMovers, productPerformance, recentInvoices };
  },

  async getSalesKpi(storeId: string): Promise<SalesKpi> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

    // Today's revenue + orders in one query
    const todayRow = (await db('invoices')
      .where('store_id', storeId)
      .whereRaw(`DATE(created_at) = ?`, [today])
      .whereNotIn('status', ['CANCELLED'])
      .select(
        db.raw('COALESCE(SUM(grand_total), 0) AS today_revenue'),
        db.raw('COUNT(*) AS today_orders')
      )
      .first()) as { todayRevenue: number; todayOrders: number } | undefined;

    // Week + month revenue
    const periodRow = (await db('invoices')
      .where('store_id', storeId)
      .whereNotIn('status', ['CANCELLED'])
      .select(
        db.raw(`COALESCE(SUM(grand_total) FILTER (WHERE DATE(created_at) >= ?), 0) AS week_revenue`, [weekAgo]),
        db.raw(`COALESCE(SUM(grand_total) FILTER (WHERE DATE(created_at) >= ?), 0) AS month_revenue`, [monthAgo])
      )
      .first()) as { weekRevenue: number; monthRevenue: number } | undefined;

    // Today's gross profit: Σ(selling_price − cost_price) per unit sold today
    const profitRow = (await db('invoice_items as ii')
      .join('invoices as inv', 'inv.id', 'ii.invoice_id')
      .join('inventory_items as i', 'i.id', 'ii.inventory_item_id')
      .where('inv.store_id', storeId)
      .whereRaw(`DATE(inv.created_at) = ?`, [today])
      .whereNotIn('inv.status', ['CANCELLED'])
      .select(
        db.raw('COALESCE(SUM(ii.final_price - i.purchase_cost_price), 0) AS today_gross_profit')
      )
      .first()) as { todayGrossProfit: number } | undefined;

    return {
      todayRevenue: Number(todayRow?.todayRevenue ?? 0),
      todayOrders: Number(todayRow?.todayOrders ?? 0),
      weekRevenue: Number(periodRow?.weekRevenue ?? 0),
      monthRevenue: Number(periodRow?.monthRevenue ?? 0),
      todayGrossProfit: Number(profitRow?.todayGrossProfit ?? 0),
    };
  },

  async getStockKpi(storeId: string): Promise<StockKpi> {
    const today = new Date().toISOString().slice(0, 10);

    // Total in-stock units + total product count in one query
    const stockRow = (await db('inventory_items as i')
      .join('product_variants as v', 'v.id', 'i.variant_id')
      .join('products as p', 'p.id', 'v.product_id')
      .where('i.store_id', storeId)
      .select(
        db.raw(`COUNT(i.id) FILTER (WHERE i.status IN (${IN_STOCK_STATUSES.map(() => '?').join(', ')})) AS total_in_stock`, IN_STOCK_STATUSES),
        db.raw('COUNT(DISTINCT p.id) AS total_products')
      )
      .first()) as { totalInStock: number; totalProducts: number } | undefined;

    // Low stock count (variants with 1–(threshold-1) in stock)
    const alertRows = (await db('product_variants as v')
      .join('products as p', 'p.id', 'v.product_id')
      .leftJoin('inventory_items as i', function () {
        this.on('i.variant_id', '=', 'v.id').andOnIn('i.status', IN_STOCK_STATUSES as string[]);
      })
      .where('p.store_id', storeId)
      .groupBy('v.id')
      .select(
        db.raw(`COUNT(i.id) AS in_stock`),
        db.raw(`COUNT(i.id) FILTER (WHERE true) AS ever_stocked_count`)
      )) as Array<{ inStock: number; everStockedCount: number }>;

    let lowStockCount = 0;
    let outOfStockCount = 0;
    for (const row of alertRows) {
      const inStock = Number(row.inStock);
      if (inStock === 0 && Number(row.everStockedCount) === 0) continue; // never stocked
      if (inStock === 0) outOfStockCount++;
      else if (inStock < LOW_STOCK_THRESHOLD) lowStockCount++;
    }

    // Returns and exchanges today
    const activityRow = (await db('returns as r')
      .where('r.store_id', storeId)
      .select(
        db.raw(`COUNT(*) FILTER (WHERE DATE(r.created_at) = ?) AS returns_today`, [today]),
        db.raw(`(SELECT COUNT(*) FROM exchanges ex WHERE ex.store_id = ? AND DATE(ex.created_at) = ?) AS exchanges_today`, [storeId, today])
      )
      .first()) as { returnsToday: number; exchangesToday: number } | undefined;

    return {
      totalInStock: Number(stockRow?.totalInStock ?? 0),
      totalProducts: Number(stockRow?.totalProducts ?? 0),
      lowStockCount,
      outOfStockCount,
      returnsToday: Number(activityRow?.returnsToday ?? 0),
      exchangesToday: Number(activityRow?.exchangesToday ?? 0),
    };
  },

  async getTopSellers(storeId: string, days = 30): Promise<TopSeller[]> {
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

    const rows = (await db('invoice_items as ii')
      .join('invoices as inv', 'inv.id', 'ii.invoice_id')
      .join('products as p', 'p.id', 'ii.product_id')
      .where('inv.store_id', storeId)
      .whereRaw(`DATE(inv.created_at) >= ?`, [since])
      .whereNotIn('inv.status', ['CANCELLED'])
      .where('ii.status', 'ACTIVE')
      .groupBy('p.id', 'p.name')
      .select(
        db.ref('p.id').as('product_id'),
        db.ref('p.name').as('product_name'),
        db.raw('COUNT(ii.id) AS units_sold'),
        db.raw('COALESCE(SUM(ii.final_price), 0) AS revenue')
      )
      .orderBy('units_sold', 'desc')
      .limit(10)) as Array<{ productId: string; productName: string; unitsSold: number; revenue: number }>;

    return rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      unitsSold: Number(r.unitsSold),
      revenue: Number(r.revenue),
    }));
  },

  async getSlowMovers(storeId: string, days = 30): Promise<SlowMover[]> {
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

    // Variants that have in-stock units but no sales in the last `days` days
    const rows = (await db('product_variants as v')
      .join('products as p', 'p.id', 'v.product_id')
      .leftJoin('inventory_items as i', function () {
        this.on('i.variant_id', '=', 'v.id').andOnIn('i.status', IN_STOCK_STATUSES as string[]);
      })
      .leftJoin(
        db('invoice_items as ii2')
          .join('invoices as inv2', 'inv2.id', 'ii2.invoice_id')
          .where('inv2.store_id', storeId)
          .whereRaw(`DATE(inv2.created_at) >= ?`, [since])
          .select('ii2.variant_id', db.raw('MAX(inv2.created_at) AS last_sold_at'))
          .groupBy('ii2.variant_id')
          .as('sales'),
        'sales.variant_id',
        'v.id'
      )
      .where('p.store_id', storeId)
      .groupBy('v.id', 'p.id', 'p.name', 'v.sku', 'sales.last_sold_at')
      .having(db.raw('COUNT(i.id)'), '>', 0) // has in-stock items
      .whereNull('sales.last_sold_at') // no sales in period
      .select(
        db.ref('p.id').as('product_id'),
        db.ref('p.name').as('product_name'),
        db.ref('v.sku').as('variant_sku'),
        db.raw('COUNT(i.id) AS in_stock'),
        db.ref('sales.last_sold_at').as('last_sold_at')
      )
      .orderBy('in_stock', 'desc')
      .limit(10)) as Array<{
        productId: string; productName: string; variantSku: string;
        inStock: number; lastSoldAt: string | null;
      }>;

    return rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      variantSku: r.variantSku,
      inStock: Number(r.inStock),
      lastSoldAt: r.lastSoldAt ?? null,
    }));
  },

  async getProductPerformance(storeId: string, days = 30): Promise<ProductPerformance[]> {
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

    const rows = (await db('products as p')
      .where('p.store_id', storeId)
      .leftJoin(
        db('invoice_items as ii')
          .join('invoices as inv', 'inv.id', 'ii.invoice_id')
          .join('inventory_items as itm', 'itm.id', 'ii.inventory_item_id')
          .whereRaw(`DATE(inv.created_at) >= ?`, [since])
          .whereNotIn('inv.status', ['CANCELLED'])
          .where('ii.status', 'ACTIVE')
          .select(
            'ii.product_id',
            db.raw('COUNT(ii.id) AS units_sold'),
            db.raw('COALESCE(SUM(ii.final_price), 0) AS revenue'),
            db.raw('COALESCE(SUM(ii.final_price - itm.purchase_cost_price), 0) AS gross_profit')
          )
          .groupBy('ii.product_id')
          .as('sales'),
        'sales.product_id',
        'p.id'
      )
      .leftJoin(
        db('return_items as ri')
          .join('returns as ret', 'ret.id', 'ri.return_id')
          .join('invoice_items as ii2', 'ii2.id', 'ri.original_invoice_item_id')
          .whereRaw(`DATE(ret.created_at) >= ?`, [since])
          .select('ii2.product_id', db.raw('COUNT(ri.id) AS return_count'))
          .groupBy('ii2.product_id')
          .as('rets'),
        'rets.product_id',
        'p.id'
      )
      .select(
        db.ref('p.id').as('product_id'),
        db.ref('p.name').as('product_name'),
        db.raw('COALESCE(sales.units_sold, 0) AS units_sold'),
        db.raw('COALESCE(sales.revenue, 0) AS revenue'),
        db.raw('COALESCE(sales.gross_profit, 0) AS gross_profit'),
        db.raw('COALESCE(rets.return_count, 0) AS return_count')
      )
      .where(db.raw('COALESCE(sales.units_sold, 0) > 0 OR COALESCE(rets.return_count, 0) > 0'))
      .orderBy('revenue', 'desc')
      .limit(20)) as Array<{
        productId: string; productName: string;
        unitsSold: number; revenue: number; grossProfit: number; returnCount: number;
      }>;

    return rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      unitsSold: Number(r.unitsSold),
      revenue: Number(r.revenue),
      grossProfit: Number(r.grossProfit),
      returnCount: Number(r.returnCount),
    }));
  },

  async getRecentInvoices(storeId: string, limit = 10): Promise<RecentInvoice[]> {
    const rows = (await db('invoices')
      .where('store_id', storeId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .select('id', 'invoice_number', 'customer_name', 'grand_total', 'status', 'created_at')) as RecentInvoice[];

    return rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      customerName: r.customerName,
      grandTotal: Number(r.grandTotal),
      status: r.status,
      createdAt: r.createdAt,
    }));
  },
};
