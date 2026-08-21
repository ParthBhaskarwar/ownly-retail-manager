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
    <div className="product-list" role="table" aria-label="Product list">
      <div className="product-list__header" role="row">
        <span role="columnheader">Product</span>
        <span role="columnheader">SKU</span>
        <span role="columnheader">Category</span>
        <span role="columnheader">Variants</span>
        <span role="columnheader">In Stock</span>
        <span role="columnheader">Selling Price</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Actions</span>
      </div>

      {products.map((product) => (
        <div key={product.id} className="product-list__row" role="row">
          <span className="product-list__cell product-list__cell--name" role="cell">
            <Link href={`/products/${product.id}`} className="product-list__name-link">
              {product.name}
            </Link>
          </span>
          <span className="product-list__cell product-list__cell--sku" role="cell">
            <code className="sku-badge">{product.baseSku}</code>
          </span>
          <span className="product-list__cell" role="cell">
            {product.categoryName}
          </span>
          <span className="product-list__cell product-list__cell--number" role="cell">
            {product.variantCount}
          </span>
          <span className="product-list__cell product-list__cell--number" role="cell">
            <span className={`stock-pill ${product.totalInStock === 0 ? 'stock-pill--empty' : 'stock-pill--ok'}`}>
              {product.totalInStock}
            </span>
          </span>
          <span className="product-list__cell product-list__cell--price" role="cell">
            ₹{product.baseSellingPrice.toLocaleString('en-IN')}
          </span>
          <span className="product-list__cell" role="cell">
            <span className={`status-badge status-badge--${STATUS_COLORS[product.status]}`}>
              {product.status}
            </span>
          </span>
          <span className="product-list__cell product-list__cell--actions" role="cell">
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
          </span>
        </div>
      ))}
    </div>
  );
}
