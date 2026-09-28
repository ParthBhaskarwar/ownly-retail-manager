'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { RestockRemindersCard } from '@/modules/restock/components/RestockRemindersCard';
import { InventoryItemService, InventoryMovementService } from '@/modules/inventory/services/InventoryItemService';
import type {
  InventoryItemRow,
  InventoryMovement,
  InventoryStatus,
  StockValuation,
} from '@/modules/inventory/types';

const PAGE_SIZE = 50;

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

type StatusFilter = InventoryStatus | 'ALL';

export default function InventoryPage() {
  const { user } = useAuthContext();
  const { store } = useStoreContext();
  const storeId = store?.id || user?.storeId || '';

  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('IN_STOCK');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [valuation, setValuation] = useState<StockValuation | null>(null);
  const [soldTotal, setSoldTotal] = useState(0);
  const [allTotal, setAllTotal] = useState(0);

  const [selectedItemHistory, setSelectedItemHistory] = useState<{
    item: InventoryItemRow;
    movements: InventoryMovement[];
  } | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Debounce the search box so we do not query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadList = useCallback(async () => {
    if (!storeId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await InventoryItemService.search({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        query: searchQuery || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setLoadError(err instanceof Error ? err.message : 'Could not load inventory.');
    } finally {
      setIsLoading(false);
    }
  }, [storeId, statusFilter, searchQuery, page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Headline numbers come from the server, independent of the current filter/page.
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    Promise.allSettled([
      InventoryItemService.getValuation(),
      InventoryItemService.search({ status: 'SOLD', pageSize: 1 }),
      InventoryItemService.search({ pageSize: 1 }),
    ]).then(([v, sold, all]) => {
      if (cancelled) return;
      if (v.status === 'fulfilled') setValuation(v.value);
      if (sold.status === 'fulfilled') setSoldTotal(sold.value.total);
      if (all.status === 'fulfilled') setAllTotal(all.value.total);
    });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const viewHistory = async (item: InventoryItemRow) => {
    setHistoryError(null);
    try {
      const movements = await InventoryMovementService.getMovementsForItem(item.id);
      setSelectedItemHistory({ item, movements });
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Could not load the movement history.');
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AuthGuard>
      <div className="page-content animate-fade-in">
        <div className="page-header">
          <div className="page-header__left">
            <h1 className="page-header__title">Physical Inventory Ledger</h1>
            <p className="page-subtitle">
              Track individual garment items, unique barcodes, status lifecycles, and movements.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/restock" className="btn btn--primary">
              ⚡ Manual Restock
            </Link>
          </div>
        </div>

        {storeId && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <RestockRemindersCard storeId={storeId} compact />
          </div>
        )}

        <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 'var(--space-4)' }}>
          <div className="stat-card card">
            <div className="stat-card__icon">📦</div>
            <div className="stat-card__value">{valuation?.itemCount ?? 0}</div>
            <div className="stat-card__label">In Stock (Available)</div>
          </div>
          <div className="stat-card card">
            <div className="stat-card__icon">💰</div>
            <div className="stat-card__value">{fmt(valuation?.stockCostValue ?? 0)}</div>
            <div className="stat-card__label">In-Stock Cost Value</div>
          </div>
          <div className="stat-card card">
            <div className="stat-card__icon">🏷️</div>
            <div className="stat-card__value">{soldTotal}</div>
            <div className="stat-card__label">Units Sold to Date</div>
          </div>
          <div className="stat-card card">
            <div className="stat-card__icon">📊</div>
            <div className="stat-card__value">{allTotal}</div>
            <div className="stat-card__label">Total Barcodes Tracked</div>
          </div>
        </div>

        <div className="product-toolbar" style={{ marginBottom: 'var(--space-4)' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Scan or type barcode, SKU, product name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ maxWidth: 380 }}
          />

          <div className="filter-tabs" role="tablist">
            {(
              [
                { label: 'In Stock', value: 'IN_STOCK' },
                { label: 'All', value: 'ALL' },
                { label: 'Sold', value: 'SOLD' },
                { label: 'Returned', value: 'RETURNED_TO_STOCK' },
                { label: 'Damaged', value: 'DAMAGED' },
              ] as Array<{ label: string; value: StatusFilter }>
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={`filter-tab ${statusFilter === tab.value ? 'filter-tab--active' : ''}`}
                onClick={() => {
                  setStatusFilter(tab.value);
                  setPage(1);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loadError && (
          <div className="alert alert--error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            {loadError}{' '}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadList()}>
              Retry
            </button>
          </div>
        )}

        {historyError && (
          <div className="alert alert--error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            {historyError}
          </div>
        )}

        <div className="card">
          <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card__title">Item-Level Tracking ({total} items)</h2>
          </div>

          {isLoading ? (
            <div style={{ padding: 'var(--space-6)' }}>
              <div className="skeleton" style={{ height: 180 }} />
            </div>
          ) : items.length === 0 ? (
            <p style={{ padding: 'var(--space-6)', color: 'var(--color-ink-muted)', textAlign: 'center' }}>
              No inventory items found matching your criteria.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Unique Barcode</th>
                    <th style={{ textAlign: 'left' }}>Garment Design</th>
                    <th style={{ textAlign: 'left' }}>Size / Variant</th>
                    <th style={{ textAlign: 'right' }}>Cost</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'left' }}>Received Date</th>
                    <th style={{ textAlign: 'center' }}>History</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <code className="sku-badge" style={{ fontWeight: 600 }}>
                          {item.barcode}
                        </code>
                      </td>
                      <td><strong>{item.productName || '—'}</strong></td>
                      <td>{item.variantDisplayName || item.size || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(Number(item.purchaseCostPrice) || 0)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${item.status === 'IN_STOCK' ? 'badge--paid' : item.status === 'SOLD' ? 'badge--neutral' : 'badge--return'}`}>
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>{new Date(item.purchaseDate || item.createdAt).toLocaleDateString()}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void viewHistory(item)}>
                          📜 Audit Trail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)' }}>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={page >= pageCount || isLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {selectedItemHistory && (
          <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal card animate-fade-in-up" style={{ maxWidth: 600, width: '90%', padding: 'var(--space-6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>
                  Movement History: <code className="sku-badge">{selectedItemHistory.item.barcode}</code>
                </h2>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedItemHistory(null)}>
                  ✕
                </button>
              </div>

              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {selectedItemHistory.movements.length === 0 ? (
                  <p style={{ color: 'var(--color-ink-muted)' }}>No movements recorded for this item.</p>
                ) : (
                  <div className="movement-timeline">
                    {selectedItemHistory.movements.map((m) => (
                      <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                          <strong>{m.movementType}</strong>
                          <span style={{ color: 'var(--color-ink-muted)', fontSize: 'var(--text-xs)' }}>
                            {new Date(m.performedAt).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', marginTop: '2px' }}>
                          Status: {m.fromStatus} → {m.toStatus}
                          {m.notes && ` · Notes: ${m.notes}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right', marginTop: 'var(--space-4)' }}>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setSelectedItemHistory(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
