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

  const showChecklist = !store?.setupCompleted;

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
        // fall back to basic steps without staff info
        const s = StoreService.getOnboardingSteps(user.id, store, user);
        setSteps(s);
      }
    };
    loadSteps();

    // Load dashboard stats from the backend API (PostgreSQL)
    const loadDashboardData = async () => {
      try {
        // apiClient attaches the token and unwraps errors; a failure just leaves zeros.
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

    // Each panel loads on its own and only for roles that may see it, so one
    // 403 (e.g. a cashier has no reports access) cannot blank the others.
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
      <div className="dashboard animate-fade-in-up">
        <div className="dashboard__welcome" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 className="dashboard__greeting" style={{ margin: 0 }}>
              Welcome back, <span className="gradient-text">{user?.name?.split(' ')[0]}</span> 👋
            </h1>
            {store && <p className="dashboard__store-name" style={{ margin: '4px 0 0' }}>{store.name} — Retail Operations</p>}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Link href="/products/new" id="dash-quick-add" className="btn btn--primary btn--sm">
              + Add Product
            </Link>
            <Link href="/restock" id="dash-quick-restock" className="btn btn--secondary btn--sm">
              ⚡ Restock
            </Link>
            <Link href="/inventory" id="dash-quick-inventory" className="btn btn--secondary btn--sm">
              ▦ Inventory
            </Link>
            <Link href="/reports" id="dash-quick-reports" className="btn btn--secondary btn--sm">
              📊 Reports
            </Link>
            <Link href="/backup" id="dash-quick-backup" className="btn btn--ghost btn--sm">
              💾 Backup
            </Link>
          </div>
        </div>

        {storageHealth?.backupDue && (
          <div className="alert alert--warning" style={{ margin: 'var(--space-4) 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <strong>⚠️ Backup Reminder:</strong> Your store data has not been backed up recently. Protect your inventory and sales data offline.
              </div>
              <Link href="/backup" className="btn btn--primary btn--sm">
                Create Backup Now →
              </Link>
            </div>
          </div>
        )}

        {showChecklist && steps.length > 0 && (
          <div className="dashboard__onboarding" style={{ margin: 'var(--space-4) 0' }}>
            <OnboardingChecklist steps={steps} />
          </div>
        )}

        <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', margin: 'var(--space-5) 0' }}>
          <div className="stat-card card">
            <div className="stat-card__icon">💰</div>
            <div className="stat-card__value">{fmt(salesReport?.totalRevenue || 0)}</div>
            <div className="stat-card__label">Total Sales Revenue</div>
          </div>

          <div className="stat-card card">
            <div className="stat-card__icon">🏷️</div>
            <div className="stat-card__value" style={{ color: 'var(--color-paid)' }}>
              {fmt(salesReport?.grossProfit || 0)}
            </div>
            <div className="stat-card__label">
              Gross Profit ({salesReport?.grossMarginPercent ? salesReport.grossMarginPercent.toFixed(1) : '0.0'}% margin)
            </div>
          </div>

          <div className="stat-card card">
            <div className="stat-card__icon">📦</div>
            <div className="stat-card__value">{valuation?.totalStockQuantity || 0}</div>
            <div className="stat-card__label">In-Stock Physical Units</div>
          </div>

          <div className="stat-card card">
            <div className="stat-card__icon">💵</div>
            <div className="stat-card__value">{fmt(valuation?.totalStockCostValue || 0)}</div>
            <div className="stat-card__label">Stock Valuation (Cost)</div>
          </div>
        </div>

        {user && evaluatePermission(user.role as Role, 'reports:view') && <AiOverviewCard />}

        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
          <div>
            <RestockRemindersCard storeId={storeId} />
          </div>

          <div className="card">
            <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="card__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏳</span> Stock Ageing Distribution
              </h2>
              <Link href="/reports" className="btn btn--ghost btn--sm">
                Full Report →
              </Link>
            </div>

            <div style={{ marginTop: 'var(--space-3)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: 'var(--space-4)' }}>
                <div className="stat-pill" style={{ padding: 'var(--space-3)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>0 - 30 Days (Fresh)</div>
                    <strong style={{ fontSize: 'var(--text-lg)' }}>{ageing?.bins.age0To30Days.count || 0} units</strong>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-paid)' }}>{fmt(ageing?.bins.age0To30Days.value || 0)}</span>
                </div>

                <div className="stat-pill" style={{ padding: 'var(--space-3)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>31 - 60 Days (Steady)</div>
                    <strong style={{ fontSize: 'var(--text-lg)' }}>{ageing?.bins.age31To60Days.count || 0} units</strong>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)' }}>{fmt(ageing?.bins.age31To60Days.value || 0)}</span>
                </div>

                <div className="stat-pill" style={{ padding: 'var(--space-3)', borderColor: 'var(--color-caution-border)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-caution)' }}>61 - 90 Days (Slow)</div>
                    <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--color-caution)' }}>
                      {ageing?.bins.age61To90Days.count || 0} units
                    </strong>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)' }}>{fmt(ageing?.bins.age61To90Days.value || 0)}</span>
                </div>

                <div className="stat-pill" style={{ padding: 'var(--space-3)', borderColor: 'var(--color-return-border)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-return)' }}>90+ Days (Dead Stock)</div>
                    <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--color-return)' }}>
                      {ageing?.bins.ageOver90Days.count || 0} units
                    </strong>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)' }}>{fmt(ageing?.bins.ageOver90Days.value || 0)}</span>
                </div>
              </div>

              {ageing && ageing.slowMovingProducts.length > 0 && (
                <div style={{ fontSize: 'var(--text-xs)', background: 'var(--color-paper)', padding: 'var(--space-3)', borderRadius: '6px' }}>
                  <strong>Oldest Garment in Store:</strong> {ageing.slowMovingProducts[0].productName} ({ageing.slowMovingProducts[0].oldestItemAgeDays} days in inventory).
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card__title">Top-Selling Garments &amp; Performance</h2>
            <Link href="/reports" className="btn btn--secondary btn--sm">
              View All Analytics →
            </Link>
          </div>

          {salesReport && salesReport.salesByProduct.length > 0 ? (
            <table className="table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Garment Design</th>
                  <th style={{ textAlign: 'left' }}>SKU</th>
                  <th style={{ textAlign: 'center' }}>Units Sold</th>
                  <th style={{ textAlign: 'right' }}>Revenue (₹)</th>
                  <th style={{ textAlign: 'right' }}>Gross Profit (₹)</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {salesReport.salesByProduct.slice(0, 5).map((p) => (
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
          ) : (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
              <p>No sales records logged yet. Use the manual restock and barcode ledger to start selling.</p>
              <Link href="/backup" className="btn btn--ghost btn--sm">
                Load Sample Store Data for Demo
              </Link>
            </div>
          )}
        </div>
      </div>
    </PermissionGuard>
  );
}
