'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { evaluatePermission } from '@/config/permissions';
import { AuthGuard } from '@/shared/components/PermissionGuard';
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
    <div className="dash-container animate-fade-in-up">
      {/* Header */}
      <div className="products-header">
        <div className="products-header__title-group">
          <h1 className="products-header__title">Products</h1>
          <span className="products-header__count">{total} total</span>
        </div>
        <div className="products-header__actions">
          {canEdit && (
            <button className="btn btn-secondary" type="button">
              <span className="material-symbols-outlined">upload</span>
              Import CSV
            </button>
          )}
          {canEdit && (
            <Link href="/products/new" id="add-product-btn" className="btn btn-primary">
              <span className="material-symbols-outlined">add</span>
              Add Product
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="products-toolbar">
        <div className="products-toolbar__left">
          <ProductSearch value={query} onChange={handleQueryChange} />
          <div className="products-filter-tabs" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                id={`status-tab-${tab.value.toLowerCase()}`}
                role="tab"
                className={`products-filter-tab ${statusFilter === tab.value ? 'products-filter-tab--active' : ''}`}
                aria-selected={statusFilter === tab.value}
                onClick={() => handleStatusChange(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="products-toolbar__right">
          <button className="btn btn-secondary" type="button">
            <span className="material-symbols-outlined">filter_list</span>
            Category: All
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>expand_more</span>
          </button>
          <button className="btn btn-secondary" style={{ padding: '0 12px' }} title="Export products list" type="button">
            <span className="material-symbols-outlined">download</span>
          </button>
        </div>
      </div>

      {/* Product list */}
      <ProductList products={products} isLoading={isLoading} canEdit={canEdit} />

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="products-pagination" aria-label="Pagination">
          <div className="products-pagination__info">
            Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} total)
          </div>
          <div className="products-pagination__controls">
            <button
              id="pagination-prev"
              className="products-pagination__btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>
            <div className="products-pagination__pages">
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pNum = idx + 1;
                // Simple logic for ellipsis if there are many pages, omitted here for simplicity
                if (
                  pNum === 1 || 
                  pNum === totalPages || 
                  (pNum >= page - 1 && pNum <= page + 1)
                ) {
                  return (
                    <button
                      key={pNum}
                      className={`products-pagination__page ${pNum === page ? 'products-pagination__page--active' : ''}`}
                      onClick={() => setPage(pNum)}
                    >
                      {pNum}
                    </button>
                  );
                }
                if (pNum === page - 2 || pNum === page + 2) {
                  return <span key={pNum}>...</span>;
                }
                return null;
              })}
            </div>
            <button
              id="pagination-next"
              className="products-pagination__btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <AuthGuard>
      <ProductsPageContent />
    </AuthGuard>
  );
}
