'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { StorageHealthService, formatBytes } from '../services/StorageHealthService';
import type { BrowserStorageEstimate, StorageHealthData } from '../types';

export function StorageHealthDashboard() {
  const [health, setHealth] = useState<StorageHealthData | null>(null);
  const [browserStorage, setBrowserStorage] = useState<BrowserStorageEstimate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheClearNotice, setCacheClearNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [serverHealth, browserEstimate] = await Promise.all([
        StorageHealthService.getServerStorageHealth(),
        StorageHealthService.getBrowserStorageEstimate(),
      ]);
      setHealth(serverHealth);
      setBrowserStorage(browserEstimate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load storage health data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleClearCache = async () => {
    const success = await StorageHealthService.clearBrowserCache();
    if (success) {
      setCacheClearNotice('Browser asset cache successfully cleared.');
      setTimeout(() => setCacheClearNotice(null), 3500);
      void loadData();
    } else {
      setCacheClearNotice('Failed to clear cache.');
      setTimeout(() => setCacheClearNotice(null), 3500);
    }
  };

  const tableCounts = health?.database?.tableCounts || {};
  const totalDbRows = health?.database?.totalRecords || 0;

  const tableLabels: Record<string, string> = {
    products: 'Products & SKUs',
    inventory_items: 'Inventory Stock Items',
    invoices: 'Sales Invoices',
    customers: 'Registered Customers',
    suppliers: 'Vendors & Suppliers',
    restock_batches: 'Restock Inflow Batches',
    returns: 'Customer Returns',
    exchanges: 'Product Exchanges',
    credit_notes: 'Credit Notes',
    audit_logs: 'Audit Trail Records',
  };

  const tier = health?.healthTier ?? 'HEALTHY';
  const tierBadgeClass =
    tier === 'HEALTHY' ? 'badge--paid' : tier === 'WARNING' ? 'badge--caution' : 'badge--return';

  return (
    <div className="storage-health-dashboard animate-fade-in">
      {/* Header */}
      <div className="pe-page-header" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title">Storage Health &amp; Capacity Diagnostics</h1>
            <p className="page-subtitle">
              Live monitoring of server backup disk space, PostgreSQL table row counts, and client IndexedDB quota.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/backup" className="btn btn--secondary">
              <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 6 }}>verified_user</span>
              Manage Backups
            </Link>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void loadData()}
              disabled={isLoading}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 6 }}>refresh</span>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {cacheClearNotice && (
        <div className="alert alert--info" style={{ marginBottom: 'var(--space-4)' }}>
          {cacheClearNotice}
        </div>
      )}

      {error && (
        <div className="alert alert--error" style={{ marginBottom: 'var(--space-4)' }}>
          {error}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadData()}>
            Retry
          </button>
        </div>
      )}

      {/* Global Status Banner */}
      {!isLoading && health && (
        <div
          className="card"
          style={{
            padding: 'var(--space-5)',
            marginBottom: 'var(--space-6)',
            borderLeft: `4px solid ${
              tier === 'HEALTHY' ? 'var(--color-paid)' : tier === 'WARNING' ? 'var(--color-caution)' : 'var(--color-return)'
            }`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`badge ${tierBadgeClass}`} style={{ fontSize: 12, padding: '3px 8px' }}>
                  {tier} STATUS
                </span>
                <strong style={{ fontSize: 'var(--text-base)' }}>
                  {tier === 'HEALTHY'
                    ? 'Storage system is operating in optimal parameters.'
                    : tier === 'WARNING'
                    ? 'A routine backup is recommended soon.'
                    : 'Critical: Immediate store backup required to prevent data loss.'}
                </strong>
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', marginTop: 6, margin: 0 }}>
                {health.latestBackupAt
                  ? `Last successful snapshot recorded on ${new Date(health.latestBackupAt).toLocaleString()}.`
                  : 'No backup file has been created on the server yet.'}
              </p>
            </div>
            <Link href="/backup" className="btn btn--secondary btn--sm">
              Create New Backup
            </Link>
          </div>
        </div>
      )}

      {/* Top 3 Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {/* Card 1: Server Disk & Backups */}
        <section className="card">
          <div className="card__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="card__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)' }}>hard_drive</span>
              Server Backup Storage
            </h2>
            <span className={`badge ${health?.directoryExists ? 'badge--paid' : 'badge--return'}`}>
              {health?.directoryExists ? 'Disk Online' : 'Disk Error'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, margin: 'var(--space-4) 0' }}>
            <div className="stat-pill" style={{ padding: '10px 14px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>Total Backups:</span>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'bold', color: 'var(--color-ink)', marginTop: 4 }}>
                {health?.backupCount ?? 0}
              </div>
            </div>
            <div className="stat-pill" style={{ padding: '10px 14px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>Total Disk Size:</span>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'bold', color: 'var(--color-accent)', marginTop: 4 }}>
                {formatBytes(health?.totalSizeBytes ?? 0)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', lineHeight: 1.6 }}>
            <div>
              <strong>Storage directory:</strong>{' '}
              <code style={{ background: 'var(--color-muted)', padding: '2px 4px', borderRadius: 4 }}>
                {health?.backupDirectory ?? '—'}
              </code>
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Status:</strong> {health?.directoryExists ? 'Writable & active' : 'Path not found'}
            </div>
          </div>
        </section>

        {/* Card 2: Database Rows */}
        <section className="card">
          <div className="card__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="card__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)' }}>database</span>
              Database Record Volume
            </h2>
            <span className={`badge ${health?.database?.connected ? 'badge--paid' : 'badge--return'}`}>
              {health?.database?.connected ? 'PostgreSQL Active' : 'Disconnected'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, margin: 'var(--space-4) 0' }}>
            <div className="stat-pill" style={{ padding: '10px 14px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>Store Total Rows:</span>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'bold', color: 'var(--color-ink)', marginTop: 4 }}>
                {totalDbRows}
              </div>
            </div>
            <div className="stat-pill" style={{ padding: '10px 14px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>Tracked Tables:</span>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'bold', color: 'var(--color-ink)', marginTop: 4 }}>
                {Object.keys(tableCounts).length}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>
            All queries are tenant-isolated and strictly scoped to your store identifier.
          </div>
        </section>

        {/* Card 3: Browser Quota */}
        <section className="card">
          <div className="card__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="card__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)' }}>devices</span>
              Browser &amp; IndexedDB Quota
            </h2>
            <span className="badge badge--paid">PWA Ready</span>
          </div>

          <div style={{ margin: 'var(--space-4) 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: 6 }}>
              <span>Local Storage Used: <strong>{formatBytes(browserStorage?.usageBytes ?? 0)}</strong></span>
              <span>Available Quota: <strong>{formatBytes(browserStorage?.quotaBytes ?? 0)}</strong></span>
            </div>
            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                height: 8,
                background: 'var(--color-border)',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(1, Math.min(100, browserStorage?.usagePercentage ?? 0.5))}%`,
                  height: '100%',
                  background: 'var(--color-accent)',
                  borderRadius: 'var(--radius-full)',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 4, textAlign: 'right' }}>
              {(browserStorage?.usagePercentage ?? 0).toFixed(2)}% of browser quota utilized
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>
              Offline Mode: {browserStorage?.persisted ? 'Persisted' : 'Standard'}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleClearCache}
              title="Clears browser cache assets"
            >
              Clear Cache
            </button>
          </div>
        </section>
      </div>

      {/* Database Breakdown Table */}
      <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card__title">Store Database Row Breakdown</h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', margin: 0 }}>
              Live row counts per table for this store in PostgreSQL.
            </p>
          </div>
          <Link href="/audit" className="btn btn--secondary btn--sm">
            View Audit Log ({tableCounts['audit_logs'] ?? 0} events)
          </Link>
        </div>

        {isLoading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 'var(--space-3)' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--color-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 16px', fontSize: 'var(--text-xs)' }}>TABLE ENTITY</th>
                  <th style={{ padding: '10px 16px', fontSize: 'var(--text-xs)', textAlign: 'right' }}>RECORD COUNT</th>
                  <th style={{ padding: '10px 16px', fontSize: 'var(--text-xs)', width: '35%' }}>SHARE OF TOTAL DATA</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(tableCounts).map(([key, count]) => {
                  const pct = totalDbRows > 0 ? ((count / totalDbRows) * 100).toFixed(1) : '0';
                  return (
                    <tr key={key} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 16px', fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                        {tableLabels[key] || key}
                        <code style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginLeft: 8 }}>({key})</code>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 'var(--text-sm)', textAlign: 'right', fontWeight: 600 }}>
                        {count.toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              flex: 1,
                              height: 6,
                              background: 'var(--color-muted)',
                              borderRadius: 'var(--radius-full)',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.max(1, Number(pct))}%`,
                                height: '100%',
                                background: 'var(--color-accent)',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', minWidth: 42 }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
