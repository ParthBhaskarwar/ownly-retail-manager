/**
 * Reports and Export Types
 */

export type ReportType =
  | 'SALES_PROFIT'
  | 'INVENTORY_VALUATION'
  | 'STOCK_AGEING'
  | 'SUPPLIERS'
  | 'RETURNS'
  | 'STAFF_ACTIVITY';

export type DateRangePreset = 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_MONTH' | 'ALL_TIME';

export interface ReportFilter {
  datePreset: DateRangePreset;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  supplierId?: string;
  status?: string;
  searchTerm?: string;
}

export interface SalesReportSummary {
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

export interface InventoryValuationSummary {
  totalStockQuantity: number;
  totalStockCostValue: number;
  totalStockRetailValue: number;
  potentialGrossProfit: number;
  potentialMarginPercent: number;
  availableItemsCount: number;
  soldItemsCount: number;
  damagedItemsCount: number;
  returnedItemsCount: number;
  missingItemsCount: number;
  itemsByCategory: Array<{ categoryName: string; inStock: number; costValue: number; retailValue: number; profit: number }>;
  itemsByProduct: Array<{
    productId: string;
    productName: string;
    sku: string;
    categoryName: string;
    inStock: number;
    costValue: number;
    retailValue: number;
    potentialProfit: number;
    status: string;
  }>;
}

export interface StockAgeingSummary {
  totalStockCount: number;
  bins: {
    age0To30Days: { count: number; value: number };
    age31To60Days: { count: number; value: number };
    age61To90Days: { count: number; value: number };
    ageOver90Days: { count: number; value: number };
  };
  slowMovingProducts: Array<{
    productId: string;
    productName: string;
    sku: string;
    oldestItemAgeDays: number;
    inStock: number;
    costValue: number;
    riskTier: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
}

export interface SupplierPerformanceSummary {
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    code: string;
    totalProductsSupplied: number;
    totalItemsPurchased: number;
    totalSpendAmount: number;
    currentStockOnHand: number;
    itemsSold: number;
    sellThroughRate: number;
  }>;
}

export interface ReturnsReportSummary {
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

export interface StaffActivitySummary {
  staffMembers: Array<{
    staffId: string;
    name: string;
    role: string;
    totalTransactionsLogged: number;
    stockMovementsPerformed: number;
    salesAssisted: number;
  }>;
}
