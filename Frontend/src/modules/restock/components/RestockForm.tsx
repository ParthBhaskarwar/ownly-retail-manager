'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { ProductService } from '@/modules/product/services/ProductService';
import { SupplierSelect } from '@/modules/catalog/components/SupplierSelect';
import { RestockService } from '../services/RestockService';
import type { ProductSummary } from '@/modules/product/types';
import type { RestockVariantLine, RestockResult } from '../types';

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

export function RestockForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get('productId') || '';

  const { user } = useAuthContext();
  const storeId = user?.storeId || '';

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(initialProductId);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<RestockVariantLine[]>([]);
  const [productDetail, setProductDetail] = useState<import('@/modules/product/types').ProductDetail | null>(null);

  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restockResult, setRestockResult] = useState<RestockResult | null>(null);

  useEffect(() => {
    if (!storeId) return;
    ProductService.searchProducts({ storeId, pageSize: 200 }).then((res) => setProducts(res.items));
  }, [storeId]);

  useEffect(() => {
    if (!selectedProductId) {
      setProductDetail(null);
      setLines([]);
      return;
    }

    setIsLoadingProduct(true);
    setError(null);

    RestockService.getRestockLinesForProduct(selectedProductId)
      .then((res) => {
        if (res) {
          setProductDetail(res.product);
          setLines(res.lines);
          if (res.product.supplierId) {
            setSelectedSupplierId(res.product.supplierId);
          }
        }
      })
      .catch((err) => setError(err.message || 'Failed to load product details.'))
      .finally(() => setIsLoadingProduct(false));
  }, [selectedProductId]);

  const handleQtyChange = (variantId: string, qty: number) => {
    setLines((prev) =>
      prev.map((l) => (l.variantId === variantId ? { ...l, restockQty: Math.max(0, qty) } : l))
    );
  };

  const handleCostChange = (variantId: string, cost: number) => {
    setLines((prev) =>
      prev.map((l) => (l.variantId === variantId ? { ...l, costPriceOverride: cost > 0 ? cost : undefined } : l))
    );
  };

  const handlePriceChange = (variantId: string, price: number) => {
    setLines((prev) =>
      prev.map((l) => (l.variantId === variantId ? { ...l, sellingPriceOverride: price > 0 ? price : undefined } : l))
    );
  };

  const summary = useMemo(() => {
    if (!productDetail) return { totalQty: 0, totalCost: 0, expectedSales: 0, profit: 0, margin: 0 };

    let totalQty = 0;
    let totalCost = 0;
    let expectedSales = 0;

    for (const line of lines) {
      const q = line.restockQty || 0;
      if (q > 0) {
        const cp = line.costPriceOverride ?? productDetail.baseCostPrice;
        const sp = line.sellingPriceOverride ?? productDetail.baseSellingPrice;
        totalQty += q;
        totalCost += cp * q;
        expectedSales += sp * q;
      }
    }

    const profit = expectedSales - totalCost;
    const margin = expectedSales > 0 ? (profit / expectedSales) * 100 : 0;

    return { totalQty, totalCost, expectedSales, profit, margin };
  }, [productDetail, lines]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productDetail || !user) return;
    if (summary.totalQty === 0) {
      setError('Please specify a restock quantity of at least 1 unit for one or more sizes.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await RestockService.executeRestock({
        storeId,
        storeCode: 'OWN',
        productId: productDetail.id,
        supplierId: selectedSupplierId || undefined,
        performedBy: user.id,
        notes: notes.trim() || undefined,
        lines,
      });

      setRestockResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restock failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    const q = searchQuery.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.baseSku.toLowerCase().includes(q));
  }, [products, searchQuery]);

  if (restockResult) {
    return (
      <div className="card animate-fade-in-up" style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--space-6)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div className="pe-success-icon" style={{ margin: '0 auto 16px' }}>✓</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', color: 'var(--color-ink)' }}>
            Restock Completed Successfully
          </h2>
          <p style={{ color: 'var(--color-ink-secondary)', marginTop: '4px' }}>
            Added <strong>{restockResult.totalQuantity}</strong> physical items with unique sequential barcodes to inventory.
          </p>
        </div>

        <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-6)' }}>
          <div className="stat-card card">
            <div className="stat-card__value">{restockResult.totalQuantity}</div>
            <div className="stat-card__label">Units Added</div>
          </div>
          <div className="stat-card card">
            <div className="stat-card__value">{fmt(restockResult.totalPurchaseCost)}</div>
            <div className="stat-card__label">Purchase Spend</div>
          </div>
          <div className="stat-card card">
            <div className="stat-card__value">{fmt(restockResult.expectedSalesValue)}</div>
            <div className="stat-card__label">Expected Revenue</div>
          </div>
        </div>

        <div className="card" style={{ background: 'var(--color-paper)', marginBottom: 'var(--space-6)' }}>
          <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 'var(--text-base)', margin: 0 }}>
              Generated Item Barcodes ({restockResult.barcodes.length})
            </h3>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => window.print()}
            >
              🖨️ Print Labels
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: 200, overflowY: 'auto', padding: 'var(--space-3)' }}>
            {restockResult.barcodes.map((bc) => (
              <span key={bc} className="sku-badge" style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}>
                {bc}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setRestockResult(null);
              setSelectedProductId('');
              setLines([]);
            }}
          >
            Restock Another Product
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => router.push(`/products/${productDetail?.id}`)}
          >
            View Product Details
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="page-content" noValidate>
      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-header__title">Manual Restocking</h1>
          <p className="page-subtitle">
            Select an existing garment design, update cost/selling prices if changed, and enter restock quantities per size.
          </p>
        </div>
      </div>

      {error && (
        <div className="form-server-error" role="alert">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div className="pe-main" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section className="card">
            <div className="card__header">
              <h2 className="card__title">1. Select Garment to Restock</h2>
            </div>
            
            <div className="card__body" style={{ padding: 'var(--space-4)' }}>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search product by name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', maxWidth: 400 }}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Product</label>
                <select
                  className="form-select"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  style={{ maxWidth: 400 }}
                >
                  <option value="">-- Choose a product --</option>
                  {filteredProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.baseSku}) — Current Stock: {p.totalInStock}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {productDetail && (
            <section className="card">
              <div className="card__header">
                <h2 className="card__title">2. Supplier &amp; Batch Details</h2>
              </div>

              <div className="card__body" style={{ padding: 'var(--space-4)' }}>
                <div className="form-grid">
                  <SupplierSelect
                    id="restock-supplier"
                    storeId={storeId}
                    value={selectedSupplierId}
                    onChange={setSelectedSupplierId}
                    placeholder="-- No supplier assigned --"
                  />

                  <div className="form-field">
                    <label className="form-label">Restock Notes / Invoice No.</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Invoice #PO-2026-89 from Mumbai Mill"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {productDetail && (
            <section className="card">
              <div className="card__header">
                <h2 className="card__title">3. Size-Wise Restock Quantities &amp; Rates</h2>
              </div>

              <table className="table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Size / Variant</th>
                    <th style={{ textAlign: 'center' }}>Current Stock</th>
                    <th style={{ textAlign: 'right', width: 120 }}>Cost (₹)</th>
                    <th style={{ textAlign: 'right', width: 120 }}>Selling (₹)</th>
                    <th style={{ textAlign: 'center', width: 130 }}>+ Restock Qty</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const cp = line.costPriceOverride ?? productDetail.baseCostPrice;
                    const sp = line.sellingPriceOverride ?? productDetail.baseSellingPrice;
                    const lineTotal = (line.restockQty || 0) * cp;

                    return (
                      <tr key={line.variantId}>
                        <td>
                          <strong>{line.sizeName}</strong>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                            {line.sku}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${line.currentStock === 0 ? 'badge--return' : line.currentStock <= 5 ? 'badge--caution' : 'badge--neutral'}`}>
                            {line.currentStock}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            className="form-input form-input--sm"
                            value={cp}
                            onChange={(e) => handleCostChange(line.variantId, parseFloat(e.target.value) || 0)}
                            style={{ textAlign: 'right', width: '100%' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            className="form-input form-input--sm"
                            value={sp}
                            onChange={(e) => handlePriceChange(line.variantId, parseFloat(e.target.value) || 0)}
                            style={{ textAlign: 'right', width: '100%' }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            min={0}
                            className="form-input form-input--sm"
                            value={line.restockQty || ''}
                            placeholder="0"
                            onChange={(e) => handleQtyChange(line.variantId, parseInt(e.target.value) || 0)}
                            style={{ textAlign: 'center', fontWeight: 'bold', width: '100%' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {line.restockQty > 0 ? fmt(lineTotal) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {productDetail && (
            <div className="form-actions" style={{ marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => router.push('/products')}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={isSubmitting || summary.totalQty === 0}
              >
                {isSubmitting ? 'Processing...' : `Complete Restock (${summary.totalQty} Units)`}
              </button>
            </div>
          )}
        </div>

        <aside className="card" aria-label="Restock summary" style={{ position: 'sticky', top: 'var(--space-6)' }}>
          <div className="card__header">
            <h3 className="card__title">Restock Summary</h3>
          </div>
          <div className="card__body" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--color-ink-secondary)' }}>Total Restock Qty</span>
                <strong style={{ fontSize: 'var(--text-base)' }}>{summary.totalQty > 0 ? summary.totalQty : '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--color-ink-secondary)' }}>Purchase Spend</span>
                <strong>{summary.totalCost > 0 ? fmt(summary.totalCost) : '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--color-ink-secondary)' }}>Expected Revenue</span>
                <strong>{summary.expectedSales > 0 ? fmt(summary.expectedSales) : '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '12px', marginTop: '4px' }}>
                <span style={{ color: 'var(--color-ink-secondary)', fontWeight: 600 }}>Potential Margin</span>
                <strong style={{ color: 'var(--color-paid)' }}>{summary.profit > 0 ? fmt(summary.profit) : '—'}</strong>
              </div>
            </div>

            {summary.totalQty > 0 ? (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.max(0, summary.margin))}%`, height: '100%', background: 'var(--color-paid)' }} />
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', marginTop: '6px', textAlign: 'right' }}>
                  {summary.margin.toFixed(1)}% projected gross margin
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)', marginTop: 'var(--space-4)', textAlign: 'center', padding: 'var(--space-2)' }}>
                Select sizes and enter restock quantities to preview spend and profit margins.
              </p>
            )}
          </div>
        </aside>
      </div>
    </form>
  );
}
