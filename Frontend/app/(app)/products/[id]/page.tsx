'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthContext } from '@/context/AuthContext';
import { evaluatePermission } from '@/config/permissions';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { ProductService } from '@/modules/product/services/ProductService';
import { StockSummaryCard } from '@/modules/inventory/components/StockSummaryCard';
import { StockEntryForm } from '@/modules/inventory/components/StockEntryForm';
import type { ProductDetail, VariantWithStock } from '@/modules/product/types';
import type { Role } from '@/modules/account/types';

function ProductDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthContext();
  const productId = params.id as string;
  const canEdit = user ? evaluatePermission(user.role as Role, 'inventory:edit') : false;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockFormVariant, setStockFormVariant] = useState<VariantWithStock | null>(null);

  const loadProduct = async () => {
    setIsLoading(true);
    try {
      const detail = await ProductService.getProductDetail(productId);
      if (!detail) { router.replace('/products'); return; }
      setProduct(detail);
    } catch {
      setError('Failed to load product details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadProduct(); }, [productId]);

  if (isLoading) {
    return (
      <div className="page-content">
        <div className="skeleton" style={{ height: 40, width: 300, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
      </div>
    );
  }

  if (error || !product) {
    return <div className="page-content"><div className="alert alert--error">{error}</div></div>;
  }

  const totalInStock = product.variants.reduce((sum, v) => sum + v.stock.inStock, 0);
  const totalSold = product.variants.reduce((sum, v) => sum + v.stock.sold, 0);
  const totalDamaged = product.variants.reduce((sum, v) => sum + v.stock.damaged, 0);
  const overallSummary = {
    variantId: 'all',
    inStock: totalInStock,
    reserved: product.variants.reduce((s, v) => s + v.stock.reserved, 0),
    sold: totalSold,
    returned: product.variants.reduce((s, v) => s + v.stock.returned, 0),
    damaged: totalDamaged,
    lost: product.variants.reduce((s, v) => s + v.stock.lost, 0),
    total: product.variants.reduce((s, v) => s + v.stock.total, 0),
  };

  return (
    <div className="page-content">
      {/* Breadcrumb */}
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/products" className="breadcrumb__link">Products</Link>
        <span className="breadcrumb__sep">/</span>
        <span className="breadcrumb__current">{product.name}</span>
      </nav>

      {/* Product header */}
      <div className="product-detail__header">
        <div>
          <div className="product-detail__title-row">
            <h1 className="product-detail__name">{product.name}</h1>
            <span className={`status-badge status-badge--${product.status === 'ACTIVE' ? 'success' : 'warning'}`}>
              {product.status}
            </span>
          </div>
          <code className="sku-badge sku-badge--large">{product.baseSku}</code>
        </div>
        {canEdit && (
          <Link href={`/products/${product.id}/edit`} id="edit-product-btn" className="btn btn--secondary">
            Edit Product
          </Link>
        )}
      </div>

      {/* Overall stock summary */}
      <section aria-labelledby="stock-summary-heading" className="card">
        <h2 id="stock-summary-heading" className="card__title">Stock Overview</h2>
        <StockSummaryCard summary={overallSummary} />
      </section>

      {/* Product attributes */}
      {product.attributes.length > 0 && (
        <section aria-labelledby="attributes-heading" className="card">
          <h2 id="attributes-heading" className="card__title">Product Details</h2>
          <dl className="attribute-display-list">
            {product.attributes.map((attr) => (
              <div key={attr.definition.id} className="attribute-display-item">
                <dt className="attribute-display-item__label">{attr.definition.name}</dt>
                <dd className="attribute-display-item__value">{attr.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Variants */}
      <section aria-labelledby="variants-heading" className="card">
        <div className="card__header">
          <h2 id="variants-heading" className="card__title">Variants ({product.variants.length})</h2>
          {canEdit && (
            <Link href={`/products/${product.id}/stock`} id="add-stock-link" className="btn btn--secondary btn--sm">
              + Add Stock
            </Link>
          )}
        </div>

        <div className="variant-list">
          {product.variants.map((variant) => (
            <div key={variant.id} className="variant-row">
              <div className="variant-row__info">
                <span className="variant-row__name">{variant.displayName}</span>
                <code className="sku-badge">{variant.sku}</code>
                {variant.sellingPriceOverride !== null && (
                  <span className="variant-row__override-badge">Custom Price</span>
                )}
              </div>
              <div className="variant-row__attrs">
                {variant.attributes.map((a) => (
                  <span key={a.definition.id} className="variant-attr-chip">
                    {a.value}
                  </span>
                ))}
              </div>
              <div className="variant-row__price">
                ₹{variant.effectiveSellingPrice.toLocaleString('en-IN')}
              </div>
              <StockSummaryCard summary={variant.stock} compact />
              {canEdit && (
                <button
                  id={`add-stock-btn-${variant.id}`}
                  className="btn btn--ghost btn--sm"
                  onClick={() => setStockFormVariant(
                    stockFormVariant?.id === variant.id ? null : variant
                  )}
                >
                  {stockFormVariant?.id === variant.id ? 'Cancel' : '+ Stock'}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Inline stock entry form */}
        {stockFormVariant && user?.storeId && (
          <div className="variant-stock-entry-panel">
            <StockEntryForm
              variantId={stockFormVariant.id}
              variantSku={stockFormVariant.sku}
              variantDisplayName={stockFormVariant.displayName}
              storeId={user.storeId}
              onSuccess={(count) => {
                setStockFormVariant(null);
                void loadProduct();
                // TODO: show toast
              }}
              onCancel={() => setStockFormVariant(null)}
            />
          </div>
        )}
      </section>
    </div>
  );
}

export default function ProductDetailPage() {
  return (
    <AuthGuard>
      <ProductDetailContent />
    </AuthGuard>
  );
}
