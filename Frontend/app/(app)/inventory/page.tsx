'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthGuard, PermissionGuard } from '@/shared/components/PermissionGuard';
import { InventoryItemService } from '@/modules/inventory/services/InventoryItemService';
import { CategoryService, SupplierService } from '@/modules/catalog/services/CategoryService';
import { InventoryTable } from '@/modules/inventory/components/InventoryTable';
import { InventoryFilters, type InventoryFilterValues } from '@/modules/inventory/components/InventoryFilters';
import { ValuationCards } from '@/modules/inventory/components/ValuationCards';
import { StockAlerts } from '@/modules/inventory/components/StockAlerts';
import {
  ALL_INVENTORY_STATUSES,
  STATUS_LABELS,
  type InventoryItemRow,
  type InventoryStatus,
  type StockAlerts as StockAlertsData,
  type StockValuation,
} from '@/modules/inventory/types';
import type { Category, Supplier } from '@/modules/catalog/types';

const PAGE_SIZE = 25;

const EMPTY_FILTERS: InventoryFilterValues = {
  query: '',
  categoryId: '',
  supplierId: '',
  size: '',
};

function InventoryPageContent() {
  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<InventoryStatus | 'ALL'>('ALL');
  const [filters, setFilters] = useState<InventoryFilterValues>(EMPTY_FILTERS);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [valuation, setValuation] = useState<StockValuation | null>(null);
  const [alerts, setAlerts] = useState<StockAlertsData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(filters.query), 300);
    return () => clearTimeout(id);
  }, [filters.query]);

  // Filter options load once.
  useEffect(() => {
    void CategoryService.getCategories().then(setCategories).catch(() => {});
    void SupplierService.getSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await InventoryItemService.search({
        query: debouncedQuery || undefined,
        status: status !== 'ALL' ? status : undefined,
        categoryId: filters.categoryId || undefined,
        supplierId: filters.supplierId || undefined,
        size: filters.size || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load inventory.');
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, status, filters.categoryId, filters.supplierId, filters.size, page]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // Valuation follows the category/supplier filters so the headline numbers
  // describe the same slice of stock the table is showing. Status and size
  // are deliberately excluded — valuation is always "what is on the shelves".
  const loadSummary = useCallback(async () => {
    try {
      const [v, a] = await Promise.all([
        InventoryItemService.getValuation({
          categoryId: filters.categoryId || undefined,
          supplierId: filters.supplierId || undefined,
        }),
        InventoryItemService.getAlerts(),
      ]);
      setValuation(v);
      setAlerts(a);
    } catch {
      /* summary is supplementary — the table still works without it */
    }
  }, [filters.categoryId, filters.supplierId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleFilterChange = (patch: Partial<InventoryFilterValues>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const handleStatusChange = (next: InventoryStatus | 'ALL') => {
    setStatus(next);
    setPage(1);
  };

  const totalPages = useMemo(() => Math.ceil(total / PAGE_SIZE), [total]);

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-header__title">Inventory</h1>
          <span className="page-header__count">{total} items</span>
        </div>
      </div>

      <ValuationCards valuation={valuation} isLoading={isLoading} />

      <StockAlerts alerts={alerts} />

      <InventoryFilters
        values={filters}
        categories={categories}
        suppliers={suppliers}
        onChange={handleFilterChange}
        onReset={handleReset}
      />

      <div className="filter-tabs filter-tabs--scroll" role="tablist" aria-label="Filter by status">
        <button
          role="tab"
          id="inv-status-all"
          aria-selected={status === 'ALL'}
          className={`filter-tab ${status === 'ALL' ? 'filter-tab--active' : ''}`}
          onClick={() => handleStatusChange('ALL')}
        >
          All
        </button>
        {ALL_INVENTORY_STATUSES.map((s) => (
          <button
            key={s}
            role="tab"
            id={`inv-status-${s.toLowerCase()}`}
            aria-selected={status === s}
            className={`filter-tab ${status === s ? 'filter-tab--active' : ''}`}
            onClick={() => handleStatusChange(s)}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {error && (
        <div className="form-server-error" role="alert">
          <strong>Error:</strong> {error}
        </div>
      )}

      <InventoryTable items={items} isLoading={isLoading} />

      {!isLoading && totalPages > 1 && (
        <div className="pagination" aria-label="Pagination">
          <button
            id="inv-pagination-prev"
            className="btn btn-ghost btn-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ← Prev
          </button>
          <span className="pagination__info">Page {page} of {totalPages}</span>
          <button
            id="inv-pagination-next"
            className="btn btn-ghost btn-sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <AuthGuard>
      <PermissionGuard permissionKey="inventory:view">
        <InventoryPageContent />
      </PermissionGuard>
    </AuthGuard>
  );
}
