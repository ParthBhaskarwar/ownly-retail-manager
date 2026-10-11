'use client';

/**
 * /inventory/barcodes — Barcode Management Page
 *
 * Searchable list of all inventory items with their barcodes.
 * Supports:
 *   - Text search by barcode, SKU, or product name
 *   - Status filter
 *   - Multi-select and batch print
 *   - Per-item print (via the detail page)
 *
 * Security: all queries go through the API which enforces store_id isolation.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { AuthGuard, PermissionGuard } from '@/shared/components/PermissionGuard';
import { InventoryItemService } from '@/modules/inventory/services/InventoryItemService';
import { BarcodePrintManager } from '@/modules/inventory/components/BarcodePrintManager';
import type { InventoryItemRow, InventoryStatus } from '@/modules/inventory/types';

const PAGE_SIZE = 50;

type StatusFilter = InventoryStatus | 'ALL';

function BarcodesPageContent() {
  const { user } = useAuthContext();
  const { store } = useStoreContext();

  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('IN_STOCK');

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadItems = useCallback(async () => {
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
      setLoadError(err instanceof Error ? err.message : 'Could not load barcodes.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery, page]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page-content animate-fade-in">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header__left">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/inventory" className="breadcrumb__link">Inventory</Link>
            <span className="breadcrumb__sep">/</span>
            <span className="breadcrumb__current">Barcode Management</span>
          </nav>
          <h1 className="page-header__title" style={{ marginTop: 8 }}>Barcode Management</h1>
          <p className="page-subtitle">
            Search, preview and print barcode labels for your physical inventory items.
          </p>
        </div>
        <Link href="/inventory" className="btn btn--secondary btn--sm">
          ← Back to Inventory
        </Link>
      </div>

      {/* Barcode lookup / search */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="card__title">Search Barcodes</h2>
        <div className="product-toolbar" style={{ marginTop: 'var(--space-3)' }}>
          <input
            id="barcode-search-input"
            type="text"
            className="form-input"
            placeholder="Type barcode, SKU or product name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ maxWidth: 400 }}
            autoComplete="off"
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
      </div>

      {/* Error state */}
      {loadError && (
        <div className="alert alert--error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          {loadError}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadItems()}>
            Retry
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="card">
        <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="card__title">
            Inventory Barcodes
            <span style={{ fontWeight: 400, fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)', marginLeft: 8 }}>
              ({total} items)
            </span>
          </h2>
        </div>

        {isLoading ? (
          <div style={{ padding: 'var(--space-6)' }}>
            <div className="skeleton" style={{ height: 200 }} />
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <span className="empty-state__icon" aria-hidden="true">▦</span>
            <h3 className="empty-state__title">No barcodes found</h3>
            <p className="empty-state__desc">
              {searchQuery
                ? `No inventory items match "${searchQuery}". Try a different search.`
                : 'No inventory items in this status. Add stock from a product page.'}
            </p>
          </div>
        ) : (
          <BarcodePrintManager items={items} storeName={store?.name} />
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border-subtle)' }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Previous
            </button>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              Page {page} of {pageCount} · {total} total
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
    </div>
  );
}

export default function BarcodesPage() {
  return (
    <AuthGuard>
      <PermissionGuard permissionKey="inventory:view">
        <BarcodesPageContent />
      </PermissionGuard>
    </AuthGuard>
  );
}
