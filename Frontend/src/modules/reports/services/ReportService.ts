/**
 * ReportService — every report is built from the backend (PostgreSQL).
 *
 * The first `storeId` argument is kept so existing callers do not change; the
 * server derives the store from the caller's token, so it is not sent.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  DateRangePreset,
  ReportFilter,
  SalesReportSummary,
  InventoryValuationSummary,
  StockAgeingSummary,
  SupplierPerformanceSummary,
  ReturnsReportSummary,
  StaffActivitySummary,
} from '../types';

/** One row of GET /api/reports/inventory. */
interface InventoryRow {
  barcode: string;
  productId: string;
  productSku: string;
  productName: string;
  variantSku: string;
  categoryId: string | null;
  supplierId: string | null;
  categoryName: string | null;
  status: string;
  purchaseCostPrice: number;
  sellingPrice: number;
  ageDays: number;
}

const AVAILABLE = new Set(['IN_STOCK', 'RETURNED_TO_STOCK']);

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive YYYY-MM-DD bounds for a preset; ALL_TIME has no bounds. */
export function getDateRange(preset: DateRangePreset, now: Date = new Date()): { from?: string; to?: string } {
  const to = isoDate(now);
  const back = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return isoDate(d);
  };
  switch (preset) {
    case 'TODAY':
      return { from: to, to };
    case 'LAST_7_DAYS':
      return { from: back(7), to };
    case 'LAST_30_DAYS':
      return { from: back(30), to };
    case 'LAST_90_DAYS':
      return { from: back(90), to };
    case 'THIS_MONTH':
      return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case 'ALL_TIME':
    default:
      return {};
  }
}

function matchesFilter(row: InventoryRow, filter?: ReportFilter): boolean {
  if (filter?.categoryId && row.categoryId !== filter.categoryId) return false;
  if (filter?.supplierId && row.supplierId !== filter.supplierId) return false;
  return true;
}

async function loadInventoryRows(filter?: ReportFilter): Promise<InventoryRow[]> {
  const { rows } = await apiClient.get<{ rows: InventoryRow[] }>('/api/reports/inventory');
  return rows.filter((r) => matchesFilter(r, filter));
}

