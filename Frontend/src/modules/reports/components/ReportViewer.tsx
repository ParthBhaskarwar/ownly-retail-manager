'use client';

import React, { useEffect, useState } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { CategoryService, SupplierService } from '@/modules/catalog/services/CategoryService';
import { ReportService } from '../services/ReportService';
import { ExportService } from '../services/ExportService';
import type {
  ReportType,
  DateRangePreset,
  SalesReportSummary,
  InventoryValuationSummary,
  StockAgeingSummary,
  SupplierPerformanceSummary,
  ReturnsReportSummary,
  StaffActivitySummary,
} from '../types';
import type { Category, Supplier } from '@/modules/catalog/types';

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function ReportViewer() {
  const { user } = useAuthContext();
  const { store } = useStoreContext();
  const storeId = store?.id || user?.storeId || '';

  const [activeTab, setActiveTab] = useState<ReportType>('SALES_PROFIT');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('ALL_TIME');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [salesData, setSalesData] = useState<SalesReportSummary | null>(null);
  const [valuationData, setValuationData] = useState<InventoryValuationSummary | null>(null);
  const [ageingData, setAgeingData] = useState<StockAgeingSummary | null>(null);
  const [supplierData, setSupplierData] = useState<SupplierPerformanceSummary | null>(null);
  const [returnsData, setReturnsData] = useState<ReturnsReportSummary | null>(null);
  const [staffData, setStaffData] = useState<StaffActivitySummary | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    CategoryService.getCategories().then(setCategories).catch(() => setCategories([]));
    SupplierService.getSuppliers(storeId).then(setSuppliers).catch(() => setSuppliers([]));
  }, [storeId]);

  useEffect(() => {
    if (!storeId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);

    const filter = {
      datePreset,
      categoryId: selectedCategory || undefined,
      supplierId: selectedSupplier || undefined,
    };

    const load = async () => {
      try {
        if (activeTab === 'SALES_PROFIT') {
          const res = await ReportService.getSalesReport(storeId, filter);
          setSalesData(res);
        } else if (activeTab === 'INVENTORY_VALUATION') {
          const res = await ReportService.getInventoryValuationReport(storeId, filter);
          setValuationData(res);
        } else if (activeTab === 'STOCK_AGEING') {
          const res = await ReportService.getStockAgeingReport(storeId, filter);
          setAgeingData(res);
        } else if (activeTab === 'SUPPLIERS') {
          const res = await ReportService.getSupplierPerformanceReport(storeId);
          setSupplierData(res);
        } else if (activeTab === 'RETURNS') {
          const res = await ReportService.getReturnsReport(storeId, filter);
          setReturnsData(res);
        } else if (activeTab === 'STAFF_ACTIVITY') {
          const res = await ReportService.getStaffActivityReport(storeId);
          setStaffData(res);
        }
      } catch (err) {
        console.error('Failed to load report', err);
        setLoadError(err instanceof Error ? err.message : 'Could not load this report.');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [storeId, activeTab, datePreset, selectedCategory, selectedSupplier]);

  const handleExportCsv = () => {
    const filename = `ownly-${activeTab.toLowerCase()}-${datePreset.toLowerCase()}`;

    if (activeTab === 'SALES_PROFIT' && salesData) {
      const headers = ['Product Name', 'SKU', 'Units Sold', 'Revenue (₹)', 'Cost of Goods (₹)', 'Profit (₹)', 'Margin (%)'];
      const rows = salesData.salesByProduct.map((p) => [
        p.productName,
        p.sku,
        p.unitsSold,
        p.revenue,
        p.revenue - p.profit,
        p.profit,
        p.margin.toFixed(1) + '%',
      ]);
      ExportService.exportToCsv(filename, headers, rows);
    } else if (activeTab === 'INVENTORY_VALUATION' && valuationData) {
      const headers = ['Product Name', 'SKU', 'Category', 'In Stock Units', 'Cost Value (₹)', 'Retail Value (₹)', 'Potential Profit (₹)', 'Status'];
      const rows = valuationData.itemsByProduct.map((p) => [
        p.productName,
        p.sku,
        p.categoryName,
        p.inStock,
        p.costValue,
        p.retailValue,
        p.potentialProfit,
        p.status,
      ]);
      ExportService.exportToCsv(filename, headers, rows);
    } else if (activeTab === 'STOCK_AGEING' && ageingData) {
      const headers = ['Product Name', 'SKU', 'Oldest Item (Days)', 'In Stock', 'Cost Value (₹)', 'Risk Tier'];
      const rows = ageingData.slowMovingProducts.map((p) => [
        p.productName,
        p.sku,
        p.oldestItemAgeDays,
        p.inStock,
        p.costValue,
        p.riskTier,
      ]);
      ExportService.exportToCsv(filename, headers, rows);
    } else if (activeTab === 'SUPPLIERS' && supplierData) {
      const headers = ['Supplier Name', 'Code', 'Products Supplied', 'Purchased Qty', 'Total Spend (₹)', 'In Stock', 'Sold Qty', 'Sell-Through (%)'];
      const rows = supplierData.suppliers.map((s) => [
        s.supplierName,
        s.code,
        s.totalProductsSupplied,
        s.totalItemsPurchased,
        s.totalSpendAmount,
        s.currentStockOnHand,
        s.itemsSold,
        s.sellThroughRate.toFixed(1) + '%',
      ]);
      ExportService.exportToCsv(filename, headers, rows);
    } else if (activeTab === 'RETURNS' && returnsData) {
      const headers = ['Return Metric / Reason', 'Count / Value'];
      const rows = [
        ['Total Returns', returnsData.totalReturnsCount],
        ['Total Refund Amount (₹)', returnsData.totalRefundAmount],
        ['Return Rate (%)', returnsData.returnRatePercent.toFixed(1) + '%'],
        ['Damaged or Defective Items', returnsData.damagedOrDefectiveCount],
        ['Returned to Stock', returnsData.returnedToStockCount],
        ...Object.entries(returnsData.returnsByReason).map(([reason, count]) => [`Reason: ${reason}`, count]),
      ];
      ExportService.exportToCsv(filename, headers, rows);
    } else if (activeTab === 'STAFF_ACTIVITY' && staffData) {
      const headers = ['Staff Name', 'Role', 'Transactions Logged', 'Stock Movements Performed', 'Sales Assisted'];
      const rows = staffData.staffMembers.map((s) => [
        s.name,
        s.role,
        s.totalTransactionsLogged,
        s.stockMovementsPerformed,
        s.salesAssisted,
      ]);
      ExportService.exportToCsv(filename, headers, rows);
    }
  };

  const handleExportExcel = () => {
    const filename = `ownly-${activeTab.toLowerCase()}-${datePreset.toLowerCase()}`;
    const sheetName = activeTab.replace('_', ' ').slice(0, 20);

    if (activeTab === 'SALES_PROFIT' && salesData) {
      const headers = ['Product Name', 'SKU', 'Units Sold', 'Revenue (₹)', 'Cost of Goods (₹)', 'Profit (₹)', 'Margin (%)'];
      const rows = salesData.salesByProduct.map((p) => [
        p.productName,
        p.sku,
        p.unitsSold,
        p.revenue,
        p.revenue - p.profit,
        p.profit,
        p.margin.toFixed(1) + '%',
      ]);
      const summary = [
        ['TOTAL / AVERAGE', '', salesData.totalItemsSold, salesData.totalRevenue, salesData.totalCostOfGoodsSold, salesData.grossProfit, salesData.grossMarginPercent.toFixed(1) + '%'],
      ];
      ExportService.exportToExcel(filename, sheetName, headers, rows, summary);
    } else if (activeTab === 'INVENTORY_VALUATION' && valuationData) {
      const headers = ['Product Name', 'SKU', 'Category', 'In Stock Units', 'Cost Value (₹)', 'Retail Value (₹)', 'Potential Profit (₹)', 'Status'];
      const rows = valuationData.itemsByProduct.map((p) => [
        p.productName,
        p.sku,
        p.categoryName,
        p.inStock,
        p.costValue,
        p.retailValue,
        p.potentialProfit,
        p.status,
      ]);
      const summary = [
        ['TOTAL', '', '', valuationData.totalStockQuantity, valuationData.totalStockCostValue, valuationData.totalStockRetailValue, valuationData.potentialGrossProfit, ''],
      ];
      ExportService.exportToExcel(filename, sheetName, headers, rows, summary);
    } else if (activeTab === 'STOCK_AGEING' && ageingData) {
      const headers = ['Product Name', 'SKU', 'Oldest Item (Days)', 'In Stock', 'Cost Value (₹)', 'Risk Tier'];
      const rows = ageingData.slowMovingProducts.map((p) => [
        p.productName,
        p.sku,
        p.oldestItemAgeDays,
        p.inStock,
        p.costValue,
        p.riskTier,
      ]);
      ExportService.exportToExcel(filename, sheetName, headers, rows);
    } else if (activeTab === 'SUPPLIERS' && supplierData) {
      const headers = ['Supplier Name', 'Code', 'Products Supplied', 'Purchased Qty', 'Total Spend (₹)', 'In Stock', 'Sold Qty', 'Sell-Through (%)'];
      const rows = supplierData.suppliers.map((s) => [
        s.supplierName,
        s.code,
        s.totalProductsSupplied,
        s.totalItemsPurchased,
        s.totalSpendAmount,
        s.currentStockOnHand,
        s.itemsSold,
        s.sellThroughRate.toFixed(1) + '%',
      ]);
      ExportService.exportToExcel(filename, sheetName, headers, rows);
    } else {
      handleExportCsv();
    }
  };

  return (
    <div className="reports-container animate-fade-in">
      <div className="page-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="page-header__left">
          <h1 className="page-header__title">Reports &amp; Analytics</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Analyze sales speed, stock valuation, inventory ageing, supplier performance, and data movements.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            id="export-csv-btn"
            className="btn btn--secondary btn--sm"
            onClick={handleExportCsv}
          >
            📥 CSV Export
          </button>
          <button
            type="button"
            id="export-excel-btn"
            className="btn btn--primary btn--sm"
            onClick={handleExportExcel}
          >
            📊 Excel (.xls)
          </button>
          <button
            type="button"
            id="print-report-btn"
            className="btn btn--ghost btn--sm"
            onClick={() => ExportService.printCurrentView()}
          >
            🖨️ Print
          </button>
        </div>
      </div>

      <div className="filter-tabs" role="tablist" style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {[
          { id: 'SALES_PROFIT', label: '💰 Sales & Profit' },
          { id: 'INVENTORY_VALUATION', label: '📦 Stock Valuation' },
          { id: 'STOCK_AGEING', label: '⏳ Stock Ageing & Dead Stock' },
          { id: 'SUPPLIERS', label: '🏭 Supplier Performance' },
          { id: 'RETURNS', label: '↩️ Returns & Damages' },
          { id: 'STAFF_ACTIVITY', label: '👥 Staff Audit' },
        ].map((tab) => (
          <button
            key={tab.id}
            id={`report-tab-${tab.id.toLowerCase()}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`filter-tab ${activeTab === tab.id ? 'filter-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id as ReportType)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', display: 'block', marginBottom: '2px' }}>
              Date Preset:
            </label>
            <select
              className="form-select form-select--sm"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
            >
              <option value="ALL_TIME">All Time</option>
              <option value="TODAY">Today</option>
              <option value="LAST_7_DAYS">Last 7 Days</option>
              <option value="LAST_30_DAYS">Last 30 Days</option>
              <option value="LAST_90_DAYS">Last 90 Days</option>
              <option value="THIS_MONTH">This Month</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', display: 'block', marginBottom: '2px' }}>
              Category:
            </label>
            <select
              className="form-select form-select--sm"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', display: 'block', marginBottom: '2px' }}>
              Supplier:
            </label>
            <select
              className="form-select form-select--sm"
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
            >
              <option value="">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loadError && !isLoading && (
        <div className="alert alert--error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          {loadError}
        </div>
      )}

      {isLoading ? (
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <div className="skeleton" style={{ height: 32, width: 250, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      ) : (
        <div className="report-body">
          {activeTab === 'SALES_PROFIT' && salesData && (
            <div className="report-section">
              <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', marginBottom: 'var(--space-4)' }}>
                <div className="stat-card card">
                  <div className="stat-card__icon">💰</div>
                  <div className="stat-card__value">{fmt(salesData.totalRevenue)}</div>
                  <div className="stat-card__label">Total Revenue</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__icon">🏷️</div>
                  <div className="stat-card__value">{fmt(salesData.grossProfit)}</div>
                  <div className="stat-card__label">Gross Profit ({salesData.grossMarginPercent.toFixed(1)}%)</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__icon">📦</div>
                  <div className="stat-card__value">{salesData.totalItemsSold}</div>
                  <div className="stat-card__label">Items Sold</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__icon">🧾</div>
                  <div className="stat-card__value">{fmt(salesData.averageBillValue)}</div>
                  <div className="stat-card__label">Average Bill Value</div>
                </div>
              </div>

              <div className="card">
                <div className="card__header">
                  <h2 className="card__title">Sales by Product Design</h2>
                </div>
                {salesData.salesByProduct.length === 0 ? (
                  <p style={{ color: 'var(--color-ink-muted)', padding: 'var(--space-4)' }}>
                    No sale transactions logged for the selected period.
                  </p>
                ) : (
                  <table className="table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Product</th>
                        <th style={{ textAlign: 'left' }}>SKU</th>
                        <th style={{ textAlign: 'center' }}>Units Sold</th>
                        <th style={{ textAlign: 'right' }}>Revenue</th>
                        <th style={{ textAlign: 'right' }}>Gross Profit</th>
                        <th style={{ textAlign: 'right' }}>Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesData.salesByProduct.map((p) => (
                        <tr key={p.sku}>
                          <td><strong>{p.productName}</strong></td>
                          <td><code className="sku-badge">{p.sku}</code></td>
                          <td style={{ textAlign: 'center' }}>{p.unitsSold}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(p.revenue)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--color-paid)', fontWeight: 600 }}>{fmt(p.profit)}</td>
                          <td style={{ textAlign: 'right' }}>{p.margin.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'INVENTORY_VALUATION' && valuationData && (
            <div className="report-section">
              <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', marginBottom: 'var(--space-4)' }}>
                <div className="stat-card card">
                  <div className="stat-card__icon">📦</div>
                  <div className="stat-card__value">{valuationData.totalStockQuantity}</div>
                  <div className="stat-card__label">Physical Stock on Hand</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__icon">💵</div>
                  <div className="stat-card__value">{fmt(valuationData.totalStockCostValue)}</div>
                  <div className="stat-card__label">Total Cost Valuation</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__icon">🏷️</div>
                  <div className="stat-card__value">{fmt(valuationData.totalStockRetailValue)}</div>
                  <div className="stat-card__label">Expected Retail Value</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__icon">📈</div>
                  <div className="stat-card__value">{fmt(valuationData.potentialGrossProfit)}</div>
                  <div className="stat-card__label">Potential Margin ({valuationData.potentialMarginPercent.toFixed(1)}%)</div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                  <div>Available: <strong style={{ color: 'var(--color-paid)' }}>{valuationData.availableItemsCount}</strong></div>
                  <div>Sold: <strong>{valuationData.soldItemsCount}</strong></div>
                  <div>Damaged: <strong style={{ color: 'var(--color-return)' }}>{valuationData.damagedItemsCount}</strong></div>
                  <div>Returned: <strong>{valuationData.returnedItemsCount}</strong></div>
                  <div>Missing: <strong>{valuationData.missingItemsCount}</strong></div>
                </div>
              </div>

              <div className="card">
                <div className="card__header">
                  <h2 className="card__title">Valuation Breakdown by Garment</h2>
                </div>
                <table className="table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Product</th>
                      <th style={{ textAlign: 'left' }}>SKU</th>
                      <th style={{ textAlign: 'left' }}>Category</th>
                      <th style={{ textAlign: 'center' }}>In Stock</th>
                      <th style={{ textAlign: 'right' }}>Cost Value</th>
                      <th style={{ textAlign: 'right' }}>Retail Value</th>
                      <th style={{ textAlign: 'right' }}>Potential Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valuationData.itemsByProduct.map((p) => (
                      <tr key={p.productId}>
                        <td><strong>{p.productName}</strong></td>
                        <td><code className="sku-badge">{p.sku}</code></td>
                        <td>{p.categoryName}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge--neutral">{p.inStock}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmt(p.costValue)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(p.retailValue)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-paid)', fontWeight: 600 }}>{fmt(p.potentialProfit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'STOCK_AGEING' && ageingData && (
            <div className="report-section">
              <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 'var(--space-4)' }}>
                <div className="stat-card card">
                  <div className="stat-card__value">{ageingData.bins.age0To30Days.count}</div>
                  <div className="stat-card__label">0 - 30 Days ({fmt(ageingData.bins.age0To30Days.value)})</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__value">{ageingData.bins.age31To60Days.count}</div>
                  <div className="stat-card__label">31 - 60 Days ({fmt(ageingData.bins.age31To60Days.value)})</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__value" style={{ color: 'var(--color-caution)' }}>
                    {ageingData.bins.age61To90Days.count}
                  </div>
                  <div className="stat-card__label">61 - 90 Days ({fmt(ageingData.bins.age61To90Days.value)})</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__value" style={{ color: 'var(--color-return)' }}>
                    {ageingData.bins.ageOver90Days.count}
                  </div>
                  <div className="stat-card__label">90+ Days / Dead Stock ({fmt(ageingData.bins.ageOver90Days.value)})</div>
                </div>
              </div>

              <div className="card">
                <div className="card__header">
                  <h2 className="card__title">Ageing &amp; Slow-Moving Inventory</h2>
                </div>
                <table className="table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Product</th>
                      <th style={{ textAlign: 'left' }}>SKU</th>
                      <th style={{ textAlign: 'center' }}>Oldest Item Age</th>
                      <th style={{ textAlign: 'center' }}>In Stock</th>
                      <th style={{ textAlign: 'right' }}>Cost Tied Up</th>
                      <th style={{ textAlign: 'center' }}>Risk Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ageingData.slowMovingProducts.map((p) => (
                      <tr key={p.productId}>
                        <td><strong>{p.productName}</strong></td>
                        <td><code className="sku-badge">{p.sku}</code></td>
                        <td style={{ textAlign: 'center' }}>{p.oldestItemAgeDays} days</td>
                        <td style={{ textAlign: 'center' }}>{p.inStock}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(p.costValue)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${p.riskTier === 'HIGH' ? 'badge--return' : p.riskTier === 'MEDIUM' ? 'badge--caution' : 'badge--paid'}`}>
                            {p.riskTier} RISK
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'SUPPLIERS' && supplierData && (
            <div className="report-section card">
              <div className="card__header">
                <h2 className="card__title">Supplier Sourcing &amp; Sell-Through Performance</h2>
              </div>
              <table className="table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Supplier</th>
                    <th style={{ textAlign: 'left' }}>Code</th>
                    <th style={{ textAlign: 'center' }}>Designs Supplied</th>
                    <th style={{ textAlign: 'center' }}>Total Units Purchased</th>
                    <th style={{ textAlign: 'right' }}>Spend (₹)</th>
                    <th style={{ textAlign: 'center' }}>In Stock</th>
                    <th style={{ textAlign: 'center' }}>Units Sold</th>
                    <th style={{ textAlign: 'right' }}>Sell-Through</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierData.suppliers.map((s) => (
                    <tr key={s.supplierId}>
                      <td><strong>{s.supplierName}</strong></td>
                      <td><code className="sku-badge">{s.code}</code></td>
                      <td style={{ textAlign: 'center' }}>{s.totalProductsSupplied}</td>
                      <td style={{ textAlign: 'center' }}>{s.totalItemsPurchased}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(s.totalSpendAmount)}</td>
                      <td style={{ textAlign: 'center' }}>{s.currentStockOnHand}</td>
                      <td style={{ textAlign: 'center' }}>{s.itemsSold}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.sellThroughRate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'RETURNS' && returnsData && (
            <div className="report-section">
              <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', marginBottom: 'var(--space-4)' }}>
                <div className="stat-card card">
                  <div className="stat-card__value">{returnsData.totalReturnsCount}</div>
                  <div className="stat-card__label">Total Returns Logged</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__value">{returnsData.returnRatePercent.toFixed(1)}%</div>
                  <div className="stat-card__label">Return Rate</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__value" style={{ color: 'var(--color-return)' }}>
                    {returnsData.damagedOrDefectiveCount}
                  </div>
                  <div className="stat-card__label">Defective / Damaged Pieces</div>
                </div>
                <div className="stat-card card">
                  <div className="stat-card__value">{fmt(returnsData.totalRefundAmount)}</div>
                  <div className="stat-card__label">Refund Amount</div>
                </div>
              </div>

              <div className="card">
                <div className="card__header">
                  <h2 className="card__title">Return Reasons Distribution</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '16px' }}>
                  {Object.entries(returnsData.returnsByReason).map(([reason, count]) => (
                    <div key={reason} className="stat-pill" style={{ padding: 'var(--space-3)' }}>
                      <span>{reason}</span>
                      <strong>{count} items</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'STAFF_ACTIVITY' && staffData && (
            <div className="report-section card">
              <div className="card__header">
                <h2 className="card__title">Staff Activity &amp; Transaction Ledger</h2>
              </div>
              <table className="table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Staff Member</th>
                    <th style={{ textAlign: 'left' }}>Role</th>
                    <th style={{ textAlign: 'center' }}>Total Transactions</th>
                    <th style={{ textAlign: 'center' }}>Stock Movements Performed</th>
                    <th style={{ textAlign: 'center' }}>Sales Assisted</th>
                  </tr>
                </thead>
                <tbody>
                  {staffData.staffMembers.map((s) => (
                    <tr key={s.staffId}>
                      <td><strong>{s.name}</strong></td>
                      <td><span className="badge badge--denim">{s.role}</span></td>
                      <td style={{ textAlign: 'center' }}>{s.totalTransactionsLogged}</td>
                      <td style={{ textAlign: 'center' }}>{s.stockMovementsPerformed}</td>
                      <td style={{ textAlign: 'center' }}>{s.salesAssisted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
