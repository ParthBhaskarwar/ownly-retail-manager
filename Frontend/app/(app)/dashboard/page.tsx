'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { StoreService } from '@/modules/store/services/StoreService';
import { OnboardingChecklist } from '@/modules/store/components/OnboardingChecklist';
import { RestockRemindersCard } from '@/modules/restock/components/RestockRemindersCard';
import { AiOverviewCard } from '@/modules/ai/components/AiOverviewCard';
import { evaluatePermission } from '@/config/permissions';
import type { Role } from '@/modules/account/types';
import { ReportService } from '@/modules/reports/services/ReportService';
import { BackupService, getBackupStatus } from '@/modules/backup/services/BackupService';
import { apiClient } from '@/lib/apiClient';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import type { OnboardingStep } from '@/modules/store/types';
import type { SalesReportSummary, InventoryValuationSummary, StockAgeingSummary } from '@/modules/reports/types';
import type { BackupStatus } from '@/modules/backup/types';

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}


export default function DashboardPage() {
  const { user } = useAuthContext();
  const { store } = useStoreContext();
  const storeId = user?.storeId || store?.id || '';

  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [salesReport, setSalesReport] = useState<SalesReportSummary | null>(null);
  const [valuation, setValuation] = useState<InventoryValuationSummary | null>(null);
  const [ageing, setAgeing] = useState<StockAgeingSummary | null>(null);
  const [storageHealth, setStorageHealth] = useState<BackupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showBanner, setShowBanner] = useState(true);

  const role = user?.role as Role | undefined;
  const can = (key: Parameters<typeof evaluatePermission>[1]) => !!role && evaluatePermission(role, key);
  const canReports = can('reports:view');
  // Only while something required is still outstanding; a finished checklist is just noise.
  const needsSetup = steps.some((st) => !st.completed && !st.optional && st.key !== 'setup_complete');
  const showChecklist = role === 'OWNER' && !store?.setupCompleted && needsSetup;
  const ageTotal = ageing
    ? ageing.bins.age0To30Days.count + ageing.bins.age31To60Days.count + ageing.bins.age61To90Days.count + ageing.bins.ageOver90Days.count
    : 0;
  const pct = (n: number) => (ageTotal > 0 ? (n / ageTotal) * 100 : 0);

  const [stats, setStats] = useState({
    todaySales: 0,
    ordersToday: 0,
    totalProducts: 0,
    inStockItems: 0,
    returnsCount: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const loadSteps = async () => {
      try {
        const onboarding = await StoreService.fetchOnboardingState();
        const s = StoreService.getOnboardingSteps(user.id, store, user, onboarding.staffAdded);
        setSteps(s);
      } catch {
        const s = StoreService.getOnboardingSteps(user.id, store, user);
        setSteps(s);
      }
    };
    loadSteps();

    const loadDashboardData = async () => {
      try {
        const data = await apiClient.get<{
          salesKpi?: { todayRevenue?: number; todayOrders?: number };
          stockKpi?: { totalProducts?: number; totalInStock?: number; returnsToday?: number };
          recentInvoices?: any[];
        }>('/api/dashboard/summary');

        setStats({
          todaySales: data.salesKpi?.todayRevenue ?? 0,
          ordersToday: data.salesKpi?.todayOrders ?? 0,
          totalProducts: data.stockKpi?.totalProducts ?? 0,
          inStockItems: data.stockKpi?.totalInStock ?? 0,
          returnsCount: data.stockKpi?.returnsToday ?? 0,
        });

        setRecentInvoices(data.recentInvoices ?? []);
      } catch (e) {
        console.error('[DASHBOARD_DATA_ERROR]', e);
      }
    };

    loadDashboardData();
  }, [user, store]);

  useEffect(() => {
    if (!storeId) return;
    let isMounted = true;
    setIsLoading(true);

    const role = user?.role as Role | undefined;
    const canReports = !!role && evaluatePermission(role, 'reports:view');
    const canBackup = !!role && evaluatePermission(role, 'settings:edit');

    Promise.allSettled([
      canReports ? ReportService.getSalesReport(storeId) : Promise.resolve(null),
      canReports ? ReportService.getInventoryValuationReport(storeId) : Promise.resolve(null),
      canReports ? ReportService.getStockAgeingReport(storeId) : Promise.resolve(null),
      canBackup ? BackupService.getHealth() : Promise.resolve(null),
    ])
      .then(([s, v, a, h]) => {
        if (!isMounted) return;
        if (s.status === 'fulfilled') setSalesReport(s.value);
        if (v.status === 'fulfilled') setValuation(v.value);
        if (a.status === 'fulfilled') setAgeing(a.value);
        if (h.status === 'fulfilled' && h.value) setStorageHealth(getBackupStatus(h.value.latestBackupAt));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [storeId, user?.role]);

  return (
    <PermissionGuard permissionKey="dashboard:view">
      <div className="dash-container animate-fade-in-up">
        
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Shop Overview &amp; Daily Register</h1>
            <p className="dash-subtitle">Real-time sales, inventory alerts, and quick actions for {store?.name || 'Store'}.</p>
          </div>
          <div className="dash-actions">
            {can('inventory:edit') && <Link href="/products/new" className="dash-btn dash-btn-outline">
              <span className="material-symbols-outlined" style={{color: 'var(--color-ink-secondary)'}}>add</span>
              Add Product
            </Link>}
            {can('inventory:edit') && <Link href="/restock" className="dash-btn dash-btn-outline">
              <span className="material-symbols-outlined" style={{color: 'var(--color-ink-secondary)'}}>move_to_inbox</span>
              Restock Inward
            </Link>}
            {can('inventory:view') && <Link href="/inventory" className="dash-btn dash-btn-outline">
              <span className="material-symbols-outlined" style={{color: 'var(--color-ink-secondary)'}}>checklist</span>
              Inventory Count
            </Link>}
            {canReports && <Link href="/reports" className="dash-btn dash-btn-outline">
              <span className="material-symbols-outlined" style={{color: 'var(--color-ink-secondary)'}}>bar_chart</span>
              View Reports
            </Link>}
            {can('billing:create') && <Link href="/billing" className="dash-btn dash-btn-primary">
              <span className="material-symbols-outlined">point_of_sale</span>
              New Sale (POS)
            </Link>}
          </div>
        </div>

        {can('settings:edit') && storageHealth?.backupDue && showBanner && (
          <div className="dash-banner">
            <div className="dash-banner-left">
              <span className="material-symbols-outlined" style={{color: 'var(--color-caution)'}}>shield</span>
              <div className="dash-banner-text">
                <strong>System Backup Due:</strong> Your store data has not been backed up recently. Weekly backups are recommended.
              </div>
            </div>
            <div className="dash-banner-actions">
              <Link href="/backup" className="dash-banner-btn">
                <span className="material-symbols-outlined" style={{fontSize: '16px'}}>cloud_upload</span>
                Create Backup Now
              </Link>
              <button className="dash-banner-close" onClick={() => setShowBanner(false)} aria-label="Dismiss Banner">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>
        )}

        {showChecklist && steps.length > 0 && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <OnboardingChecklist steps={steps} />
          </div>
        )}

        <div className="dash-kpi-grid">
          <div className="dash-kpi-card">
            <div className="dash-kpi-header">
              <span className="dash-kpi-title">Today&apos;s Sales</span>
              <span className="material-symbols-outlined">payments</span>
            </div>
            <div>
              <div className="dash-kpi-value">{fmt(stats.todaySales || 0)}</div>
            </div>
          </div>

          <div className="dash-kpi-card">
            <div className="dash-kpi-header">
              <span className="dash-kpi-title">Orders Today</span>
              <span className="material-symbols-outlined">receipt</span>
            </div>
            <div>
              <div className="dash-kpi-value">{stats.ordersToday || 0} <span>bills</span></div>
            </div>
          </div>

          {canReports && <div className="dash-kpi-card">
            <div className="dash-kpi-header">
              <span className="dash-kpi-title">Gross Profit</span>
              <span className="material-symbols-outlined">account_balance_wallet</span>
            </div>
            <div>
              <div className="dash-kpi-value">{fmt(salesReport?.grossProfit || 0)}</div>
              <div className="dash-kpi-trend positive">
                {salesReport?.grossMarginPercent ? salesReport.grossMarginPercent.toFixed(1) : '0.0'}% realized margin
              </div>
            </div>
          </div>}

          <div className="dash-kpi-card">
            <div className="dash-kpi-header">
              <span className="dash-kpi-title">In-Stock Units</span>
              <span className="material-symbols-outlined">inventory_2</span>
            </div>
            <div>
              <div className="dash-kpi-value">{stats.inStockItems || 0} <span>pcs</span></div>
              <div className="dash-kpi-desc">Across {stats.totalProducts || 0} SKUs</div>
            </div>
          </div>

          {canReports && <div className="dash-kpi-card">
            <div className="dash-kpi-header">
              <span className="dash-kpi-title">Stock Value (Cost)</span>
              <span className="material-symbols-outlined">savings</span>
            </div>
            <div>
              <div className="dash-kpi-value">{fmt(valuation?.totalStockCostValue || 0)}</div>
            </div>
          </div>}
        </div>

        <div className="dash-layout-grid">
          <div className="dash-col-7">
            <RestockRemindersCard storeId={storeId} />
          </div>

          <div className="dash-col-5">
            {canReports && <div className="dash-card">
              <div className="dash-card-header">
                <div>
                  <h2 className="dash-card-title">Stock Ageing Analysis</h2>
                </div>
                <span className="dash-card-subtitle">Total: {ageTotal} pcs</span>
              </div>
              <div className="dash-card-body">
                <div className="dash-ageing-bar">
                  <div style={{width: pct(ageing?.bins.age0To30Days.count || 0) + '%', backgroundColor: 'var(--color-paid)'}}></div>
                  <div style={{width: pct(ageing?.bins.age31To60Days.count || 0) + '%', backgroundColor: 'var(--color-denim)'}}></div>
                  <div style={{width: pct(ageing?.bins.age61To90Days.count || 0) + '%', backgroundColor: 'var(--color-caution)'}}></div>
                  <div style={{width: pct(ageing?.bins.ageOver90Days.count || 0) + '%', backgroundColor: 'var(--color-return)'}}></div>
                </div>
                
                <div className="dash-ageing-row">
                  <div className="dash-ageing-label">
                    <span className="dash-ageing-dot" style={{backgroundColor: 'var(--color-paid)'}}></span>
                    <span style={{fontWeight: 500}}>0 - 30 Days</span>
                  </div>
                  <div>
                    <span style={{fontWeight: 600}}>{ageing?.bins.age0To30Days.count || 0} pcs</span> ({fmt(ageing?.bins.age0To30Days.value || 0)})
                  </div>
                </div>

                <div className="dash-ageing-row">
                  <div className="dash-ageing-label">
                    <span className="dash-ageing-dot" style={{backgroundColor: 'var(--color-denim)'}}></span>
                    <span style={{fontWeight: 500}}>31 - 60 Days</span>
                  </div>
                  <div>
                    <span style={{fontWeight: 600}}>{ageing?.bins.age31To60Days.count || 0} pcs</span> ({fmt(ageing?.bins.age31To60Days.value || 0)})
                  </div>
                </div>

                <div className="dash-ageing-row">
                  <div className="dash-ageing-label">
                    <span className="dash-ageing-dot" style={{backgroundColor: 'var(--color-caution)'}}></span>
                    <span style={{fontWeight: 500}}>61 - 90 Days</span>
                  </div>
                  <div>
                    <span style={{fontWeight: 600}}>{ageing?.bins.age61To90Days.count || 0} pcs</span> ({fmt(ageing?.bins.age61To90Days.value || 0)})
                  </div>
                </div>

                <div className="dash-ageing-row">
                  <div className="dash-ageing-label">
                    <span className="dash-ageing-dot" style={{backgroundColor: 'var(--color-return)'}}></span>
                    <span style={{fontWeight: 500}}>90+ Days (Dead Stock Risk)</span>
                  </div>
                  <div>
                    <span style={{fontWeight: 600, color: 'var(--color-return)'}}>{ageing?.bins.ageOver90Days.count || 0} pcs</span> ({fmt(ageing?.bins.ageOver90Days.value || 0)})
                  </div>
                </div>

                {ageing && ageing.slowMovingProducts.length > 0 && (
                  <div className="dash-ageing-warning">
                    <span className="material-symbols-outlined" style={{color: 'var(--color-caution)', fontSize: '18px'}}>hourglass_bottom</span>
                    <div style={{fontSize: '12px', color: 'var(--color-ink-secondary)'}}>
                      <span style={{fontWeight: 600, color: 'var(--color-ink)'}}>Oldest active SKU:</span> {ageing.slowMovingProducts[0].productName} — in inventory for <span style={{fontWeight: 600, color: 'var(--color-return)'}}>{ageing.slowMovingProducts[0].oldestItemAgeDays} days</span>.
                    </div>
                  </div>
                )}
              </div>
            </div>}

            {user && evaluatePermission(user.role as Role, 'reports:view') && <AiOverviewCard />}

          </div>
        </div>

        {canReports && <div className="dash-card">
          <div className="dash-card-header">
            <div>
              <h2 className="dash-card-title">Top-Selling Garments</h2>
              <p className="dash-card-subtitle" style={{marginTop: '4px'}}>Ranked by sales revenue across all billing history.</p>
            </div>
          </div>
          
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Garment &amp; Variant</th>
                  <th>SKU</th>
                  <th style={{textAlign: 'center'}}>Units Sold</th>
                  <th style={{textAlign: 'right'}}>Revenue</th>
                  <th style={{textAlign: 'right'}}>Gross Profit</th>
                  <th style={{textAlign: 'right'}}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {salesReport && salesReport.salesByProduct.length > 0 ? (
                  salesReport.salesByProduct.slice(0, 5).map((p) => (
                    <tr key={p.sku}>
                      <td>
                        <div style={{fontWeight: 600, color: 'var(--color-ink)'}}>{p.productName}</div>
                      </td>
                      <td style={{color: 'var(--color-ink-secondary)', fontSize: '12px'}}>{p.sku}</td>
                      <td style={{textAlign: 'center', fontWeight: 500}}>{p.unitsSold}</td>
                      <td style={{textAlign: 'right', fontWeight: 600}}>{fmt(p.revenue)}</td>
                      <td style={{textAlign: 'right', color: 'var(--color-ink-secondary)'}}>{fmt(p.profit)}</td>
                      <td style={{textAlign: 'right'}}>
                        <span className="dash-status-pill success">{p.margin.toFixed(1)}%</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{textAlign: 'center', color: 'var(--color-ink-muted)', padding: '32px'}}>
                      No sales yet. Scan a product barcode in POS Billing to make your first sale.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>}
      </div>
    </PermissionGuard>
  );
}
