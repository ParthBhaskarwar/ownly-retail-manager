/**
 * ReportsService — Week 5 core reports.
 *
 * Provides 5 report types, each returning an array of rows that the router
 * serialises to JSON or converts to CSV/Excel via the xlsx library.
 *
 * All queries are scoped to store_id and accept optional date-range filters.
 */

import type { Knex } from 'knex';
import { db } from '@/db/client';

// ─── Shared filter type ───────────────────────────────────────────────────────

export interface ReportDateFilter {
  from?: string;  // YYYY-MM-DD inclusive
  to?: string;    // YYYY-MM-DD inclusive
}

// ─── Report row types ─────────────────────────────────────────────────────────

export interface SalesReportRow {
  invoiceNumber: string;
  date: string;
  customerName: string | null;
  customerPhone: string | null;
  cashierName: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  amountPaid: number;
  paymentMethods: string;
  status: string;
  itemCount: number;
}

export interface InventoryReportRow {
  barcode: string;
  productId: string;
  productSku: string;
  categoryId: string | null;
  supplierId: string | null;
  productName: string;
  variantSku: string;
  size: string | null;
  categoryName: string | null;
  supplierName: string | null;
  status: string;
  purchaseCostPrice: number;
  sellingPrice: number;
  purchaseDate: string;
  ageDays: number;
}

export interface SupplierReportRow {
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  totalProductsSupplied: number;
  itemsSold: number;
  totalUnitsReceived: number;
  totalCostValue: number;
  currentInStock: number;
  currentStockValue: number;
  lastDeliveryDate: string | null;
}

export interface ReturnsReportRow {
  returnNumber: string;
  date: string;
  originalInvoiceNumber: string;
  customerName: string | null;
  processedBy: string;
  totalRefundAmount: number;
  refundMethod: string;
  itemCount: number;
  notes: string | null;
}

export interface StaffReportRow {
  staffName: string;
  role: string;
  invoiceCount: number;
  totalRevenue: number;
  totalDiscount: number;
  avgOrderValue: number;
  returnsProcessed: number;
}

export interface SalesSummaryFilter extends ReportDateFilter {
  categoryId?: string;
  supplierId?: string;
}

export interface SalesSummary {
  totalRevenue: number;
  totalCostOfGoodsSold: number;
  grossProfit: number;
  grossMarginPercent: number;
  totalItemsSold: number;
  totalInvoicesCount: number;
  averageBillValue: number;
  salesByCategory: Array<{ categoryName: string; unitsSold: number; revenue: number; profit: number }>;
  salesByProduct: Array<{ productName: string; sku: string; unitsSold: number; revenue: number; profit: number; margin: number }>;
  salesByPaymentMode: Record<string, number>;
}

export interface ReturnsSummary {
  totalReturnsCount: number;
  totalRefundAmount: number;
  returnRatePercent: number;
  damagedOrDefectiveCount: number;
  returnedToStockCount: number;
  returnsByReason: Record<string, number>;
  returnedProductsList: Array<{
    productName: string;
    sku: string;
    returnCount: number;
    refundTotal: number;
    primaryReason: string;
  }>;
}

