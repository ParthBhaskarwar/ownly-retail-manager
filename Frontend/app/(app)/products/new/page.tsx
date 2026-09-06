'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { ProductService } from '@/modules/product/services/ProductService';
import { CategorySelect } from '@/modules/catalog/components/CategorySelect';
import { AttributeFieldRenderer } from '@/modules/attributes/components/AttributeFieldRenderer';
import { AttributeService } from '@/modules/catalog/services/CategoryService';
import type { AttributeDefinition } from '@/modules/attributes/types';
import type { CreateProductInput } from '@/modules/product/types';
import { CLOTHING_TEMPLATE_ID } from '@/config/retail-templates';

// ── Clothing sizes in display order ───────────────────────────────────────────
const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'];

// ── SKU suggestion ─────────────────────────────────────────────────────────────
function suggestSku(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(' ')
    .map((w) => w.slice(0, 3))
    .join('')
    .slice(0, 8);
}

// ── Currency formatter ─────────────────────────────────────────────────────────
function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

// ── Size chip + qty row ────────────────────────────────────────────────────────
interface SizeEntry {
  size: string;
  checked: boolean;
  qty: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

function NewProductContent() {
  const router = useRouter();
  const { user } = useAuthContext();
  const retailTemplateId = CLOTHING_TEMPLATE_ID;

  // ── State ──────────────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Required fields
  const [name, setName] = useState('');
  const [baseSku, setBaseSku] = useState('');
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [baseSellingPrice, setBaseSellingPrice] = useState('');
  const [baseCostPrice, setBaseCostPrice] = useState('');

  // Sizes
  const [sizes, setSizes] = useState<SizeEntry[]>(
    STANDARD_SIZES.map((s) => ({ size: s, checked: false, qty: 1 }))
  );

  // Optional / attributes
  const [productAttrDefs, setProductAttrDefs] = useState<AttributeDefinition[]>([]);
  const [productAttrValues, setProductAttrValues] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  // The variant-level 'Size' definition. Each variant records its size as an
  // attribute value, not just as an SKU suffix — that is what makes
  // size-wise inventory views and size-demand reporting possible.
  const [sizeAttrDefId, setSizeAttrDefId] = useState<string | null>(null);

  // ── Load attribute definitions ─────────────────────────────────────────────
  useEffect(() => {
    AttributeService
      .getDefinitions(retailTemplateId, 'product')
      .then(setProductAttrDefs)
      .catch(() => { });

    AttributeService
      .getDefinitions(retailTemplateId, 'variant')
      .then((defs) => setSizeAttrDefId(defs.find((d) => d.name === 'Size')?.id ?? null))
      .catch(() => { });
  }, [retailTemplateId]);

  // ── Auto-suggest SKU ───────────────────────────────────────────────────────
  useEffect(() => {
    if (name && !skuManuallyEdited) {
      setBaseSku(suggestSku(name));
    }
  }, [name, skuManuallyEdited]);

  // ── Derived summary values ─────────────────────────────────────────────────
  const summary = useMemo(() => {
    const sp = parseFloat(baseSellingPrice) || 0;
    const cp = parseFloat(baseCostPrice) || 0;
    const totalQty = sizes.filter((s) => s.checked).reduce((acc, s) => acc + (s.qty || 0), 0);
    const totalPurchaseValue = cp * totalQty;
    const expectedSalesValue = sp * totalQty;
    const potentialGrossProfit = expectedSalesValue - totalPurchaseValue;
    const margin = expectedSalesValue > 0 ? (potentialGrossProfit / expectedSalesValue) * 100 : 0;
    return { totalQty, totalPurchaseValue, expectedSalesValue, potentialGrossProfit, margin };
  }, [baseSellingPrice, baseCostPrice, sizes]);

  // ── Toggle size chip ───────────────────────────────────────────────────────
  const toggleSize = useCallback((size: string) => {
    setSizes((prev) =>
      prev.map((s) => (s.size === size ? { ...s, checked: !s.checked } : s))
    );
  }, []);

  const updateQty = useCallback((size: string, qty: number) => {
    setSizes((prev) =>
      prev.map((s) => (s.size === size ? { ...s, qty: Math.max(1, qty) } : s))
    );
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Product name is required.';
    if (!baseSku.trim()) errs.baseSku = 'SKU is required.';
    if (!categoryId) errs.category = 'Please select a category.';
    if (!baseSellingPrice || parseFloat(baseSellingPrice) <= 0)
      errs.sellingPrice = 'Enter a valid selling price.';
    if (!baseCostPrice || parseFloat(baseCostPrice) < 0)
      errs.costPrice = 'Enter a valid cost price.';
    if (!sizes.some((s) => s.checked))
      errs.sizes = 'Select at least one size.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !user?.storeId) return;
    setServerError(null);
    setIsSubmitting(true);
    try {
      const selectedSizes = sizes.filter((s) => s.checked);
      const input: CreateProductInput = {
        storeId: user.storeId,
        retailTemplateId,
        categoryId,
        subcategoryId: subcategoryId || undefined,
        name: name.trim(),
        baseSku: baseSku.trim(),
        description: description.trim() || undefined,
        baseSellingPrice: parseFloat(baseSellingPrice),
        baseCostPrice: parseFloat(baseCostPrice),
        status: 'ACTIVE',
        attributeValues: productAttrDefs
          .map((d) => ({ attributeDefinitionId: d.id, value: productAttrValues[d.id] ?? '' }))
          .filter((av) => av.value),
        variants: selectedSizes.map((s) => ({
          sku: `${baseSku.trim()}-${s.size.replace(/\s+/g, '').toUpperCase()}`,
          displayName: `${name.trim()} — ${s.size}`,
          attributeValues: sizeAttrDefId
            ? [{ attributeDefinitionId: sizeAttrDefId, value: s.size }]
            : [],
          initialStock: {
            quantity: s.qty,
            purchaseCostPrice: parseFloat(baseCostPrice),
            purchaseDate: new Date().toISOString().split('T')[0],
          },
        })),
        createdBy: user.id,
      };
      const product = await ProductService.createProduct(input);
      setSubmitSuccess(true);
      setTimeout(() => router.push(`/products/${product.id}`), 1400);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to create product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (submitSuccess) {
    return (
      <div className="pe-success-screen" role="status" aria-live="polite">
        <div className="pe-success-icon" aria-hidden="true">✓</div>
        <h2 className="pe-success-title">Product Created</h2>
        <p className="pe-success-desc">
          {summary.totalQty} physical item{summary.totalQty !== 1 ? 's' : ''} added to stock with unique barcodes.
          Taking you to the product page…
        </p>
      </div>
    );
  }

  const checkedSizes = sizes.filter((s) => s.checked);
  const sp = parseFloat(baseSellingPrice) || 0;
  const cp = parseFloat(baseCostPrice) || 0;

  return (
    <form
      id="new-product-form"
      className="pe-layout"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Add new product form"
    >
      {/* ── Left / main column ──────────────────────────────────────── */}
      <div className="pe-main">

        {/* Page header */}
        <div className="pe-page-header">
          <a href="/products" className="page-back-link" aria-label="Back to products">
            ← Products
          </a>
          <h1 className="page-title">Add New Product</h1>
          <p className="page-subtitle">
            Fill in the required details below. Optional attributes help with search and reports.
          </p>
        </div>

        {/* Server error */}
        {serverError && (
          <div className="form-server-error" role="alert">
            <strong>Error:</strong> {serverError}
          </div>
        )}

        {/* ── Section 1: Required Details ─────────────────────────── */}
        <section className="pe-card" aria-labelledby="section-required">
          <header className="pe-card__header">
            <h2 className="pe-card__title" id="section-required">Required Details</h2>
          </header>

          <div className="pe-card__body">

            {/* Product name */}
            <div className={`form-field ${fieldErrors.name ? 'form-field--error' : ''}`}>
              <label className="form-label" htmlFor="pe-name">
                Product Name <span className="form-required">*</span>
              </label>
              <input
                id="pe-name"
                className="form-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Blue Denim Jacket"
                aria-required="true"
                aria-describedby={fieldErrors.name ? 'pe-name-error' : undefined}
              />
              {fieldErrors.name && (
                <span id="pe-name-error" className="form-error" role="alert">
                  {fieldErrors.name}
                </span>
              )}
            </div>

            {/* SKU */}
            <div className={`form-field ${fieldErrors.baseSku ? 'form-field--error' : ''}`}>
              <label className="form-label" htmlFor="pe-sku">
                Base SKU <span className="form-required">*</span>
              </label>
              <input
                id="pe-sku"
                className="form-input pe-mono"
                type="text"
                value={baseSku}
                onChange={(e) => {
                  setBaseSku(e.target.value.toUpperCase());
                  setSkuManuallyEdited(true);
                }}
                placeholder="e.g. BLUDENJ"
                aria-required="true"
                aria-describedby="pe-sku-hint"
              />
              <span id="pe-sku-hint" className="form-hint">
                Auto-suggested from the product name. Variants will suffix this (e.g. BLUDENJ-M).
              </span>
              {fieldErrors.baseSku && (
                <span className="form-error" role="alert">{fieldErrors.baseSku}</span>
              )}
            </div>

            {/* Category */}
            <div className={fieldErrors.category ? 'form-field--error' : ''}>
              <CategorySelect
                retailTemplateId={retailTemplateId}
                categoryId={categoryId}
                subcategoryId={subcategoryId}
                onCategoryChange={setCategoryId}
                onSubcategoryChange={setSubcategoryId}
                required
              />
              {fieldErrors.category && (
                <span className="form-error" role="alert">{fieldErrors.category}</span>
              )}
            </div>

            {/* Pricing row */}
            <div className="form-section">
              <div className="form-section__title">Pricing</div>
              <div className="form-grid">
                <div className={`form-field ${fieldErrors.sellingPrice ? 'form-field--error' : ''}`}>
                  <label className="form-label" htmlFor="pe-selling-price">
                    Selling Price (₹) <span className="form-required">*</span>
                  </label>
                  <div className="pe-input-prefix-wrap">
                    <span className="pe-input-prefix" aria-hidden="true">₹</span>
                    <input
                      id="pe-selling-price"
                      className="form-input pe-input-with-prefix"
                      type="number"
                      min={0}
                      step="0.01"
                      value={baseSellingPrice}
                      onChange={(e) => setBaseSellingPrice(e.target.value)}
                      placeholder="0.00"
                      aria-required="true"
                    />
                  </div>
                  {fieldErrors.sellingPrice && (
                    <span className="form-error" role="alert">{fieldErrors.sellingPrice}</span>
                  )}
                </div>
                <div className={`form-field ${fieldErrors.costPrice ? 'form-field--error' : ''}`}>
                  <label className="form-label" htmlFor="pe-cost-price">
                    Cost Price (₹) <span className="form-required">*</span>
                  </label>
                  <div className="pe-input-prefix-wrap">
                    <span className="pe-input-prefix" aria-hidden="true">₹</span>
                    <input
                      id="pe-cost-price"
                      className="form-input pe-input-with-prefix"
                      type="number"
                      min={0}
                      step="0.01"
                      value={baseCostPrice}
                      onChange={(e) => setBaseCostPrice(e.target.value)}
                      placeholder="0.00"
                      aria-required="true"
                    />
                  </div>
                  {fieldErrors.costPrice && (
                    <span className="form-error" role="alert">{fieldErrors.costPrice}</span>
                  )}
                </div>
              </div>
              {/* Inline margin hint */}
              {sp > 0 && cp > 0 && (
                <div className={`pe-margin-hint ${sp < cp ? 'pe-margin-hint--loss' : ''}`}>
                  {sp >= cp ? (
                    <>
                      Margin: <strong>{fmt(sp - cp)}</strong> per unit
                      ({(((sp - cp) / sp) * 100).toFixed(1)}%)
                    </>
                  ) : (
                    <>⚠ Cost exceeds selling price — you'd be selling at a loss.</>
                  )}
                </div>
              )}
            </div>

            {/* Size chips */}
            <div className="form-section">
              <div className="form-section__title">
                Sizes &amp; Quantities <span className="form-required">*</span>
              </div>
              <p className="form-hint" style={{ marginBottom: 'var(--space-3)' }}>
                Select the sizes you stock. A quantity field appears for each selected size.
              </p>
              <div className="pe-size-grid" role="group" aria-label="Select sizes">
                {STANDARD_SIZES.map((size) => {
                  const entry = sizes.find((s) => s.size === size)!;
                  return (
                    <div key={size} className="pe-size-chip-wrap">
                      <button
                        id={`size-chip-${size}`}
                        type="button"
                        role="checkbox"
                        aria-checked={entry.checked}
                        className={`pe-size-chip ${entry.checked ? 'pe-size-chip--checked' : ''}`}
                        onClick={() => toggleSize(size)}
                      >
                        {size}
                      </button>
                      {entry.checked && (
                        <div className="pe-size-qty" aria-label={`Quantity for size ${size}`}>
                          <label
                            htmlFor={`size-qty-${size}`}
                            className="pe-size-qty__label"
                          >
                            Qty
                          </label>
                          <input
                            id={`size-qty-${size}`}
                            type="number"
                            min={1}
                            className="form-input pe-size-qty__input"
                            value={entry.qty}
                            onChange={(e) => updateQty(size, parseInt(e.target.value) || 1)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {fieldErrors.sizes && (
                <span className="form-error" role="alert">{fieldErrors.sizes}</span>
              )}
              {checkedSizes.length > 0 && (
                <div className="pe-size-summary">
                  {checkedSizes.map((s) => (
                    <span key={s.size} className="badge badge--denim badge--sm">
                      {s.size} × {s.qty}
                    </span>
                  ))}
                </div>
              )}
            </div>

          </div>
        </section>

        {/* ── Section 2: Optional / Additional Details ────────────── */}
        <section className="pe-card" aria-labelledby="section-optional">
          <button
            type="button"
            id="pe-optional-toggle"
            className="pe-card__collapse-header"
            aria-expanded={optionalOpen}
            aria-controls="pe-optional-body"
            onClick={() => setOptionalOpen((v) => !v)}
          >
            <h2 className="pe-card__title" id="section-optional">
              Additional Details
              <span className="badge badge--neutral badge--sm" style={{ marginLeft: 'var(--space-2)' }}>
                Optional
              </span>
            </h2>
            <span className="pe-card__collapse-icon" aria-hidden="true">
              {optionalOpen ? '▲' : '▼'}
            </span>
          </button>

          {optionalOpen && (
            <div id="pe-optional-body" className="pe-card__body">

              {/* Photo upload dropzone */}
              <div className="form-field">
                <label className="form-label">
                  Product Photo
                  <span className="badge badge--neutral badge--sm" style={{ marginLeft: 'var(--space-2)' }}>
                    Optional
                  </span>
                </label>
                <div
                  id="pe-photo-dropzone"
                  className={`pe-dropzone ${dragOver ? 'pe-dropzone--active' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload product photo — drag and drop or click to browse"
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}
                >
                  <span className="pe-dropzone__icon" aria-hidden="true">📷</span>
                  <span className="pe-dropzone__label">Drop a photo here, or click to browse</span>
                  <span className="pe-dropzone__hint">JPG or PNG · max 5 MB · AI analysis coming soon</span>
                </div>
              </div>

              {/* Product-level attributes */}
              {productAttrDefs.length > 0 && (
                <div className="form-section">
                  <div className="form-section__title">Product Attributes</div>
                  <div className="form-grid">
                    {productAttrDefs.map((def) => (
                      <AttributeFieldRenderer
                        key={def.id}
                        definition={def}
                        value={productAttrValues[def.id] ?? ''}
                        onChange={(v) =>
                          setProductAttrValues((prev) => ({ ...prev, [def.id]: v }))
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="form-field">
                <label className="form-label" htmlFor="pe-description">Description</label>
                <textarea
                  id="pe-description"
                  className="form-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Classic selvedge denim jacket with copper rivets. Machine wash cold."
                  rows={3}
                />
                <span className="form-hint">Shown on product detail page and invoices.</span>
              </div>
            </div>
          )}
        </section>

        {/* Form actions */}
        <div className="form-actions">
          <a href="/products" className="btn btn-secondary">
            Cancel
          </a>
          <button
            id="pe-submit-btn"
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                Creating…
              </>
            ) : (
              'Create Product'
            )}
          </button>
        </div>
      </div>

      {/* ── Summary panel (sticky right rail) ───────────────────── */}
      <aside className="pe-summary" aria-label="Live order summary">
        <div className="pe-summary__inner">
          <h3 className="pe-summary__title">Summary</h3>
          <dl className="pe-summary__rows">
            <div className="pe-summary__row">
              <dt className="pe-summary__label">Total Quantity</dt>
              <dd className="pe-summary__value pe-summary__value--qty">
                {summary.totalQty > 0 ? summary.totalQty : '—'}
              </dd>
            </div>
            <div className="pe-summary__row">
              <dt className="pe-summary__label">Purchase Value</dt>
              <dd className="pe-summary__value">
                {summary.totalPurchaseValue > 0 ? fmt(summary.totalPurchaseValue) : '—'}
              </dd>
            </div>
            <div className="pe-summary__row">
              <dt className="pe-summary__label">Expected Sales</dt>
              <dd className="pe-summary__value">
                {summary.expectedSalesValue > 0 ? fmt(summary.expectedSalesValue) : '—'}
              </dd>
            </div>
            <div className={`pe-summary__row pe-summary__row--profit ${summary.potentialGrossProfit < 0 ? 'pe-summary__row--loss' : ''}`}>
              <dt className="pe-summary__label">Gross Profit</dt>
              <dd className={`pe-summary__value ${summary.potentialGrossProfit > 0 ? 'pe-summary__value--profit' : summary.potentialGrossProfit < 0 ? 'pe-summary__value--loss' : ''}`}>
                {summary.potentialGrossProfit !== 0
                  ? fmt(summary.potentialGrossProfit)
                  : '—'}
              </dd>
            </div>
          </dl>
          {summary.totalQty > 0 && summary.expectedSalesValue > 0 && (
            <div className={`pe-summary__margin-bar ${summary.margin < 0 ? 'pe-summary__margin-bar--loss' : ''}`}>
              <div className="pe-summary__margin-track">
                <div
                  className="pe-summary__margin-fill"
                  style={{ width: `${Math.min(Math.max(summary.margin, 0), 100)}%` }}
                />
              </div>
              <span className="pe-summary__margin-label">
                {summary.margin >= 0
                  ? `${summary.margin.toFixed(1)}% margin`
                  : `${Math.abs(summary.margin).toFixed(1)}% loss`}
              </span>
            </div>
          )}
          {/* Sizes selected chips */}
          {checkedSizes.length > 0 && (
            <div className="pe-summary__sizes">
              <span className="pe-summary__sizes-label">Sizes:</span>
              <div className="pe-summary__sizes-chips">
                {checkedSizes.map((s) => (
                  <span key={s.size} className="badge badge--neutral badge--sm">
                    {s.size}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Placeholder state */}
          {summary.totalQty === 0 && (
            <p className="pe-summary__empty">
              Select sizes and enter prices to see a live profit summary.
            </p>
          )}
        </div>
      </aside>
    </form>
  );
}

export default function NewProductPage() {
  return (
    <PermissionGuard permissionKey="inventory:edit" redirect>
      <NewProductContent />
    </PermissionGuard>
  );
}
