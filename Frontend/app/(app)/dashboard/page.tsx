'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/shared/hooks/useAuth';
import { useStoreContext } from '@/context/StoreContext';
import { StoreService } from '@/modules/store/services/StoreService';
import { OnboardingChecklist } from '@/modules/store/components/OnboardingChecklist';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { db } from '@/db/db';
import type { OnboardingStep } from '@/modules/store/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const { store } = useStoreContext();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
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
    const s = StoreService.getOnboardingSteps(user.id, store, user);
    setSteps(s);

    // Calculate live dashboard stats from Dexie DB
    const loadDashboardData = async () => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const allInvoices = await db.invoices.toArray().catch(() => []);
        const todayInvoices = allInvoices.filter((inv) =>
          inv.createdAt?.startsWith(todayStr)
        );

        const sales = todayInvoices.reduce(
          (sum, inv) => sum + (Number(inv.grandTotal) || 0),
          0
        );

        const prodsCount = await db.products.count().catch(() => 0);
        const invItems = await db.inventoryItems
          .where('status')
          .equals('IN_STOCK')
          .count()
          .catch(() => 0);
        const returns = await db.returns.count().catch(() => 0);

        setStats({
          todaySales: sales,
          ordersToday: todayInvoices.length,
          totalProducts: prodsCount,
          inStockItems: invItems,
          returnsCount: returns,
        });

        // Top 5 recent invoices
        const sorted = [...allInvoices].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ).slice(0, 5);
        setRecentInvoices(sorted);
      } catch (e) {
        console.error('[DASHBOARD_DATA_ERROR]', e);
      }
    };

    loadDashboardData();
  }, [user, store]);

  return (
    <PermissionGuard permissionKey="dashboard:view">
      <div className="dashboard">
        {/* Welcome Header */}
        <div className="page-header" style={{ alignItems: 'center' }}>
          <div>
            <h1 className="page-title">
              Welcome back, {user?.name?.split(' ')[0] || 'Retailer'} 👋
            </h1>
            <p className="page-subtitle">
              {store?.name || 'Ownly Retail POS'} • Store Operational Dashboard
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <Link href="/billing" className="btn btn-primary" style={{ height: '44px', gap: 'var(--space-2)' }}>
              ⚡ Open POS Billing
            </Link>
            <Link href="/products/new" className="btn btn-secondary" style={{ height: '44px' }}>
              + Add Product
            </Link>
          </div>
        </div>

        {/* Onboarding checklist (shown until setup is complete) */}
        {showChecklist && steps.length > 0 && (
          <div className="dashboard__onboarding">
            <OnboardingChecklist steps={steps} />
          </div>
        )}

        {/* Live Statistics Cards */}
        <div className="dashboard-stats">
          <div className="card stat-card">
            <div className="stat-card__icon" style={{ color: 'var(--color-paid)' }}>₹</div>
            <div className="stat-card__value" style={{ color: 'var(--color-paid)' }}>
              ₹{stats.todaySales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="stat-card__label">Today's Sales Revenue</div>
          </div>

          <div className="card stat-card">
            <div className="stat-card__icon" style={{ color: 'var(--color-denim)' }}>🧾</div>
            <div className="stat-card__value">
              {stats.ordersToday}
            </div>
            <div className="stat-card__label">Orders Completed Today</div>
          </div>

          <div className="card stat-card">
            <div className="stat-card__icon" style={{ color: 'var(--color-caution)' }}>📦</div>
            <div className="stat-card__value">
              {stats.totalProducts}
            </div>
            <div className="stat-card__label">Catalog Products</div>
          </div>

          <div className="card stat-card">
            <div className="stat-card__icon" style={{ color: 'var(--color-denim-dark)' }}>🏷️</div>
            <div className="stat-card__value">
              {stats.inStockItems}
            </div>
            <div className="stat-card__label">In-Stock Retail Units</div>
          </div>
        </div>

        {/* Core Workflows Navigation Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-section__title">Retail Operations &amp; Workflows</div>
          <div className="workflows-grid">
            <Link href="/billing" className="workflow-card">
              <div className="workflow-card__icon-wrap" style={{ color: 'var(--color-denim-dark)' }}>
                ⊟
              </div>
              <h3 className="workflow-card__title">Point-of-Sale (POS)</h3>
              <p className="workflow-card__desc">
                High-speed barcode checkout, line discounts, customer selection, and split tender payments.
              </p>
            </Link>

            <Link href="/invoices" className="workflow-card">
              <div className="workflow-card__icon-wrap" style={{ color: 'var(--color-info)' }}>
                📄
              </div>
              <h3 className="workflow-card__title">Invoices &amp; Receipts</h3>
              <p className="workflow-card__desc">
                Browse sales history, filter by status, and print 80mm thermal receipts or A4 tax invoices.
              </p>
            </Link>

            <Link href="/returns" className="workflow-card">
              <div className="workflow-card__icon-wrap" style={{ color: 'var(--color-return)' }}>
                ↩
              </div>
              <h3 className="workflow-card__title">Returns &amp; Refunds</h3>
              <p className="workflow-card__desc">
                Search invoices, inspect condition tags, and issue instant refunds or store credit note vouchers.
              </p>
            </Link>

            <Link href="/exchanges" className="workflow-card">
              <div className="workflow-card__icon-wrap" style={{ color: 'var(--color-denim)' }}>
                ⇄
              </div>
              <h3 className="workflow-card__title">Product Exchanges</h3>
              <p className="workflow-card__desc">
                Swap item sizes or models with automated price difference collection/refund calculations.
              </p>
            </Link>
          </div>
        </div>

        {/* Recent Invoices Table */}
        {recentInvoices.length > 0 && (
          <div className="cart-panel">
            <div className="cart-panel__header">
              <span className="cart-panel__title">Recent Sales Transactions</span>
              <Link href="/invoices" className="link-btn" style={{ fontSize: 'var(--text-xs)' }}>
                View All Invoices →
              </Link>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="cart-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Customer</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'right' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)', background: 'var(--color-paper)', padding: '2px 6px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--color-border)' }}>
                          {inv.invoiceNumber}
                        </code>
                      </td>
                      <td style={{ fontWeight: 'var(--font-medium)' }}>
                        {inv.customerName || 'Walk-in Customer'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)' }}>
                        ₹{parseFloat(inv.grandTotal || 0).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge--success badge--sm">
                          {inv.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                        {new Date(inv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
