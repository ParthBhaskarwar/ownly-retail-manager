'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { BarcodeLabelPrint, MultiLabelSheet } from '@/modules/inventory/components/BarcodeLabelPrint';
import type { BarcodeLabelData } from '@/modules/inventory/components/BarcodeLabelPrint';
import { ProductService } from '@/modules/product/services/ProductService';
import { SupplierSelect } from '@/modules/catalog/components/SupplierSelect';
import { RestockService } from '../services/RestockService';
import { InwardSlip, type InwardSlipData } from './InwardSlip';
import { SupplierService } from '@/modules/catalog/services/CategoryService';
import { printSection } from '@/lib/printSection';
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
  const { store } = useStoreContext();
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

  // One label per physical unit just received, grouped by size so they can be
  // printed and stuck on garments size by size.
  const labelGroups = useMemo(() => {
    if (!restockResult || !productDetail) return [];
    const byVariant = new Map<string, BarcodeLabelData[]>();
    for (const item of restockResult.generatedItems ?? []) {
      const variant = productDetail.variants.find((v) => v.id === item.variantId);
      const line = lines.find((l) => l.variantId === item.variantId);
      const label: BarcodeLabelData = {
        barcode: item.barcode,
        productName: productDetail.name,
        variantDisplayName: line?.sizeName || variant?.displayName,
        sku: variant?.sku ?? productDetail.baseSku,
        sellingPrice: line?.sellingPriceOverride ?? variant?.effectiveSellingPrice ?? productDetail.baseSellingPrice,
        storeName: store?.name,
      };
      byVariant.set(item.variantId, [...(byVariant.get(item.variantId) ?? []), label]);
    }
    return Array.from(byVariant.entries()).map(([variantId, labels]) => ({
      variantId,
      size: labels[0].variantDisplayName ?? 'Size',
      labels,
    }));
  }, [restockResult, productDetail, lines, store?.name]);

  const allLabels = useMemo(() => labelGroups.flatMap((g) => g.labels), [labelGroups]);

  const printLabels = () => printSection('labels');
  const printSlip = () => printSection('slip');

  const [supplierName, setSupplierName] = useState<string | undefined>();
  useEffect(() => {
    if (!restockResult || !selectedSupplierId) { setSupplierName(undefined); return; }
    SupplierService.getSuppliers(storeId)
      .then((list) => setSupplierName(list.find((x) => x.id === selectedSupplierId)?.name))
      .catch(() => setSupplierName(undefined));
  }, [restockResult, selectedSupplierId, storeId]);

  const slipData: InwardSlipData | null = useMemo(() => {
    if (!restockResult || !productDetail) return null;
    return {
      storeName: store?.name,
      storeAddress: store?.address,
      receivedAt: new Date(),
      receivedBy: user?.name,
      productName: productDetail.name,
      productSku: productDetail.baseSku,
      supplierName,
      notes: notes.trim() || undefined,
      lines: lines
        .filter((l) => l.restockQty > 0)
        .map((l) => ({
          size: l.sizeName,
          sku: l.sku,
          qty: l.restockQty,
          unitCost: l.costPriceOverride ?? productDetail.baseCostPrice,
          unitPrice: l.sellingPriceOverride ?? productDetail.baseSellingPrice,
        })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restockResult, productDetail, supplierName]);

  if (restockResult) {
    return (
      <div className="page-content" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="restock-success-card animate-fade-in-up">
          <div className="restock-success-icon">
            <span className="material-symbols-outlined">check_circle</span>
          </div>
          <div className="restock-success-text">
            <div className="restock-success-title-row">
              <h1 className="restock-success-title">Restock completed</h1>
              <span className="restock-badge">
                <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>schedule</span>
                {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })},{' '}
                {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="restock-success-desc">
              Successfully logged <strong>{restockResult.totalQuantity}</strong> units of{' '}
              <strong>{productDetail?.name} ({productDetail?.baseSku})</strong> into the inventory ledger. 
              Print the inward slip to file with the supplier invoice.
            </p>
          </div>
          <div className="restock-success-actions">
            <button
              type="button"
              className="restock-btn restock-btn--secondary"
              onClick={printSlip}
              style={{ width: 'auto' }}
            >
              <span className="material-symbols-outlined">receipt_long</span>
              Inward Slip
            </button>
          </div>
        </div>
        
        <div className="restock-stats-grid">
          <div className="restock-stat-card">
            <div className="restock-stat-card__top">
              <span className="restock-stat-card__label">Units Added</span>
              <span className="material-symbols-outlined">inventory_2</span>
            </div>
            <div>
              <div className="restock-stat-card__val">{restockResult.totalQuantity} units</div>
              <div className="restock-stat-card__sub">Across {restockResult.barcodes.length} active tags</div>
            </div>
          </div>
          <div className="restock-stat-card">
            <div className="restock-stat-card__top">
              <span className="restock-stat-card__label">Purchase Spend</span>
              <span className="material-symbols-outlined">payments</span>
            </div>
            <div>
              <div className="restock-stat-card__val">{fmt(restockResult.totalPurchaseCost)}</div>
              <div className="restock-stat-card__sub">Total supplier value logged</div>
            </div>
          </div>
          <div className="restock-stat-card">
            <div className="restock-stat-card__top">
              <span className="restock-stat-card__label">Expected Revenue</span>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)' }}>trending_up</span>
            </div>
            <div>
              <div className="restock-stat-card__val">{fmt(restockResult.expectedSalesValue)}</div>
              <div className="restock-stat-card__sub">Gross Realizable Value</div>
            </div>
          </div>
        </div>
        
        <div className="restock-barcodes-card">
          <div className="restock-card__header" style={{ padding: '20px' }}>
            <div className="restock-card__header-left">
              <h2 className="restock-card__title">Generated Barcodes &amp; SKU Labels</h2>
              <span className="restock-badge restock-badge--primary">{restockResult.barcodes.length} unique tags</span>
            </div>
            <p className="restock-card__meta" style={{ marginTop: 4 }}>
              Print thermal sticker tags for incoming physical garments before placing them on display racks.
            </p>
          </div>
          <div className="restock-barcodes-canvas">
            {labelGroups.length === 0 && (
              <p className="restock-card__meta">
                Labels could not be built for this restock. Open <strong>Barcodes</strong> in the sidebar to print them from the ledger.
              </p>
            )}
            {labelGroups.map((group) => (
              <section key={group.variantId} className="restock-label-group">
                <header className="restock-label-group__head">
                  <span className="restock-label-group__size">Size {group.size}</span>
                  <span className="restock-badge restock-badge--primary">{group.labels.length} label{group.labels.length === 1 ? '' : 's'}</span>
                </header>
                <div className="restock-label-grid">
                  {group.labels.slice(0, 12).map((label) => (
                    <BarcodeLabelPrint key={label.barcode} label={label} compact />
                  ))}
                </div>
                {group.labels.length > 12 && (
                  <p className="restock-card__meta">+ {group.labels.length - 12} more — all {group.labels.length} are included when you print.</p>
                )}
              </section>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', padding: '16px 20px', borderTop: '1px solid var(--color-border)', justifyContent: 'flex-start', background: 'var(--color-surface)' }}>
            <button
              type="button"
              className="restock-btn restock-btn--primary"
              style={{ width: 'auto' }}
              onClick={printLabels}
              disabled={allLabels.length === 0}
            >
              <span className="material-symbols-outlined">print</span>
              Print All Labels ({allLabels.length})
            </button>
            <button
              type="button"
              className="restock-btn restock-btn--secondary"
              style={{ width: 'auto' }}
              onClick={() => {
                setRestockResult(null);
                setSelectedProductId('');
                setLines([]);
              }}
            >
              <span className="material-symbols-outlined">add_circle</span>
              Restock Another
            </button>
          </div>
        </div>
        {typeof document !== 'undefined' && allLabels.length > 0 && createPortal(<MultiLabelSheet labels={allLabels} />, document.body)}
        {typeof document !== 'undefined' && slipData && createPortal(<InwardSlip data={slipData} />, document.body)}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="restock-header">
        <div>
          <div className="restock-header__title-row">
            <h1 className="restock-header__title">Restock</h1>
            <span className="restock-badge">Batch Entry</span>
          </div>
          <p className="restock-header__subtitle">
            Add incoming inventory, adjust procurement costs, and generate ledger batches
          </p>
        </div>
      </div>

      {error && (
        <div className="form-server-error" role="alert" style={{ marginTop: 'var(--space-6)' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="restock-stepper">
        <div className="restock-stepper__inner">
          <div className="restock-step">
            <div className={`restock-step__icon ${!productDetail ? 'restock-step__icon--active' : ''}`}>
              {productDetail ? <span className="material-symbols-outlined">check</span> : '1'}
            </div>
            <div className="restock-step__text">
              <span className="restock-step__label">Step 1</span>
              <span className="restock-step__title">Select Garment</span>
            </div>
          </div>
          <div className={`restock-stepper__line ${!productDetail ? 'restock-stepper__line--faded' : ''}`} />
          <div className="restock-step">
            <div className={`restock-step__icon ${productDetail ? 'restock-step__icon--active' : ''}`}>2</div>
            <div className="restock-step__text">
              <span className="restock-step__label">Step 2</span>
              <span className="restock-step__title">Supplier &amp; Batch</span>
            </div>
          </div>
          <div className="restock-stepper__line restock-stepper__line--faded" />
          <div className="restock-step">
            <div className="restock-step__icon" style={{ background: 'var(--color-surface)', color: 'var(--color-ink-muted)', border: '1px solid var(--color-border)' }}>3</div>
            <div className="restock-step__text">
              <span className="restock-step__label" style={{ color: 'var(--color-ink-secondary)' }}>Step 3</span>
              <span className="restock-step__title">Quantities &amp; Rates</span>
            </div>
          </div>
        </div>
      </div>

      <div className="restock-grid">
        <div className="restock-main-col">
          <div className="restock-card restock-card--padded">
            <div className="restock-card__header">
              <div className="restock-card__header-left">
                <span className="material-symbols-outlined restock-card__icon">checkroom</span>
                <h2 className="restock-card__title">1. Select Garment</h2>
              </div>
              <span className="restock-card__meta">Catalog Match</span>
            </div>
            
            <div className="restock-field">
              <label className="restock-field__label">Search or Scan Product</label>
              <div className="restock-input-wrap restock-input-wrap--search">
                <span className="material-symbols-outlined">search</span>
                <input
                  type="text"
                  className="restock-input restock-input--search"
                  placeholder="Search product by name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {!productDetail && (
              <div className="restock-field" style={{ marginTop: 8 }}>
                <select
                  className="restock-input"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                >
                  <option value="">-- Choose a product --</option>
                  {filteredProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.baseSku})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {productDetail && (
              <div className="restock-product-chip">
                <div className="restock-product-chip__left">
                  <div className="restock-product-chip__icon">
                    <span className="material-symbols-outlined">apparel</span>
                  </div>
                  <div>
                    <div className="restock-product-chip__name-row">
                      <span className="restock-product-chip__name">{productDetail.name}</span>
                      <span className="restock-product-chip__sku">{productDetail.baseSku}</span>
                    </div>
                    <div className="restock-product-chip__meta-row">
                      <span>Category: {productDetail.categoryName}</span>
                      <span>•</span>
                      <span className="restock-product-chip__meta-highlight">{lines.length} active size variants</span>
                    </div>
                  </div>
                </div>
                <span className="restock-badge" style={{ color: 'var(--color-pending, #D97706)', background: 'var(--color-pending-bg, #FFFBEB)', borderColor: 'var(--color-pending-border, #FDE68A)' }}>
                  Current: {productDetail.variants.reduce((s,v) => s + v.stock.inStock, 0)} units in stock
                </span>
              </div>
            )}
          </div>

          {productDetail && (
            <div className="restock-card restock-card--padded">
              <div className="restock-card__header">
                <div className="restock-card__header-left">
                  <span className="material-symbols-outlined restock-card__icon">local_shipping</span>
                  <h2 className="restock-card__title">2. Supplier &amp; Batch Details</h2>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div className="restock-field">
                  <label className="restock-field__label">Supplier</label>
                  <div className="restock-input-wrap restock-input-wrap--select">
                    <SupplierSelect
                      id="restock-supplier"
                      storeId={storeId}
                      value={selectedSupplierId}
                      onChange={setSelectedSupplierId}
                      placeholder="-- No supplier assigned --"
                    />
                  </div>
                </div>
                
                <div className="restock-field">
                  <label className="restock-field__label">Supplier Invoice / Batch Reference</label>
                  <div className="restock-input-wrap restock-input-wrap--invoice">
                    <input
                      type="text"
                      className="restock-input"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      placeholder="e.g. INV-2026-OCT-8891"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <span className="material-symbols-outlined">receipt</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {productDetail && (
            <div className="restock-card">
              <div className="restock-card__header" style={{ padding: '20px' }}>
                <div className="restock-card__header-left">
                  <span className="material-symbols-outlined restock-card__icon">tune</span>
                  <h2 className="restock-card__title">3. Quantities &amp; Rates</h2>
                </div>
                <p className="restock-card__meta" style={{ marginTop: 4 }}>
                  Update unit cost or selling price if revised, then enter restock quantities for each size variant.
                </p>
              </div>
              <div className="restock-table-wrap">
                <table className="restock-table">
                  <thead>
                    <tr>
                      <th>Size / Variant</th>
                      <th>Current Stock</th>
                      <th style={{ width: 140 }}>Unit Cost</th>
                      <th style={{ width: 140 }}>Selling Price</th>
                      <th style={{ textAlign: 'center', width: 160 }}>+ Restock Qty</th>
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
                            <div style={{ fontWeight: 500, color: 'var(--color-ink)' }}>{line.sizeName}</div>
                            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-ink-secondary)', marginTop: 2 }}>{line.sku}</div>
                          </td>
                          <td>
                            <span className="restock-badge" style={line.currentStock === 0 ? { color: 'var(--color-return, #DC2626)', background: '#FEF2F2', borderColor: '#FCA5A5' } : {}}>
                              {line.currentStock} in stock
                            </span>
                          </td>
                          <td>
                            <div className="restock-input-wrap">
                              <span className="restock-input-currency-symbol">₹</span>
                              <input
                                type="number"
                                className="restock-input restock-input--currency"
                                value={cp}
                                onChange={(e) => handleCostChange(line.variantId, parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </td>
                          <td>
                            <div className="restock-input-wrap">
                              <span className="restock-input-currency-symbol">₹</span>
                              <input
                                type="number"
                                className="restock-input restock-input--currency"
                                value={sp}
                                onChange={(e) => handlePriceChange(line.variantId, parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </td>
                          <td>
                            <div className={`restock-qty-ctrl ${line.restockQty > 0 ? 'restock-qty-ctrl--active' : ''}`}>
                              <button
                                type="button"
                                className="restock-qty-btn"
                                onClick={() => handleQtyChange(line.variantId, (line.restockQty || 0) - 1)}
                              >-</button>
                              <input
                                type="number"
                                className="restock-qty-input"
                                min={0}
                                value={line.restockQty || ''}
                                placeholder="0"
                                onChange={(e) => handleQtyChange(line.variantId, parseInt(e.target.value) || 0)}
                              />
                              <button
                                type="button"
                                className="restock-qty-btn"
                                onClick={() => handleQtyChange(line.variantId, (line.restockQty || 0) + 1)}
                              >+</button>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                            {line.restockQty > 0 ? fmt(lineTotal) : '₹0'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="restock-side-col">
          <div className="restock-card restock-card--padded">
            <div className="restock-card__header" style={{ paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
              <div className="restock-card__header-left">
                <span className="material-symbols-outlined restock-card__icon">analytics</span>
                <h3 className="restock-card__title">Restock Summary</h3>
              </div>
              <span className="restock-badge restock-badge--primary">{lines.length} Variants</span>
            </div>
            
            <div className="restock-summary-list">
              <div className="restock-summary-row">
                <span className="restock-summary-row__label">Total Units Added</span>
                <span className="restock-summary-row__val">{summary.totalQty} units</span>
              </div>
              <div className="restock-summary-row">
                <span className="restock-summary-row__label">Total Purchase Spend</span>
                <span className="restock-summary-row__val restock-summary-row__val--mono">{fmt(summary.totalCost)}</span>
              </div>
              <div className="restock-summary-row">
                <span className="restock-summary-row__label">Gross Realizable Value</span>
                <span className="restock-summary-row__val restock-summary-row__val--mono" style={{ fontWeight: 400 }}>{fmt(summary.expectedSales)}</span>
              </div>
              
              <div style={{ height: 1, background: 'var(--color-border)', margin: '8px 0' }}></div>
              
              <div className="restock-summary-row restock-summary-row--profit">
                <span className="restock-summary-row__label">Potential Gross Profit</span>
                <span className="restock-summary-row__val restock-summary-row__val--mono">{fmt(summary.profit)}</span>
              </div>
            </div>

            <div className="restock-margin-bar">
              <div className="restock-margin-bar__track">
                <div className="restock-margin-bar__fill" style={{ width: `${Math.max(0, Math.min(100, summary.margin))}%` }}></div>
              </div>
              <div className="restock-margin-bar__labels">
                <span>Procurement {(100 - summary.margin).toFixed(1)}%</span>
                <span>Margin {summary.margin.toFixed(1)}%</span>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <button
                type="submit"
                className="restock-btn restock-btn--primary"
                disabled={isSubmitting || summary.totalQty === 0}
              >
                <span className="material-symbols-outlined">check_circle</span>
                {isSubmitting ? 'Processing...' : `Complete Restock (${summary.totalQty} Units)`}
              </button>
              <button
                type="button"
                className="restock-btn restock-btn--secondary"
                onClick={() => {
                  setLines([]);
                  setSelectedProductId('');
                  setProductDetail(null);
                }}
              >
                Cancel &amp; Discard
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