export interface StaffActivityRow {
  staffId: string;
  name: string;
  role: string;
  totalTransactionsLogged: number;
  stockMovementsPerformed: number;
  salesAssisted: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const ReportsService = {

  // ── Sales summary (revenue / COGS / profit from real invoices) ───────────────

  async getSalesSummary(storeId: string, filter: SalesSummaryFilter = {}): Promise<SalesSummary> {
    const base = () => {
      const qb = db('invoice_items as ii')
        .join('invoices as inv', 'inv.id', 'ii.invoice_id')
        .join('inventory_items as i', 'i.id', 'ii.inventory_item_id')
        .join('products as p', 'p.id', 'ii.product_id')
        .leftJoin('categories as c', 'c.id', 'p.category_id')
        .where('inv.store_id', storeId)
        .whereNot('inv.status', 'CANCELLED')
        .where('ii.status', 'ACTIVE');
      if (filter.from) qb.whereRaw('DATE(inv.created_at) >= ?', [filter.from]);
      if (filter.to)   qb.whereRaw('DATE(inv.created_at) <= ?', [filter.to]);
      if (filter.categoryId) qb.where('p.category_id', filter.categoryId);
      if (filter.supplierId) qb.where('p.supplier_id', filter.supplierId);
      return qb;
    };

    const byProduct = (await base()
      .groupBy('p.id', 'p.name', 'p.base_sku')
      .select(
        db.ref('p.name').as('product_name'),
        db.ref('p.base_sku').as('sku'),
        db.raw('COUNT(*) AS units_sold'),
        db.raw('COALESCE(SUM(ii.final_price), 0) AS revenue'),
        db.raw('COALESCE(SUM(i.purchase_cost_price), 0) AS cogs')
      )
      .orderByRaw('SUM(ii.final_price) DESC')) as Array<Record<string, unknown>>;

    const byCategory = (await base()
      .groupByRaw(`COALESCE(c.name, 'Uncategorised')`)
      .select(
        db.raw(`COALESCE(c.name, 'Uncategorised') AS category_name`),
        db.raw('COUNT(*) AS units_sold'),
        db.raw('COALESCE(SUM(ii.final_price), 0) AS revenue'),
        db.raw('COALESCE(SUM(i.purchase_cost_price), 0) AS cogs')
      )
      .orderByRaw('SUM(ii.final_price) DESC')) as Array<Record<string, unknown>>;

    const invoiceIds = base().distinct('inv.id');
    const invoiceCountRow = (await db.from(invoiceIds.clone().as('x')).count('* as n').first()) as
      | { n: string | number }
      | undefined;
    const invoiceCount = Number(invoiceCountRow?.n ?? 0);

    const payments = (await db('payments as pay')
      .whereIn('pay.invoice_id', invoiceIds)
      .where('pay.status', 'COMPLETED')
      .groupBy('pay.payment_method')
      .select(
        db.ref('pay.payment_method').as('method'),
        db.raw('COALESCE(SUM(pay.amount), 0) AS total')
      )) as Array<Record<string, unknown>>;

    const salesByPaymentMode: Record<string, number> = { Cash: 0, UPI: 0, Card: 0 };
    for (const p of payments) {
      const raw = String(p['method']);
      const label = raw === 'CASH' ? 'Cash' : raw === 'UPI' ? 'UPI' : raw === 'CARD' ? 'Card' : 'Credit Note';
      salesByPaymentMode[label] = Number(p['total']);
    }

    const totalRevenue = byProduct.reduce((s, r) => s + Number(r['revenue']), 0);
    const totalCogs = byProduct.reduce((s, r) => s + Number(r['cogs']), 0);
    const totalItemsSold = byProduct.reduce((s, r) => s + Number(r['unitsSold']), 0);
    const grossProfit = totalRevenue - totalCogs;

    return {
      totalRevenue,
      totalCostOfGoodsSold: totalCogs,
      grossProfit,
      grossMarginPercent: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
      totalItemsSold,
      totalInvoicesCount: invoiceCount,
      averageBillValue: invoiceCount > 0 ? totalRevenue / invoiceCount : 0,
      salesByCategory: byCategory.map((r) => ({
        categoryName: r['categoryName'] as string,
        unitsSold: Number(r['unitsSold']),
        revenue: Number(r['revenue']),
        profit: Number(r['revenue']) - Number(r['cogs']),
      })),
      salesByProduct: byProduct.map((r) => {
        const revenue = Number(r['revenue']);
        const profit = revenue - Number(r['cogs']);
        return {
          productName: r['productName'] as string,
          sku: r['sku'] as string,
          unitsSold: Number(r['unitsSold']),
          revenue,
          profit,
          margin: revenue > 0 ? (profit / revenue) * 100 : 0,
        };
      }),
      salesByPaymentMode,
    };
  },

  // ── Returns summary ──────────────────────────────────────────────────────────

  async getReturnsSummary(storeId: string, filter: ReportDateFilter = {}): Promise<ReturnsSummary> {
    const dated = <T extends Knex.QueryBuilder>(qb: T, col: string): T => {
      if (filter.from) qb.whereRaw(`DATE(${col}) >= ?`, [filter.from]);
      if (filter.to)   qb.whereRaw(`DATE(${col}) <= ?`, [filter.to]);
      return qb;
    };

    const totals = (await dated(db('returns as r').where('r.store_id', storeId), 'r.created_at')
      .select(
        db.raw('COUNT(*) AS returns_count'),
        db.raw('COALESCE(SUM(r.total_refund_amount), 0) AS refund_total')
      )
      .first()) as Record<string, unknown> | undefined;

    const items = (await dated(
      db('return_items as ri')
        .join('returns as r', 'r.id', 'ri.return_id')
        .join('invoice_items as ii', 'ii.id', 'ri.original_invoice_item_id')
        .join('products as p', 'p.id', 'ii.product_id')
        .where('r.store_id', storeId),
      'r.created_at'
    ).select(
      db.ref('p.id').as('product_id'),
      db.ref('p.name').as('product_name'),
      db.ref('p.base_sku').as('sku'),
      db.ref('ri.condition').as('condition'),
      db.ref('ri.reason').as('reason'),
      db.ref('ri.refund_amount').as('refund_amount'),
      db.ref('ri.inventory_action').as('inventory_action')
    )) as Array<Record<string, unknown>>;

    // Return rate = units returned / units sold in the period (not returns / invoices,
    // which an exchange — one return plus one new invoice — would distort).
    const soldLinesRow = (await dated(
      db('invoice_items as ii')
        .join('invoices as inv', 'inv.id', 'ii.invoice_id')
        .where('inv.store_id', storeId)
        .whereNot('inv.status', 'CANCELLED'),
      'inv.created_at'
    ).count('* as n').first()) as { n: string | number } | undefined;
    const soldLines = Number(soldLinesRow?.n ?? 0);

    const returnsByReason: Record<string, number> = {};
    const perProduct = new Map<string, {
      productName: string; sku: string; returnCount: number; refundTotal: number; reasons: Map<string, number>;
    }>();
    let damaged = 0;
    let toStock = 0;

    for (const it of items) {
      if (it['inventoryAction'] === 'RETURN_TO_STOCK') toStock++;
      if (it['condition'] === 'DAMAGED' || it['condition'] === 'DEFECTIVE') damaged++;

      const reason = (it['reason'] as string | null)?.trim() || 'Not specified';
      returnsByReason[reason] = (returnsByReason[reason] ?? 0) + 1;

      const key = it['productId'] as string;
      const p = perProduct.get(key) ?? {
        productName: it['productName'] as string,
        sku: it['sku'] as string,
        returnCount: 0,
        refundTotal: 0,
        reasons: new Map<string, number>(),
      };
      p.returnCount++;
      p.refundTotal += Number(it['refundAmount']);
      p.reasons.set(reason, (p.reasons.get(reason) ?? 0) + 1);
      perProduct.set(key, p);
    }

    const returnsCount = Number(totals?.['returnsCount'] ?? 0);

    return {
      totalReturnsCount: returnsCount,
      totalRefundAmount: Number(totals?.['refundTotal'] ?? 0),
      returnRatePercent: soldLines > 0 ? Math.min(100, (items.length / soldLines) * 100) : 0,
      damagedOrDefectiveCount: damaged,
      returnedToStockCount: toStock,
      returnsByReason,
      returnedProductsList: Array.from(perProduct.values())
        .map((p) => ({
          productName: p.productName,
          sku: p.sku,
          returnCount: p.returnCount,
          refundTotal: p.refundTotal,
          primaryReason: Array.from(p.reasons.entries()).sort((a, b) => b[1] - a[1])[0][0],
        }))
        .sort((a, b) => b.returnCount - a.returnCount),
    };
  },

  // ── Staff activity (logged stock movements + sales rung up) ───────────────────

  async getStaffActivity(storeId: string): Promise<StaffActivityRow[]> {
    const users = (await db('users')
      .where('store_id', storeId)
      .select('id', 'name', 'role')
      .orderBy('created_at', 'asc')) as Array<{ id: string; name: string; role: string }>;

    const movementRows = (await db('inventory_movements')
      .where('store_id', storeId)
      .groupBy('performed_by')
      .select(
        db.ref('performed_by').as('user_id'),
        db.raw('COUNT(*) AS movements'),
        db.raw(`COUNT(*) FILTER (WHERE movement_type = 'SALE') AS sales`)
      )) as Array<Record<string, unknown>>;

    const byUser = new Map(movementRows.map((r) => [r['userId'] as string, r]));
    return users.map((u) => {
      const m = byUser.get(u.id);
      const movements = Number(m?.['movements'] ?? 0);
      return {
        staffId: u.id,
        name: u.name,
        role: u.role,
        totalTransactionsLogged: movements,
        stockMovementsPerformed: movements,
        salesAssisted: Number(m?.['sales'] ?? 0),
      };
    });
  },

  // ── Sales report ─────────────────────────────────────────────────────────────

  async getSalesReport(storeId: string, filter: ReportDateFilter = {}): Promise<SalesReportRow[]> {
    const qb = db('invoices as inv')
      .where('inv.store_id', storeId)
      .leftJoin('users as u', 'u.id', 'inv.cashier_id')
      .leftJoin(
        db('invoice_items as ii2')
          .select('ii2.invoice_id', db.raw('COUNT(*) AS item_count'))
          .groupBy('ii2.invoice_id')
          .as('items'),
        'items.invoice_id', 'inv.id'
      )
      .leftJoin(
        db('payments as pay')
          .select(
            'pay.invoice_id',
            db.raw(`STRING_AGG(DISTINCT pay.payment_method, ', ') AS payment_methods`)
          )
          .groupBy('pay.invoice_id')
          .as('pmts'),
        'pmts.invoice_id', 'inv.id'
      );

    if (filter.from) qb.whereRaw(`DATE(inv.created_at) >= ?`, [filter.from]);
    if (filter.to)   qb.whereRaw(`DATE(inv.created_at) <= ?`, [filter.to]);

    const rows = (await qb
      .select(
        db.ref('inv.invoice_number').as('invoice_number'),
        db.raw(`TO_CHAR(inv.created_at, 'YYYY-MM-DD HH24:MI') AS date`),
        db.ref('inv.customer_name').as('customer_name'),
        db.ref('inv.customer_phone').as('customer_phone'),
        db.ref('u.name').as('cashier_name'),
        db.ref('inv.subtotal').as('subtotal'),
        db.ref('inv.discount_amount').as('discount_amount'),
        db.ref('inv.tax_amount').as('tax_amount'),
        db.ref('inv.grand_total').as('grand_total'),
        db.ref('inv.amount_paid').as('amount_paid'),
        db.raw(`COALESCE(pmts.payment_methods, '') AS payment_methods`),
        db.ref('inv.status').as('status'),
        db.raw(`COALESCE(items.item_count, 0) AS item_count`)
      )
      .orderBy('inv.created_at', 'desc')) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      invoiceNumber: r['invoiceNumber'] as string,
      date: r['date'] as string,
      customerName: (r['customerName'] as string | null) ?? null,
      customerPhone: (r['customerPhone'] as string | null) ?? null,
      cashierName: (r['cashierName'] as string) ?? 'Unknown',
      subtotal: Number(r['subtotal']),
      discountAmount: Number(r['discountAmount']),
      taxAmount: Number(r['taxAmount']),
      grandTotal: Number(r['grandTotal']),
      amountPaid: Number(r['amountPaid']),
      paymentMethods: r['paymentMethods'] as string,
      status: r['status'] as string,
      itemCount: Number(r['itemCount']),
    }));
  },

  // ── Inventory report ──────────────────────────────────────────────────────────

  async getInventoryReport(storeId: string): Promise<InventoryReportRow[]> {
    const rows = (await db('inventory_items as i')
      .join('product_variants as v', 'v.id', 'i.variant_id')
      .join('products as p', 'p.id', 'v.product_id')
      .leftJoin('categories as c', 'c.id', 'p.category_id')
      .leftJoin('suppliers as s', 's.id', 'p.supplier_id')
      .leftJoin('attribute_definitions as ad', function () {
        this.on('ad.retail_template_id', '=', 'p.retail_template_id')
          .andOnVal('ad.name', '=', 'Size')
          .andOnVal('ad.is_variant_level', '=', true);
      })
      .leftJoin('variant_attribute_values as sz', function () {
        this.on('sz.variant_id', '=', 'v.id').andOn('sz.attribute_definition_id', '=', 'ad.id');
      })
      .where('i.store_id', storeId)
      .select(
        db.ref('i.barcode').as('barcode'),
        db.ref('p.id').as('product_id'),
        db.ref('p.base_sku').as('product_sku'),
        db.ref('p.category_id').as('category_id'),
        db.ref('p.supplier_id').as('supplier_id'),
        db.ref('p.name').as('product_name'),
        db.ref('v.sku').as('variant_sku'),
        db.ref('sz.value').as('size'),
        db.ref('c.name').as('category_name'),
        db.ref('s.name').as('supplier_name'),
        db.ref('i.status').as('status'),
        db.ref('i.purchase_cost_price').as('purchase_cost_price'),
        db.raw('COALESCE(v.selling_price_override, p.base_selling_price) AS selling_price'),
        db.ref('i.purchase_date').as('purchase_date'),
        db.raw(`(CURRENT_DATE - i.purchase_date) AS age_days`)
      )
      .orderBy('i.created_at', 'desc')) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      barcode: r['barcode'] as string,
      productId: r['productId'] as string,
      productSku: r['productSku'] as string,
      categoryId: (r['categoryId'] as string | null) ?? null,
      supplierId: (r['supplierId'] as string | null) ?? null,
      productName: r['productName'] as string,
      variantSku: r['variantSku'] as string,
      size: (r['size'] as string | null) ?? null,
      categoryName: (r['categoryName'] as string | null) ?? null,
      supplierName: (r['supplierName'] as string | null) ?? null,
      status: r['status'] as string,
      purchaseCostPrice: Number(r['purchaseCostPrice']),
      sellingPrice: Number(r['sellingPrice']),
      purchaseDate: r['purchaseDate'] as string,
      ageDays: Number(r['ageDays'] ?? 0),
    }));
  },

  // ── Supplier report ───────────────────────────────────────────────────────────

  async getSupplierReport(storeId: string): Promise<SupplierReportRow[]> {
    const rows = (await db('suppliers as s')
      .where('s.store_id', storeId)
      .leftJoin('products as p', 'p.supplier_id', 's.id')
      .leftJoin('product_variants as v', 'v.product_id', 'p.id')
      .leftJoin('inventory_items as i', 'i.variant_id', 'v.id')
      .groupBy('s.id', 's.name', 's.code')
      .select(
        db.ref('s.id').as('supplier_id'),
        db.ref('s.name').as('supplier_name'),
        db.ref('s.code').as('supplier_code'),
        db.raw('COUNT(DISTINCT p.id) AS total_products_supplied'),
        db.raw(`COUNT(i.id) FILTER (WHERE i.status = 'SOLD') AS items_sold`),
        db.raw('COUNT(i.id) AS total_units_received'),
        db.raw('COALESCE(SUM(i.purchase_cost_price), 0) AS total_cost_value'),
        db.raw(`COUNT(i.id) FILTER (WHERE i.status IN ('IN_STOCK', 'RETURNED_TO_STOCK')) AS current_in_stock`),
        db.raw(`COALESCE(SUM(i.purchase_cost_price) FILTER (WHERE i.status IN ('IN_STOCK', 'RETURNED_TO_STOCK')), 0) AS current_stock_value`),
        db.raw('MAX(i.purchase_date) AS last_delivery_date')
      )
      .orderBy('total_units_received', 'desc')) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      supplierId: r['supplierId'] as string,
      supplierName: r['supplierName'] as string,
      supplierCode: r['supplierCode'] as string,
      totalProductsSupplied: Number(r['totalProductsSupplied']),
      itemsSold: Number(r['itemsSold']),
      totalUnitsReceived: Number(r['totalUnitsReceived']),
      totalCostValue: Number(r['totalCostValue']),
      currentInStock: Number(r['currentInStock']),
      currentStockValue: Number(r['currentStockValue']),
      lastDeliveryDate: (r['lastDeliveryDate'] as string | null) ?? null,
    }));
  },

  // ── Returns report ────────────────────────────────────────────────────────────

  async getReturnsReport(storeId: string, filter: ReportDateFilter = {}): Promise<ReturnsReportRow[]> {
    const qb = db('returns as r')
      .where('r.store_id', storeId)
      .join('invoices as inv', 'inv.id', 'r.original_invoice_id')
      .join('users as u', 'u.id', 'r.processed_by')
      .leftJoin(
        db('return_items as ri2')
          .select('ri2.return_id', db.raw('COUNT(*) AS item_count'))
          .groupBy('ri2.return_id')
          .as('ri_counts'),
        'ri_counts.return_id', 'r.id'
      );

    if (filter.from) qb.whereRaw(`DATE(r.created_at) >= ?`, [filter.from]);
    if (filter.to)   qb.whereRaw(`DATE(r.created_at) <= ?`, [filter.to]);

    const rows = (await qb
      .select(
        db.ref('r.return_number').as('return_number'),
        db.raw(`TO_CHAR(r.created_at, 'YYYY-MM-DD HH24:MI') AS date`),
        db.ref('inv.invoice_number').as('original_invoice_number'),
        db.ref('r.customer_id').as('customer_id'),
        db.ref('u.name').as('processed_by'),
        db.ref('r.total_refund_amount').as('total_refund_amount'),
        db.ref('r.refund_method').as('refund_method'),
        db.raw(`COALESCE(ri_counts.item_count, 0) AS item_count`),
        db.ref('r.notes').as('notes')
      )
      .orderBy('r.created_at', 'desc')) as Array<Record<string, unknown>>;

    // Fetch customer names separately to avoid a complex join
    const customerIds = rows
      .map((r) => r['customerId'] as string | null)
      .filter((id): id is string => !!id);

    const customerMap = new Map<string, string>();
    if (customerIds.length > 0) {
      const customers = await db('customers').whereIn('id', customerIds).select('id', 'name');
      for (const c of customers) customerMap.set(c.id, c.name);
    }

    return rows.map((r) => ({
      returnNumber: r['returnNumber'] as string,
      date: r['date'] as string,
      originalInvoiceNumber: r['originalInvoiceNumber'] as string,
      customerName: r['customerId'] ? (customerMap.get(r['customerId'] as string) ?? null) : null,
      processedBy: r['processedBy'] as string,
      totalRefundAmount: Number(r['totalRefundAmount']),
      refundMethod: r['refundMethod'] as string,
      itemCount: Number(r['itemCount']),
      notes: (r['notes'] as string | null) ?? null,
    }));
  },

  // ── Staff performance report ──────────────────────────────────────────────────

  async getStaffReport(storeId: string, filter: ReportDateFilter = {}): Promise<StaffReportRow[]> {
    const invQb = db('invoices as inv')
      .where('inv.store_id', storeId)
      .whereNotIn('inv.status', ['CANCELLED']);

    if (filter.from) invQb.whereRaw(`DATE(inv.created_at) >= ?`, [filter.from]);
    if (filter.to)   invQb.whereRaw(`DATE(inv.created_at) <= ?`, [filter.to]);

    const salesRows = (await invQb
      .groupBy('inv.cashier_id')
      .select(
        db.ref('inv.cashier_id').as('cashier_id'),
        db.raw('COUNT(*) AS invoice_count'),
        db.raw('COALESCE(SUM(inv.grand_total), 0) AS total_revenue'),
        db.raw('COALESCE(SUM(inv.discount_amount), 0) AS total_discount')
      )) as Array<Record<string, unknown>>;

    const retQb = db('returns as r').where('r.store_id', storeId);
    if (filter.from) retQb.whereRaw(`DATE(r.created_at) >= ?`, [filter.from]);
    if (filter.to)   retQb.whereRaw(`DATE(r.created_at) <= ?`, [filter.to]);

    const retRows = (await retQb
      .groupBy('r.processed_by')
      .select('r.processed_by as cashier_id', db.raw('COUNT(*) AS returns_processed'))
    ) as Array<Record<string, unknown>>;

    const retMap = new Map(retRows.map((r) => [r['cashierId'] as string, Number(r['returnsProcessed'])]));

    // Fetch user details
    const staffIds = salesRows.map((r) => r['cashierId'] as string);
    const staffMap = new Map<string, { name: string; role: string }>();
    if (staffIds.length > 0) {
      const users = await db('users').whereIn('id', staffIds).select('id', 'name', 'role');
      for (const u of users) staffMap.set(u.id, { name: u.name, role: u.role });
    }

    return salesRows.map((r) => {
      const cashierId = r['cashierId'] as string;
      const staff = staffMap.get(cashierId);
      const invoiceCount = Number(r['invoiceCount']);
      const totalRevenue = Number(r['totalRevenue']);
      return {
        staffName: staff?.name ?? 'Unknown',
        role: staff?.role ?? 'UNKNOWN',
        invoiceCount,
        totalRevenue,
        totalDiscount: Number(r['totalDiscount']),
        avgOrderValue: invoiceCount > 0 ? totalRevenue / invoiceCount : 0,
        returnsProcessed: retMap.get(cashierId) ?? 0,
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
  },
};
