'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AuditService } from '../services/AuditService';
import type { AuditFilters, AuditLogEntry } from '../types';

function getActionBadgeClass(action: string): string {
  if (action.includes('delete') || action.includes('deactivate') || action.includes('tamper') || action.includes('void')) {
    return 'badge--return';
  }
  if (action.includes('price') || action.includes('update') || action.includes('restore') || action.includes('warning')) {
    return 'badge--caution';
  }
  if (action.includes('create') || action.includes('paid') || action.includes('restock') || action.includes('verify')) {
    return 'badge--paid';
  }
  return 'badge--info';
}

function formatRelativeTime(dateString: string): string {
  const d = new Date(dateString);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

const CATEGORY_FILTERS = [
  { label: 'All Categories', value: '' },
  { label: 'Products & Catalog', value: 'product' },
  { label: 'Inventory & Restock', value: 'inventory' },
  { label: 'Billing & Invoices', value: 'billing' },
  { label: 'Returns & Refunds', value: 'return' },
  { label: 'Exchanges', value: 'exchange' },
  { label: 'Backups & System', value: 'backup' },
  { label: 'Auth & Staff', value: 'auth' },
];

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  // Detail Modal state
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters: AuditFilters = {
        limit: pageSize,
        offset: page * pageSize,
        search: search.trim() || undefined,
        action: category || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(`${endDate}T23:59:59Z`).toISOString() : undefined,
      };

      const result = await AuditService.listLogs(filters);
      setLogs(result.logs);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
    } finally {
      setIsLoading(false);
    }
  }, [category, endDate, page, pageSize, search, startDate]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    void fetchLogs();
  };

  const handleResetFilters = () => {
    setSearch('');
    setCategory('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  };

  const handleCopyMeta = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(JSON.stringify(selectedLog.meta, null, 2)).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="audit-log-viewer animate-fade-in">
      {/* Header */}
      <div className="pe-page-header" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title">Audit Trail &amp; Activity Log</h1>
            <p className="page-subtitle">
              Immutable ledger of administrative actions, data modifications, price updates, and backups.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void fetchLogs()}
              disabled={isLoading}
              title="Refresh logs"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 6 }}>refresh</span>
              Refresh
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => AuditService.exportToCsv(logs)}
              disabled={isLoading || logs.length === 0}
              title="Export current page to CSV"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 6 }}>download</span>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', textTransform: 'uppercase' }}>
            Total Recorded Events
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'bold', color: 'var(--color-accent)', marginTop: 4 }}>
            {total}
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', textTransform: 'uppercase' }}>
            Current Page Range
          </div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-ink)', marginTop: 8 }}>
            {total === 0 ? '0' : `${page * pageSize + 1} - ${Math.min((page + 1) * pageSize, total)}`} of {total}
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', textTransform: 'uppercase' }}>
            Active Category Filter
          </div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-ink)', marginTop: 8 }}>
            {category ? CATEGORY_FILTERS.find((c) => c.value === category)?.label : 'All Events'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <input
              type="text"
              className="input"
              placeholder="Search actions, users, or entity IDs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', height: 40 }}
            />
          </div>

          <div style={{ minWidth: 180 }}>
            <select
              className="input"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
              }}
              style={{ width: '100%', height: 40 }}
            >
              {CATEGORY_FILTERS.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="date"
              className="input"
              title="From date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(0);
              }}
              style={{ height: 40 }}
            />
            <span style={{ color: 'var(--color-ink-muted)' }}>to</span>
            <input
              type="date"
              className="input"
              title="To date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(0);
              }}
              style={{ height: 40 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn--secondary btn--sm" style={{ height: 40 }}>
              Search
            </button>
            {(search || category || startDate || endDate) && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleResetFilters}
                style={{ height: 40 }}
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Error alert */}
      {error && (
        <div className="alert alert--error" style={{ marginBottom: 'var(--space-4)' }}>
          {error}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void fetchLogs()}>
            Retry
          </button>
        </div>
      )}

      {/* Table Section */}
      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <div className="skeleton" style={{ height: 40, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 40, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 40 }} />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--color-ink-muted)' }}>
              manage_search
            </span>
            <h3 style={{ marginTop: 12, marginBottom: 6 }}>No Audit Events Found</h3>
            <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-sm)', maxWidth: 420, margin: '0 auto' }}>
              No audit logs matched your current filters or date range. Try clearing your filters or performing actions like creating a product or backup.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-muted)', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>TIME</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>ACTION</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>USER</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>TARGET</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>DETAILS PREVIEW</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const metaKeys = Object.keys(log.meta || {});
                  const metaPreview = metaKeys.slice(0, 3).map((k) => `${k}: ${String(log.meta[k])}`).join(' · ');

                  return (
                    <tr
                      key={log.id}
                      style={{ borderBottom: '1px solid var(--color-border)', fontSize: 'var(--text-sm)' }}
                      className="hover-row"
                    >
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 500 }}>{formatRelativeTime(log.createdAt)}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <span className={`badge ${getActionBadgeClass(log.action)}`} style={{ fontFamily: 'var(--font-mono)' }}>
                          {log.action}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500 }}>{log.userName || 'System / Automated'}</div>
                        {log.userRole && (
                          <span
                            className="badge badge--neutral"
                            style={{ fontSize: 10, padding: '1px 6px', marginTop: 2, display: 'inline-block' }}
                          >
                            {log.userRole}
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        {log.entityType ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{log.entityType}</span>
                            {log.entityId && (
                              <span
                                style={{
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--color-ink-muted)',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                #{log.entityId.slice(0, 8)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-ink-muted)' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px', maxWidth: 320 }}>
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-ink-secondary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={JSON.stringify(log.meta)}
                        >
                          {metaPreview || '—'}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => setSelectedLog(log)}
                          title="Inspect raw event details"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > pageSize && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>
              Page {page + 1} of {Math.max(1, totalPages)} ({total} total entries)
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="input"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                style={{ height: 32, fontSize: 'var(--text-xs)' }}
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>

              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={page === 0 || isLoading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={page >= totalPages - 1 || isLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Inspect Modal */}
      {selectedLog && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28, 25, 23, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="card animate-fade-in-up"
            style={{
              maxWidth: 640,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 'var(--space-6)',
              background: '#FFFFFF',
              borderRadius: 'var(--radius-xl)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Audit Event Detail</h3>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                  ID: {selectedLog.id}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setSelectedLog(null)}
                style={{ fontSize: 18, padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
              <div className="stat-pill" style={{ padding: '8px 12px' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>Action:</span>
                <div style={{ marginTop: 4 }}>
                  <span className={`badge ${getActionBadgeClass(selectedLog.action)}`}>{selectedLog.action}</span>
                </div>
              </div>
              <div className="stat-pill" style={{ padding: '8px 12px' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>Timestamp:</span>
                <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', marginTop: 4 }}>
                  {new Date(selectedLog.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="stat-pill" style={{ padding: '8px 12px' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>Initiated By:</span>
                <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', marginTop: 4 }}>
                  {selectedLog.userName || 'System'} {selectedLog.userRole ? `(${selectedLog.userRole})` : ''}
                </div>
              </div>
              <div className="stat-pill" style={{ padding: '8px 12px' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>Target Entity:</span>
                <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', marginTop: 4 }}>
                  {selectedLog.entityType || 'None'} {selectedLog.entityId ? `(#${selectedLog.entityId.slice(0, 8)})` : ''}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-ink-secondary)' }}>
                  EVENT METADATA (JSON)
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={handleCopyMeta} style={{ fontSize: 12 }}>
                  {copySuccess ? 'Copied!' : 'Copy JSON'}
                </button>
              </div>
              <pre
                style={{
                  background: 'var(--color-muted)',
                  padding: 12,
                  borderRadius: 'var(--radius-lg)',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  overflowX: 'auto',
                  border: '1px solid var(--color-border)',
                }}
              >
                {JSON.stringify(selectedLog.meta, null, 2)}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn--secondary" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
