'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { ProductService } from '@/modules/product/services/ProductService';
import { CategorySelect } from '@/modules/catalog/components/CategorySelect';
import { CategoryAttributeForm } from '@/modules/attributes/components/CategoryAttributeForm';
import { ProductPhotoUploader } from '@/modules/product/components/ProductPhotoUploader';
import { AttributeService, CategoryService } from '@/modules/catalog/services/CategoryService';
import { SupplierSelect } from '@/modules/catalog/components/SupplierSelect';
import type { AttributeDefinition } from '@/modules/attributes/types';
import { applyPhotoSuggestions } from '@/modules/attributes/applySuggestions';
import type { CreateProductInput } from '@/modules/product/types';
import type { Category } from '@/modules/catalog/types';
import type { AttributeSuggestions } from '@/modules/product/types';
import { CLOTHING_TEMPLATE_ID } from '@/config/retail-templates';

// Standard clothing sizes
const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'];

function suggestSku(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(' ')
    .map((w) => w.slice(0, 3))
    .join('')
    .slice(0, 8);
}

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

interface SizeEntry {
  size: string;
  checked: boolean;
  qty: number;
}

function NewProductContent() {
  const router = useRouter();
  const { user } = useAuthContext();
  const { store } = useStoreContext();
  const retailTemplateId = CLOTHING_TEMPLATE_ID;

  // Form State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Required Fields
  const [name, setName] = useState('');
  const [baseSku, setBaseSku] = useState('');
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [baseSellingPrice, setBaseSellingPrice] = useState('');
  const [baseCostPrice, setBaseCostPrice] = useState('');
  const [description, setDescription] = useState('');

  // Photos
  const [images, setImages] = useState<string[]>([]);

  // Taxonomy & Suppliers Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [productAttrDefs, setProductAttrDefs] = useState<AttributeDefinition[]>([]);
  const [productAttrValues, setProductAttrValues] = useState<Record<string, string>>({});
  const [sizeAttrDefId, setSizeAttrDefId] = useState<string | null>(null);

  // Sizes Grid
  const [sizes, setSizes] = useState<SizeEntry[]>(
    STANDARD_SIZES.map((s) => ({ size: s, checked: false, qty: 1 }))
  );

  const storeId = store?.id ?? user?.storeId ?? '';

  // Load Attribute Definitions & Categories & Suppliers
  useEffect(() => {
    AttributeService
      .getDefinitions(retailTemplateId, 'product')
      .then(setProductAttrDefs)
      .catch(() => {});

    AttributeService
      .getDefinitions(retailTemplateId, 'variant')
      .then((defs) => setSizeAttrDefId(defs.find((d) => d.name === 'Size')?.id ?? null))
      .catch(() => {});

    CategoryService.getCategories().then(setCategories).catch(() => {});

  }, [retailTemplateId, storeId]);

  // Selected Category Name for filtering attributes
  const selectedCategoryName = useMemo(() => {
    return categories.find((c) => c.id === categoryId)?.name;
  }, [categories, categoryId]);

  // SKU Auto-suggestion
  useEffect(() => {
    if (name && !skuManuallyEdited) {
      setBaseSku(suggestSku(name));
    }
  }, [name, skuManuallyEdited]);

  // Live Summary
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

  const handleAISuggestions = (suggestions: AttributeSuggestions) => {
    setProductAttrValues((prev) => applyPhotoSuggestions(productAttrDefs, prev, suggestions));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Product name is required.';
    if (!baseSku.trim()) errs.baseSku = 'Base SKU is required.';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setServerError(null);
    setIsSubmitting(true);

    try {
      const selectedSizes = sizes.filter((s) => s.checked);
      const input: CreateProductInput & { imageUrls?: string[] } = {
        storeId,
        retailTemplateId,
        categoryId,
        subcategoryId: subcategoryId || undefined,
        supplierId: supplierId || undefined,
        name: name.trim(),
        baseSku: baseSku.trim(),
        description: description.trim() || undefined,
        baseSellingPrice: parseFloat(baseSellingPrice),
        baseCostPrice: parseFloat(baseCostPrice),
        status: 'ACTIVE',
        imageUrls: images,
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
        createdBy: user?.id ?? 'user-1',
      };

      const product = await ProductService.createProduct(input as CreateProductInput);
      setSubmitSuccess(true);
      setTimeout(() => router.push(`/products/${product.id}`), 1400);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to create product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <div className="pe-success-screen" role="status" aria-live="polite">
        <div className="pe-success-icon" aria-hidden="true">✓</div>
        <h2 className="pe-success-title">Product Created Successfully</h2>
        <p className="pe-success-desc">
          {summary.totalQty} physical item{summary.totalQty !== 1 ? 's' : ''} added to stock with unique barcodes.
          Taking you to the product page…
        </p>
      </div>
    );
  }

  const checkedSizes = sizes.filter((s) => s.checked);

  return (
    <form id="new-product-form" className="pe-layout" onSubmit={handleSubmit} noValidate aria-label="Add new clothing product form">
      <div className="pe-main space-y-6">
        {/* Header */}
        <div className="pe-page-header">
          <a href="/products" className="page-back-link" aria-label="Back to products">
            ← Products
          </a>
          <h1 className="page-title">Add New Clothing Product</h1>
          <p className="page-subtitle">
            Select category to load specific clothing attributes, add photos, variants, and opening stock.
          </p>
        </div>

        {serverError && (
          <div className="form-server-error" role="alert">
            <strong>Error:</strong> {serverError}
          </div>
        )}

        {/* Section 1: Category & Subcategory */}
        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">1. Product Taxonomy</h2>
          </header>
          <div className="pe-card__body space-y-4">
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

            {selectedCategoryName && (
              <div className="p-3 bg-violet-950/40 border border-violet-500/30 text-violet-300 text-xs rounded-lg">
                Selected Category: <strong>{selectedCategoryName}</strong>. Applicable clothing attributes will automatically render below.
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Basic Details */}
        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">2. Basic Information</h2>
          </header>
          <div className="pe-card__body space-y-4">
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
                placeholder="e.g. Slim Fit Denim Jeans"
                required
              />
              {fieldErrors.name && <span className="form-error">{fieldErrors.name}</span>}
            </div>

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
                placeholder="e.g. SLMJEAN"
                required
              />
              {fieldErrors.baseSku && <span className="form-error">{fieldErrors.baseSku}</span>}
            </div>

            <SupplierSelect
              id="pe-supplier"
              storeId={storeId}
              value={supplierId}
              onChange={setSupplierId}
              placeholder="-- Select Supplier --"
            />
          </div>
        </section>

        {/* Section 3: Category-Specific Attributes */}
        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">3. Category-Specific Attributes</h2>
          </header>
          <div className="pe-card__body">
            <CategoryAttributeForm
              definitions={productAttrDefs}
              categoryName={selectedCategoryName}
              values={productAttrValues}
              onChange={setProductAttrValues}
            />
          </div>
        </section>

        {/* Section 4: Product Photos */}
        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">4. Product Photos &amp; AI Analysis</h2>
          </header>
          <div className="pe-card__body">
            <ProductPhotoUploader
              images={images}
              onChange={setImages}
              onAISuggestions={handleAISuggestions}
            />
          </div>
        </section>

        {/* Section 5: Sizes & Quantity */}
        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">5. Sizes &amp; Opening Stock</h2>
          </header>
          <div className="pe-card__body">
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
                      <div className="pe-size-qty">
                        <label htmlFor={`size-qty-${size}`} className="pe-size-qty__label">Qty</label>
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
            {fieldErrors.sizes && <span className="form-error mt-2">{fieldErrors.sizes}</span>}
          </div>
        </section>

        {/* Section 6: Pricing & Margins */}
        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">6. Pricing Baseline</h2>
          </header>
          <div className="pe-card__body">
            <div className="form-grid">
              <div className={`form-field ${fieldErrors.sellingPrice ? 'form-field--error' : ''}`}>
                <label className="form-label" htmlFor="pe-selling-price">
                  Selling Price (₹) <span className="form-required">*</span>
                </label>
                <div className="pe-input-prefix-wrap">
                  <span className="pe-input-prefix">₹</span>
                  <input
                    id="pe-selling-price"
                    className="form-input pe-input-with-prefix"
                    type="number"
                    min={0}
                    step="0.01"
                    value={baseSellingPrice}
                    onChange={(e) => setBaseSellingPrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div className={`form-field ${fieldErrors.costPrice ? 'form-field--error' : ''}`}>
                <label className="form-label" htmlFor="pe-cost-price">
                  Cost Price (₹) <span className="form-required">*</span>
                </label>
                <div className="pe-input-prefix-wrap">
                  <span className="pe-input-prefix">₹</span>
                  <input
                    id="pe-cost-price"
                    className="form-input pe-input-with-prefix"
                    type="number"
                    min={0}
                    step="0.01"
                    value={baseCostPrice}
                    onChange={(e) => setBaseCostPrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="form-actions">
          <a href="/products" className="btn btn-secondary">Cancel</a>
          <button id="pe-submit-btn" type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Product...' : 'Create Product'}
          </button>
        </div>
      </div>

      {/* Summary Rail */}
      <aside className="pe-summary" aria-label="Live summary">
        <div className="pe-summary__inner">
          <h3 className="pe-summary__title">Product Summary</h3>
          <dl className="pe-summary__rows">
            <div className="pe-summary__row">
              <dt className="pe-summary__label">Total Units</dt>
              <dd className="pe-summary__value pe-summary__value--qty">{summary.totalQty || '—'}</dd>
            </div>
            <div className="pe-summary__row">
              <dt className="pe-summary__label">Purchase Value</dt>
              <dd className="pe-summary__value">{summary.totalPurchaseValue ? fmt(summary.totalPurchaseValue) : '—'}</dd>
            </div>
            <div className="pe-summary__row">
              <dt className="pe-summary__label">Expected Sales</dt>
              <dd className="pe-summary__value">{summary.expectedSalesValue ? fmt(summary.expectedSalesValue) : '—'}</dd>
            </div>
            <div className="pe-summary__row pe-summary__row--profit">
              <dt className="pe-summary__label">Gross Profit</dt>
              <dd className="pe-summary__value pe-summary__value--profit">
                {summary.potentialGrossProfit ? fmt(summary.potentialGrossProfit) : '—'}
              </dd>
            </div>
          </dl>

          {checkedSizes.length > 0 && (
            <div className="pe-summary__sizes pt-2">
              <span className="pe-summary__sizes-label">Sizes Selected:</span>
              <div className="pe-summary__sizes-chips mt-1">
                {checkedSizes.map((s) => (
                  <span key={s.size} className="badge badge--neutral badge--sm">
                    {s.size} × {s.qty}
                  </span>
                ))}
              </div>
            </div>
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
