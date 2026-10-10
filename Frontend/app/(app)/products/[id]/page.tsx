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
import { AiProductAnalysisPanel } from '@/modules/ai/components/AiProductAnalysisPanel';
import type { ProductDetail, VariantWithStock } from '@/modules/product/types';
import type { Role } from '@/modules/account/types';

function ProductDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthContext();
  const productId = params.id as string;
  const canEdit = user ? evaluatePermission(user.role as Role, 'inventory:edit') : false;
  const canSeeAi = user ? evaluatePermission(user.role as Role, 'reports:view') : false;

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
    <div className="product-detail-layout">
      {/* Breadcrumb & Action Bar */}
      <div className="product-detail-header">
        <div>
          <nav className="product-breadcrumb" aria-label="Breadcrumb">
            <Link href="/products" className="product-breadcrumb-link">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
              Products
            </Link>
            <span className="product-breadcrumb-sep">/</span>
            <span>Store</span>
            <span className="product-breadcrumb-sep">/</span>
            <span className="product-breadcrumb-current">{product.name}</span>
          </nav>
          <div className="product-title-row">
            <h1 className="product-title-name">{product.name}</h1>
            <span className="product-tag product-tag--sku">
              SKU: {product.baseSku}
            </span>
            <span className={`product-tag ${product.status === 'ACTIVE' ? 'product-tag--active' : ''}`}>
              {product.status}
            </span>
            <span className="product-tag">{product.categoryName}</span>
          </div>
        </div>
        <div className="products-header__actions">
          {canEdit && (
            <Link href={`/products/${product.id}/edit`} className="btn-products-outline" id="edit-product-btn">
              <span className="material-symbols-outlined">edit</span>
              Edit Product
            </Link>
          )}
          {canEdit && (
            <Link href={`/products/${product.id}/stock`} className="btn-products-primary" id="add-stock-link">
              <span className="material-symbols-outlined">add_box</span>
              Restock Product
            </Link>
          )}
        </div>
      </div>

      <div className="product-split-grid">
        {/* Left Column: Info & Imagery */}
        <div className="product-panel">
          <div className="product-panel__header">
            <div className="product-panel__title-wrap">
              <span className="material-symbols-outlined product-panel__icon">inventory_2</span>
              <h2 className="product-panel__title">Product Information &amp; Imagery</h2>
            </div>
            <span className="product-panel__meta">
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-accent)' }}>verified</span>
              Verified Catalog Entry
            </span>
          </div>

          <div className="product-gallery">
            {currentPhoto ? (
              <div className="product-gallery__main">
                <img src={currentPhoto} alt={product.name} />
                <div className="product-gallery__zoom-badge">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>zoom_in</span>
                  Hover to zoom
                </div>
              </div>
            ) : (
              <div className="product-gallery__main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--color-text-muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32 }}>image_not_supported</span>
                <span style={{ fontSize: 12, marginTop: 8 }}>No Photo Uploaded</span>
              </div>
            )}
            {images.length > 1 && (
              <div className="product-gallery__thumbnails">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`product-gallery__thumb ${selectedPhotoIndex === idx ? 'product-gallery__thumb--active' : ''}`}
                    onClick={() => setSelectedPhotoIndex(idx)}
                  >
                    <img src={img} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {product.description && (
            <div className="product-info-text">
              <p>{product.description}</p>
            </div>
          )}

          <div className="product-specs">
            <div className="product-specs__title">Specifications &amp; Pricing Metadata</div>
            <div className="product-specs__grid">
              <div className="product-specs__row">
                <span className="product-specs__label">Category</span>
                <span className="product-specs__value">{product.categoryName}</span>
              </div>
              <div className="product-specs__row">
                <span className="product-specs__label">Supplier</span>
                <span className="product-specs__value">{product.supplierName || '—'}</span>
              </div>
              {product.attributes.map(attr => (
                <div className="product-specs__row" key={attr.definition.id}>
                  <span className="product-specs__label">{attr.definition.name}</span>
                  <span className="product-specs__value">{attr.value}</span>
                </div>
              ))}
              <div className="product-specs__row">
                <span className="product-specs__label">Base Cost Price</span>
                <span className="product-specs__value product-specs__value-mono">₹{product.baseCostPrice.toLocaleString('en-IN')}</span>
              </div>
              <div className="product-specs__row">
                <span className="product-specs__label">Base Selling Price</span>
                <span className="product-specs__value product-specs__value-mono">₹{product.baseSellingPrice.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Performance */}
        <div className="product-panel">
          <div className="product-panel__header">
            <div className="product-panel__title-wrap">
              <span className="material-symbols-outlined product-panel__icon">monitoring</span>
              <h2 className="product-panel__title">Performance &amp; Velocity</h2>
            </div>
          </div>
          
          <div className="product-stats-grid">
            <div className="product-stat-tile">
              <span className="product-stat-tile__label">Total Variants</span>
              <div className="product-stat-tile__main">
                <span className="product-stat-tile__value">{product.variants.length}</span>
              </div>
              <span className="product-stat-tile__sub">Active configurations</span>
            </div>
            <div className="product-stat-tile">
              <span className="product-stat-tile__label">Total In Stock</span>
              <div className="product-stat-tile__main">
                <span className="product-stat-tile__value">{totalInStock}</span>
                {totalInStock === 0 && (
                  <span className="product-stat-tile__trend-badge product-stat-tile__trend-badge--warn">Empty</span>
                )}
              </div>
              <span className="product-stat-tile__sub">Across all variants</span>
            </div>
          </div>

          <div className="product-info-text">
            <StockSummaryCard summary={overallSummary} compact />
          </div>

          {canSeeAi && (
            <AiProductAnalysisPanel productId={product.id} canRestock={canEdit} />
          )}
          <ProductPerformancePanel productId={product.id} />
        </div>
      </div>

      {/* Variants & Size Stock Grid */}
      <div className="products-card products-card--variants">
        <div className="products-card__header">
          <div className="products-card__title-wrap">
            <span className="material-symbols-outlined product-panel__icon">style</span>
            <h2 className="products-card__title">Variant Stock &amp; Sizing Breakdown</h2>
          </div>
        </div>
        <div className="products-table-wrapper">
          <table className="products-table">
            <thead>
              <tr>
                <th>Variant</th>
                <th>Variant SKU</th>
                <th>Attributes</th>
                <th style={{ textAlign: 'center' }}>Current Stock</th>
                <th style={{ textAlign: 'right' }}>Selling Price</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => {
                const isOutOfStock = variant.stock.inStock === 0;
                return (
                  <tr key={variant.id} className={isOutOfStock ? 'row-danger' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                        <div className="variant-size-badge">
                          {variant.displayName.charAt(0).toUpperCase()}
                        </div>
                        {variant.displayName}
                      </div>
                    </td>
                    <td>
                      <span className="sku-badge">{variant.sku}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {variant.attributes.map(a => (
                          <span key={a.definition.id} className="stock-badge stock-badge--in-stock" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', margin: 0 }}>
                            {a.value}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={isOutOfStock ? 'stock-badge stock-badge--out-stock' : 'stock-badge stock-badge--in-stock'}>
                        {variant.stock.inStock} units
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ₹{variant.effectiveSellingPrice.toLocaleString('en-IN')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn-products-outline"
                        style={{ padding: '4px 8px' }}
                        onClick={() => setStockFormVariant(
                          stockFormVariant?.id === variant.id ? null : variant
                        )}
                      >
                        {stockFormVariant?.id === variant.id ? 'Cancel' : 'Restock'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
      </div>

      <div className="product-split-grid">
        <div className="product-panel">
          <div className="product-panel__header">
            <h2 className="product-panel__title">Visual Similarity Search</h2>
          </div>
          <SimilarProductsPanel productId={product.id} />
        </div>
        
        {canEdit && (
          <div className="product-panel">
            <div className="product-panel__header">
              <h2 className="product-panel__title">Photo Intelligence Capture</h2>
            </div>
            <PhotoCapture
              productId={product.id}
              enabled={true}
              onAddPhoto={async (base64) => {
                await ProductService.updateProduct(product.id, {
                  imageUrls: [...(product.imageUrls ?? []), base64],
                  updatedBy: user?.id ?? 'system',
                });
                await loadProduct();
              }}
            />
          </div>
        )}
      </div>
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
