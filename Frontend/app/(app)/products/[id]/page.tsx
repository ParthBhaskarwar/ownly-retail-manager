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
import PhotoCapture from '@/modules/product/components/PhotoCapture';
import SimilarProductsPanel from '@/modules/product/components/SimilarProductsPanel';
import ProductPerformancePanel from '@/modules/product/components/ProductPerformancePanel';
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
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

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

  const images = product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls : [];
  const currentPhoto = images[selectedPhotoIndex] || null;

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
    <div className="page-content space-y-6">
      {/* Breadcrumb */}
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/products" className="breadcrumb__link">Products</Link>
        <span className="breadcrumb__sep">/</span>
        <span className="breadcrumb__current">{product.name}</span>
      </nav>

      {/* Product header & title */}
      <div className="product-detail__header flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="product-detail__title-row flex items-center gap-3">
            <h1 className="product-detail__name text-2xl font-bold">{product.name}</h1>
            <span className={`status-badge status-badge--${product.status === 'ACTIVE' ? 'success' : 'warning'}`}>
              {product.status}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <code className="sku-badge sku-badge--large">{product.baseSku}</code>
            <span className="badge badge--denim">{product.categoryName}</span>
            {product.subcategoryName && <span className="badge badge--neutral">{product.subcategoryName}</span>}
          </div>
        </div>
        {canEdit && (
          <Link href={`/products/${product.id}/edit`} id="edit-product-btn" className="btn btn--secondary">
            ✎ Edit Product
          </Link>
        )}
      </div>

      {/* Photo Gallery & Top Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Photo Gallery */}
        <div className="card md:col-span-1 space-y-3">
          <h2 className="card__title">Product Photos</h2>
          {currentPhoto ? (
            <div className="space-y-3">
              <div className="aspect-square rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
                <img src={currentPhoto} alt={product.name} className="w-full h-full object-cover" />
              </div>
              {images.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`w-14 h-14 rounded-lg overflow-hidden border transition-all ${
                        selectedPhotoIndex === idx ? 'border-violet-500 ring-2 ring-violet-500/40' : 'border-slate-800 opacity-60 hover:opacity-100'
                      }`}
                      onClick={() => setSelectedPhotoIndex(idx)}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-square rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-500 text-sm">
              <span className="text-3xl mb-1">📷</span>
              <span>No Photo Uploaded</span>
            </div>
          )}
        </div>

        {/* Overview & Stock Card */}
        <div className="md:col-span-2 space-y-6">
          <section aria-labelledby="stock-summary-heading" className="card">
            <h2 id="stock-summary-heading" className="card__title">Stock Overview</h2>
            <StockSummaryCard summary={overallSummary} />
          </section>

          {/* Pricing & Supplier Summary */}
          <section className="card">
            <h2 className="card__title">Pricing &amp; Info</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mt-3">
              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block">Selling Price</span>
                <span className="text-lg font-bold text-emerald-400">₹{product.baseSellingPrice.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block">Cost Price</span>
                <span className="text-lg font-bold text-slate-200">₹{product.baseCostPrice.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block">Supplier</span>
                <span className="text-sm font-semibold text-slate-200">{product.supplierName || '—'}</span>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block">Total Variants</span>
                <span className="text-lg font-bold text-violet-400">{product.variants.length}</span>
              </div>
            </div>

            {product.description && (
              <p className="text-sm text-slate-300 mt-4 pt-3 border-t border-slate-800">
                {product.description}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Category-Specific Attributes */}
      {product.attributes.length > 0 && (
        <section aria-labelledby="attributes-heading" className="card">
          <h2 id="attributes-heading" className="card__title">Category Attributes ({product.categoryName})</h2>
          <dl className="attribute-display-list mt-3">
            {product.attributes.map((attr) => (
              <div key={attr.definition.id} className="attribute-display-item">
                <dt className="attribute-display-item__label">{attr.definition.name}</dt>
                <dd className="attribute-display-item__value">{attr.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Variants & Size Stock Grid */}
      <section aria-labelledby="variants-heading" className="card">
        <div className="card__header">
          <h2 id="variants-heading" className="card__title">Variants &amp; Size Breakdown ({product.variants.length})</h2>
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
              onSuccess={() => {
                setStockFormVariant(null);
                void loadProduct();
              }}
              onCancel={() => setStockFormVariant(null)}
            />
          </div>
        )}
      </section>

      {/* ── Week 6: Product photo & fingerprint ───────────────────────────── */}
      {canEdit && (
        <section aria-labelledby="photo-heading" className="card">
          <h2 id="photo-heading" className="card__title">Photo Intelligence Capture</h2>
          <PhotoCapture
            productId={product.id}
            enabled={true}
            onFingerprintSaved={() => {
              void loadProduct();
            }}
          />
        </section>
      )}

      {/* ── Week 6: Similar products (fingerprint-based) ──────────────────── */}
      <section aria-labelledby="similar-heading" className="card">
        <h2 id="similar-heading" className="card__title mb-3">
          Visual Similarity Search
        </h2>
        <SimilarProductsPanel productId={product.id} />
      </section>

      {/* ── Week 6: Performance metrics ───────────────────────────────────── */}
      <section aria-labelledby="perf-heading" className="card">
        <h2 id="perf-heading" className="card__title mb-3">
          Performance Analytics
        </h2>
        <ProductPerformancePanel productId={product.id} />
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