export const ReportService = {
  async getSalesReport(_storeId: string, filter?: ReportFilter): Promise<SalesReportSummary> {
    const range = filter?.startDate || filter?.endDate
      ? { from: filter.startDate, to: filter.endDate }
      : getDateRange(filter?.datePreset ?? 'ALL_TIME');
    return apiClient.get<SalesReportSummary>('/api/reports/sales/summary', {
      query: { ...range, categoryId: filter?.categoryId, supplierId: filter?.supplierId },
    });
  },

  async getInventoryValuationReport(_storeId: string, filter?: ReportFilter): Promise<InventoryValuationSummary> {
    const rows = await loadInventoryRows(filter);

    let available = 0, sold = 0, damaged = 0, returned = 0, missing = 0;
    let costTotal = 0, retailTotal = 0;
    const byCategory = new Map<string, { inStock: number; costValue: number; retailValue: number; profit: number }>();
    const byProduct = new Map<string, InventoryValuationSummary['itemsByProduct'][number]>();

    for (const item of rows) {
      const cost = Number(item.purchaseCostPrice) || 0;
      const price = Number(item.sellingPrice) || 0;

      if (AVAILABLE.has(item.status)) {
        available++;
        if (item.status === 'RETURNED_TO_STOCK') returned++;
        costTotal += cost;
        retailTotal += price;

        const categoryName = item.categoryName || 'Uncategorised';
        const cat = byCategory.get(categoryName) ?? { inStock: 0, costValue: 0, retailValue: 0, profit: 0 };
        cat.inStock++;
        cat.costValue += cost;
        cat.retailValue += price;
        cat.profit += price - cost;
        byCategory.set(categoryName, cat);

        const prod = byProduct.get(item.productId) ?? {
          productId: item.productId,
          productName: item.productName,
          sku: item.productSku,
          categoryName,
          inStock: 0,
          costValue: 0,
          retailValue: 0,
          potentialProfit: 0,
          status: 'IN_STOCK',
        };
        prod.inStock++;
        prod.costValue += cost;
        prod.retailValue += price;
        prod.potentialProfit += price - cost;
        byProduct.set(item.productId, prod);
      } else if (item.status === 'SOLD') sold++;
      else if (item.status === 'DAMAGED' || item.status === 'RETURNED_DAMAGED') damaged++;
      else if (item.status === 'LOST') missing++;
    }

    const profit = retailTotal - costTotal;
    return {
      totalStockQuantity: available,
      totalStockCostValue: costTotal,
      totalStockRetailValue: retailTotal,
      potentialGrossProfit: profit,
      potentialMarginPercent: retailTotal > 0 ? (profit / retailTotal) * 100 : 0,
      availableItemsCount: available,
      soldItemsCount: sold,
      damagedItemsCount: damaged,
      returnedItemsCount: returned,
      missingItemsCount: missing,
      itemsByCategory: Array.from(byCategory.entries()).map(([categoryName, d]) => ({ categoryName, ...d })),
      itemsByProduct: Array.from(byProduct.values()).sort((a, b) => b.costValue - a.costValue),
    };
  },

  async getStockAgeingReport(_storeId: string, filter?: ReportFilter): Promise<StockAgeingSummary> {
    const rows = (await loadInventoryRows(filter)).filter((r) => AVAILABLE.has(r.status));

    const bins = {
      age0To30Days: { count: 0, value: 0 },
      age31To60Days: { count: 0, value: 0 },
      age61To90Days: { count: 0, value: 0 },
      ageOver90Days: { count: 0, value: 0 },
    };
    const perProduct = new Map<string, { name: string; sku: string; oldest: number; count: number; value: number }>();

    for (const r of rows) {
      const age = Math.max(0, Number(r.ageDays) || 0);
      const cost = Number(r.purchaseCostPrice) || 0;
      const bin =
        age <= 30 ? bins.age0To30Days : age <= 60 ? bins.age31To60Days : age <= 90 ? bins.age61To90Days : bins.ageOver90Days;
      bin.count++;
      bin.value += cost;

      const p = perProduct.get(r.productId) ?? { name: r.productName, sku: r.productSku, oldest: 0, count: 0, value: 0 };
      p.oldest = Math.max(p.oldest, age);
      p.count++;
      p.value += cost;
      perProduct.set(r.productId, p);
    }

    return {
      totalStockCount: rows.length,
      bins,
      slowMovingProducts: Array.from(perProduct.entries())
        .map(([productId, p]) => ({
          productId,
          productName: p.name,
          sku: p.sku,
          oldestItemAgeDays: p.oldest,
          inStock: p.count,
          costValue: p.value,
          riskTier: (p.oldest > 90 ? 'HIGH' : p.oldest > 60 ? 'MEDIUM' : 'LOW') as 'LOW' | 'MEDIUM' | 'HIGH',
        }))
        .sort((a, b) => b.oldestItemAgeDays - a.oldestItemAgeDays),
    };
  },

  async getSupplierPerformanceReport(_storeId: string): Promise<SupplierPerformanceSummary> {
    const { rows } = await apiClient.get<{
      rows: Array<{
        supplierId: string;
        supplierName: string;
        supplierCode: string;
        totalProductsSupplied: number;
        itemsSold: number;
        totalUnitsReceived: number;
        totalCostValue: number;
        currentInStock: number;
      }>;
    }>('/api/reports/suppliers');

    return {
      suppliers: rows.map((r) => ({
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        code: r.supplierCode,
        totalProductsSupplied: r.totalProductsSupplied,
        totalItemsPurchased: r.totalUnitsReceived,
        totalSpendAmount: r.totalCostValue,
        currentStockOnHand: r.currentInStock,
        itemsSold: r.itemsSold,
        sellThroughRate: r.totalUnitsReceived > 0 ? (r.itemsSold / r.totalUnitsReceived) * 100 : 0,
      })),
    };
  },

  async getReturnsReport(_storeId: string, filter?: ReportFilter): Promise<ReturnsReportSummary> {
    return apiClient.get<ReturnsReportSummary>('/api/reports/returns/summary', {
      query: getDateRange(filter?.datePreset ?? 'ALL_TIME'),
    });
  },

  async getStaffActivityReport(_storeId: string): Promise<StaffActivitySummary> {
    return apiClient.get<StaffActivitySummary>('/api/reports/staff/activity');
  },
};
