/**
 * ReportsService — Week 5 core reports.
 *
 * Provides 5 report types, each returning an array of rows that the router
 * serialises to JSON or converts to CSV/Excel via the xlsx library.
 *
 * All queries are scoped to store_id and accept optional date-range filters.
 */

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
  supplierName: string;
  supplierCode: string;
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

// ─── Service ──────────────────────────────────────────────────────────────────

export const ReportsService = {

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
        db.ref('s.name').as('supplier_name'),
        db.ref('s.code').as('supplier_code'),
        db.raw('COUNT(i.id) AS total_units_received'),
        db.raw('COALESCE(SUM(i.purchase_cost_price), 0) AS total_cost_value'),
        db.raw(`COUNT(i.id) FILTER (WHERE i.status IN ('IN_STOCK', 'RETURNED_TO_STOCK')) AS current_in_stock`),
        db.raw(`COALESCE(SUM(i.purchase_cost_price) FILTER (WHERE i.status IN ('IN_STOCK', 'RETURNED_TO_STOCK')), 0) AS current_stock_value`),
        db.raw('MAX(i.purchase_date) AS last_delivery_date')
      )
      .orderBy('total_units_received', 'desc')) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      supplierName: r['supplierName'] as string,
      supplierCode: r['supplierCode'] as string,
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
