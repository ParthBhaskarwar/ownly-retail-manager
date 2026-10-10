'use client';

import React from 'react';
import type { ProductSummary, ProductStatus } from '@/modules/product/types';
import Link from 'next/link';

interface ProductListProps {
  products: ProductSummary[];
  isLoading?: boolean;
  canEdit?: boolean;
}

const STATUS_COLORS: Record<ProductStatus, string> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  DISCONTINUED: 'error',
};

export function ProductList({ products, isLoading, canEdit }: ProductListProps) {
  if (isLoading) {
    return (
      <div className="products-card">
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="products-empty" id="products-empty-state">
        <div className="products-empty__icon">
          <span className="material-symbols-outlined">checkroom</span>
        </div>
        <h3 className="products-empty__title">No products found</h3>
        <p className="products-empty__desc">No products match your current filter query. Get started by adding garments and inventory items to your shop directory.</p>
        <div className="products-empty__actions">
          <button className="btn btn-secondary" type="button">
            Reset Filters
          </button>
          {canEdit && (
            <Link href="/products/new" className="btn btn-primary" id="empty-add-product">
              <span className="material-symbols-outlined">add</span>
              Add Product
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="products-card">
      <div className="products-card__header">
        <div className="products-card__title-wrap">
          <h2 className="products-card__title">Products Directory</h2>
          <span className="products-card__subtitle">• Store Inventory</span>
        </div>
        <span className="products-card__meta">Sorted by: Recently Updated</span>
      </div>
      <div className="products-table-wrapper">
        <table className="products-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th style={{ textAlign: 'center' }}>Variants</th>
              <th style={{ textAlign: 'center' }}>In Stock</th>
              <th style={{ textAlign: 'right' }}>Selling Price</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const outOfStock = product.totalInStock === 0;
              return (
                <tr key={product.id}>
                  <td>
                    <div className="product-cell">
                      <div className="product-cell__image">
                        {product.imageUrls && product.imageUrls.length > 0 ? (
                          <img src={product.imageUrls[0]} alt="" />
                        ) : (
                          <span className="material-symbols-outlined">styler</span>
                        )}
                      </div>
                      <div className="product-cell__info">
                        <Link href={`/products/${product.id}`} className="product-cell__name">
                          {product.name}
                        </Link>
                        <div className="product-cell__variant">{product.description || 'General Item'}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="sku-badge" style={{ fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>{product.baseSku}</span>
                  </td>
                  <td style={{ fontWeight: 500, color: 'var(--color-ink)' }}>{product.categoryName}</td>
                  <td style={{ textAlign: 'center' }}>{product.variantCount} variants</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`stock-badge ${outOfStock ? 'stock-badge--out-stock' : 'stock-badge--in-stock'}`}>
                      {outOfStock ? '0 (Out of stock)' : `${product.totalInStock} in stock`}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-ink)' }}>
                    ₹{product.baseSellingPrice.toLocaleString('en-IN')}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge badge--sm ${
                      product.status === 'ACTIVE' ? 'badge--success' :
                      product.status === 'INACTIVE' ? 'badge--warning' : 'badge--error'
                    }`}>
                      {product.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="products-actions">
                      <Link
                        href={`/products/${product.id}`}
                        className="btn btn-sm btn-ghost"
                        id={`view-product-${product.id}`}
                      >
                        View
                      </Link>
                      {canEdit && (
                        <>
                          <span className="products-actions-divider">|</span>
                          <Link
                            href={`/products/${product.id}/edit`}
                            className="btn btn-sm btn-ghost"
                            id={`edit-product-${product.id}`}
                          >
                            Edit
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
