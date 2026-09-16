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
      <div className="product-list product-list--loading">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="empty-state" id="products-empty-state">
        <div className="empty-state__icon">📦</div>
        <h3 className="empty-state__title">No products yet</h3>
        <p className="empty-state__message">Add your first product to start managing inventory.</p>
        {canEdit && (
          <Link href="/products/new" className="btn btn--primary empty-state__action" id="empty-add-product">
            + Add Product
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card__header">
        <h2 className="card__title">Products Directory</h2>
      </div>
      <table className="table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Product</th>
            <th style={{ textAlign: 'left' }}>SKU</th>
            <th style={{ textAlign: 'left' }}>Category</th>
            <th style={{ textAlign: 'center' }}>Variants</th>
            <th style={{ textAlign: 'center' }}>In Stock</th>
            <th style={{ textAlign: 'right' }}>Selling Price</th>
            <th style={{ textAlign: 'center' }}>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>
                <Link href={`/products/${product.id}`} style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                  {product.name}
                </Link>
              </td>
              <td>
                <code className="sku-badge">{product.baseSku}</code>
              </td>
              <td>{product.categoryName}</td>
              <td style={{ textAlign: 'center' }}>{product.variantCount}</td>
              <td style={{ textAlign: 'center' }}>
                <span className={`badge ${product.totalInStock === 0 ? 'badge--return' : 'badge--paid'}`}>
                  {product.totalInStock}
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>
                ₹{product.baseSellingPrice.toLocaleString('en-IN')}
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className={`badge ${product.status === 'ACTIVE' ? 'badge--paid' : product.status === 'INACTIVE' ? 'badge--neutral' : 'badge--return'}`}>
                  {product.status}
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <Link
                  href={`/products/${product.id}`}
                  className="btn btn--ghost btn--sm"
                  id={`view-product-${product.id}`}
                >
                  View
                </Link>
                {canEdit && (
                  <Link
                    href={`/products/${product.id}/edit`}
                    className="btn btn--ghost btn--sm"
                    id={`edit-product-${product.id}`}
                  >
                    Edit
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
