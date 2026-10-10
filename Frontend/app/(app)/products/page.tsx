'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { evaluatePermission } from '@/config/permissions';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { ProductService } from '@/modules/product/services/ProductService';
import { ProductList } from '@/modules/product/components/ProductList';
import { ProductSearch } from '@/modules/product/components/ProductSearch';
import type { ProductSummary, ProductStatus, ProductSearchFilters } from '@/modules/product/types';
import type { Role } from '@/modules/account/types';

const STATUS_TABS: Array<{ label: string; value: ProductStatus | 'ALL' }> = [
  { label: 'All',           value: 'ALL'          },
  { label: 'Active',        value: 'ACTIVE'        },
  { label: 'Inactive',      value: 'INACTIVE'      },
  { label: 'Discontinued',  value: 'DISCONTINUED'  },
];

const PAGE_SIZE = 20;

function ProductsPageContent() {
  const { user } = useAuthContext();
  const { store } = useStoreContext();
  const canEdit = user ? evaluatePermission(user.role as Role, 'inventory:edit') : true;

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatus | 'ALL'>('ALL');

  const loadProducts = useCallback(async () => {
    const storeId = store?.id ?? user?.storeId ?? 'default-store';
    setIsLoading(true);
    try {
      const filters: ProductSearchFilters = {
        storeId,
        query: query || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        page,
        pageSize: PAGE_SIZE,
      };
      const result = await ProductService.searchProducts(filters);
      setProducts(result.items);
      setTotal(result.total);
    } catch (err) {
      console.error('[LOAD_PRODUCTS_ERROR]', err);
    } finally {
      setIsLoading(false);
    }
  }, [store?.id, user?.storeId, query, statusFilter, page]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    setPage(1);
  };

  const handleStatusChange = (s: ProductStatus | 'ALL') => {
    setStatusFilter(s);
    setPage(1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-header__title">Products</h1>
          <span className="page-header__count">{isLoading ? "…" : total} total</span>
        </div>
        {canEdit && (
          <Link href="/products/new" id="add-product-btn" className="btn btn--primary">
            + Add Product
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="product-toolbar">
        <ProductSearch value={query} onChange={handleQueryChange} />
        <div className="filter-tabs" role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              id={`status-tab-${tab.value.toLowerCase()}`}
              role="tab"
              className={`filter-tab ${statusFilter === tab.value ? 'filter-tab--active' : ''}`}
              aria-selected={statusFilter === tab.value}
              onClick={() => handleStatusChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <ProductList products={products} isLoading={isLoading} canEdit={canEdit} />

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="pagination" aria-label="Pagination">
          <button
            id="pagination-prev"
            className="btn btn--ghost btn--sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ← Prev
          </button>
          <span className="pagination__info">
            Page {page} of {totalPages}
          </span>
          <button
            id="pagination-next"
            className="btn btn--ghost btn--sm"
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

export default function ProductsPage() {
  return (
    <PermissionGuard permissionKey="inventory:view">
      <ProductsPageContent />
    </PermissionGuard>
  );
}
