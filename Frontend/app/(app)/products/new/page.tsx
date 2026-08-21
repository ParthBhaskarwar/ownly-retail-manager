'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { AuthGuard, PermissionGuard } from '@/shared/components/PermissionGuard';
import { ProductService } from '@/modules/product/services/ProductService';
import { CategorySelect } from '@/modules/catalog/components/CategorySelect';
import { AttributeFieldRenderer } from '@/modules/attributes/components/AttributeFieldRenderer';
import { VariantAttributeSet } from '@/modules/attributes/components/AttributeFieldRenderer';
import { Adapters } from '@/adapters';
import type { AttributeDefinition } from '@/modules/attributes/types';
import type { CreateProductInput, CreateVariantInput } from '@/modules/product/types';
import { CLOTHING_TEMPLATE_ID } from '@/db/seeds/clothing-attributes';

// ── Wizard step config ────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Basic Details' },
  { id: 2, label: 'Pricing' },
  { id: 3, label: 'Product Details' },
  { id: 4, label: 'Variants' },
  { id: 5, label: 'Review' },
];

// ── Default empty variant ─────────────────────────────────────────────────────
function emptyVariant(): CreateVariantInput & { _key: string } {
  return {
    _key: Math.random().toString(36).slice(2),
    sku: '',
    displayName: '',
    sellingPriceOverride: undefined,
    costPriceOverride: undefined,
    attributeValues: [],
  };
}

// ── SKU suggestion from name ──────────────────────────────────────────────────
function suggestSku(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(' ')
    .map((w) => w.slice(0, 3))
    .join('')
    .slice(0, 8);
}

// ─────────────────────────────────────────────────────────────────────────────

function NewProductContent() {
  const router = useRouter();
  const { user } = useAuthContext();
  const retailTemplateId = CLOTHING_TEMPLATE_ID;

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — Basic Details
  const [name, setName] = useState('');
  const [baseSku, setBaseSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');

  // Step 2 — Pricing
  const [baseSellingPrice, setBaseSellingPrice] = useState('');
  const [baseCostPrice, setBaseCostPrice] = useState('');
  const [description, setDescription] = useState('');

  // Step 3 — Product Attributes
  const [productAttrDefs, setProductAttrDefs] = useState<AttributeDefinition[]>([]);
  const [productAttrValues, setProductAttrValues] = useState<Record<string, string>>({});

  // Step 4 — Variants
  const [variantAttrDefs, setVariantAttrDefs] = useState<AttributeDefinition[]>([]);
  const [variants, setVariants] = useState<(CreateVariantInput & { _key: string })[]>([emptyVariant()]);

  // Load attribute definitions
  useEffect(() => {
    async function loadDefs() {
      const [productDefs, variantDefs] = await Promise.all([
        Adapters.attribute.findProductLevelDefinitions(retailTemplateId),
        Adapters.attribute.findVariantLevelDefinitions(retailTemplateId),
      ]);
      setProductAttrDefs(productDefs);
      setVariantAttrDefs(variantDefs);
    }
    void loadDefs();
  }, [retailTemplateId]);

  // Auto-suggest SKU from name
  useEffect(() => {
    if (name && !baseSku) setBaseSku(suggestSku(name));
  }, [name]);

  const updateVariant = (key: string, updates: Partial<CreateVariantInput>) => {
    setVariants((prev) =>
      prev.map((v) => (v._key === key ? { ...v, ...updates } : v))
    );
  };

  const updateVariantAttr = (key: string, defId: string, value: string) => {
    setVariants((prev) =>
      prev.map((v) => {
        if (v._key !== key) return v;
        const existing = v.attributeValues.filter((av) => av.attributeDefinitionId !== defId);
        return { ...v, attributeValues: [...existing, { attributeDefinitionId: defId, value }] };
      })
    );
  };

  const addVariant = () => setVariants((prev) => [...prev, emptyVariant()]);
  const removeVariant = (key: string) =>
    setVariants((prev) => prev.filter((v) => v._key !== key));

  // Auto-suggest variant SKU + display name
  const handleVariantAttrChange = (variantKey: string, defId: string, value: string) => {
    updateVariantAttr(variantKey, defId, value);
    // Auto-suggest display name if Size changed
    const sizeDef = variantAttrDefs.find((d) => d.name === 'Size');
    if (sizeDef && defId === sizeDef.id && value) {
      const variant = variants.find((v) => v._key === variantKey);
      if (variant) {
        const newSku = `${baseSku}-${value.replace(/\s+/g, '').toUpperCase()}`;
        const newDisplayName = name ? `${name} — ${value}` : value;
        updateVariant(variantKey, { sku: newSku, displayName: newDisplayName });
      }
    }
  };

  const handleSubmit = async () => {
    if (!user?.storeId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const input: CreateProductInput = {
        storeId: user.storeId,
        retailTemplateId,
        categoryId,
        subcategoryId: subcategoryId || undefined,
        name,
        baseSku,
        description: description || undefined,
        baseSellingPrice: parseFloat(baseSellingPrice),
        baseCostPrice: parseFloat(baseCostPrice),
        status: 'ACTIVE',
        attributeValues: productAttrDefs.map((d) => ({
          attributeDefinitionId: d.id,
          value: productAttrValues[d.id] ?? '',
        })).filter((av) => av.value),
        variants: variants.map((v) => ({
          sku: v.sku,
          displayName: v.displayName,
          sellingPriceOverride: v.sellingPriceOverride,
          costPriceOverride: v.costPriceOverride,
          attributeValues: v.attributeValues,
        })),
        createdBy: user.id,
      };

      const product = await ProductService.createProduct(input);
      router.push(`/products/${product.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product.');
      setStep(1);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step validation ────────────────────────────────────────────────────────
  const step1Valid = name.trim() && baseSku.trim() && categoryId;
  const step2Valid = parseFloat(baseSellingPrice) > 0 && parseFloat(baseCostPrice) >= 0;
  const step4Valid = variants.length > 0 && variants.every((v) => v.sku && v.displayName);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-content">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/products" className="breadcrumb__link">Products</a>
        <span className="breadcrumb__sep">/</span>
        <span className="breadcrumb__current">Add Product</span>
      </nav>

      <h1 className="page-header__title">Add New Product</h1>

      {/* Wizard progress */}
      <ol className="wizard-steps" aria-label="Wizard steps">
        {STEPS.map((s) => (
          <li
            key={s.id}
            className={`wizard-step ${step === s.id ? 'wizard-step--active' : ''} ${step > s.id ? 'wizard-step--done' : ''}`}
            aria-current={step === s.id ? 'step' : undefined}
          >
            <span className="wizard-step__num">{step > s.id ? '✓' : s.id}</span>
            <span className="wizard-step__label">{s.label}</span>
          </li>
        ))}
      </ol>

      {error && <div className="alert alert--error" role="alert">{error}</div>}

      {/* Step 1 — Basic Details */}
      {step === 1 && (
        <div className="wizard-panel animate-fade-in">
          <div className="form-field">
            <label className="form-field__label" htmlFor="product-name">
              Product Name <span className="form-field__required">*</span>
            </label>
            <input
              id="product-name"
              className="form-field__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Blue Denim Jacket"
              required
            />
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="product-sku">
              Base SKU <span className="form-field__required">*</span>
            </label>
            <input
              id="product-sku"
              className="form-field__input"
              type="text"
              value={baseSku}
              onChange={(e) => setBaseSku(e.target.value.toUpperCase())}
              placeholder="e.g. BLU-DNM-JKT"
              required
            />
            <span className="form-field__hint">Unique identifier for this product. Variants will inherit this with a suffix.</span>
          </div>

          <CategorySelect
            retailTemplateId={retailTemplateId}
            categoryId={categoryId}
            subcategoryId={subcategoryId}
            onCategoryChange={setCategoryId}
            onSubcategoryChange={setSubcategoryId}
            required
          />
        </div>
      )}

      {/* Step 2 — Pricing */}
      {step === 2 && (
        <div className="wizard-panel animate-fade-in">
          <div className="form-row">
            <div className="form-field">
              <label className="form-field__label" htmlFor="product-selling-price">
                Selling Price (₹) <span className="form-field__required">*</span>
              </label>
              <input
                id="product-selling-price"
                className="form-field__input"
                type="number"
                min={0}
                step="0.01"
                value={baseSellingPrice}
                onChange={(e) => setBaseSellingPrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="product-cost-price">
                Cost Price (₹) <span className="form-field__required">*</span>
              </label>
              <input
                id="product-cost-price"
                className="form-field__input"
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
          <div className="form-field">
            <label className="form-field__label" htmlFor="product-description">Description</label>
            <textarea
              id="product-description"
              className="form-field__input form-field__textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional product description"
              rows={3}
            />
          </div>
        </div>
      )}

      {/* Step 3 — Product Attributes */}
      {step === 3 && (
        <div className="wizard-panel animate-fade-in">
          <p className="wizard-panel__hint">
            These attributes describe the product as a whole (e.g. Material, Pattern).
            Attributes that differentiate sizes/variants are set in the next step.
          </p>
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
          {productAttrDefs.length === 0 && (
            <p className="form-field__hint">No product-level attributes configured for this retail type.</p>
          )}
        </div>
      )}

      {/* Step 4 — Variants */}
      {step === 4 && (
        <div className="wizard-panel animate-fade-in">
          <p className="wizard-panel__hint">
            Add at least one variant. Each variant represents a specific size or variation.
          </p>
          {variants.map((variant, idx) => (
            <div key={variant._key} className="variant-form-block">
              <div className="variant-form-block__header">
                <span className="variant-form-block__title">Variant {idx + 1}</span>
                {variants.length > 1 && (
                  <button
                    type="button"
                    id={`remove-variant-${idx}`}
                    className="btn btn--ghost btn--sm btn--danger"
                    onClick={() => removeVariant(variant._key)}
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Variant-level attributes (e.g. Size) */}
              <VariantAttributeSet
                definitions={variantAttrDefs}
                values={Object.fromEntries(
                  variant.attributeValues.map((av) => [av.attributeDefinitionId, av.value])
                )}
                onChange={(defId, value) => handleVariantAttrChange(variant._key, defId, value)}
              />

              <div className="form-row">
                <div className="form-field">
                  <label className="form-field__label" htmlFor={`variant-displayname-${idx}`}>
                    Display Name <span className="form-field__required">*</span>
                  </label>
                  <input
                    id={`variant-displayname-${idx}`}
                    className="form-field__input"
                    type="text"
                    value={variant.displayName}
                    onChange={(e) => updateVariant(variant._key, { displayName: e.target.value })}
                    placeholder={`e.g. ${name || 'Product'} — XL`}
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor={`variant-sku-${idx}`}>
                    Variant SKU <span className="form-field__required">*</span>
                  </label>
                  <input
                    id={`variant-sku-${idx}`}
                    className="form-field__input"
                    type="text"
                    value={variant.sku}
                    onChange={(e) => updateVariant(variant._key, { sku: e.target.value.toUpperCase() })}
                    placeholder={`${baseSku}-XL`}
                    required
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            id="add-variant-btn"
            className="btn btn--secondary"
            onClick={addVariant}
          >
            + Add Another Variant
          </button>
        </div>
      )}

      {/* Step 5 — Review */}
      {step === 5 && (
        <div className="wizard-panel animate-fade-in">
          <div className="review-section">
            <h3 className="review-section__title">Product</h3>
            <dl className="review-list">
              <div className="review-list__row"><dt>Name</dt><dd>{name}</dd></div>
              <div className="review-list__row"><dt>SKU</dt><dd><code>{baseSku}</code></dd></div>
              <div className="review-list__row"><dt>Selling Price</dt><dd>₹{parseFloat(baseSellingPrice).toLocaleString('en-IN')}</dd></div>
              <div className="review-list__row"><dt>Cost Price</dt><dd>₹{parseFloat(baseCostPrice).toLocaleString('en-IN')}</dd></div>
            </dl>
          </div>
          <div className="review-section">
            <h3 className="review-section__title">Variants ({variants.length})</h3>
            {variants.map((v, i) => (
              <div key={v._key} className="review-variant-row">
                <span>{i + 1}. {v.displayName}</span>
                <code className="sku-badge">{v.sku}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wizard navigation */}
      <div className="wizard-nav">
        {step > 1 && (
          <button
            id="wizard-back"
            className="btn btn--ghost"
            type="button"
            onClick={() => setStep((s) => s - 1)}
            disabled={isSubmitting}
          >
            ← Back
          </button>
        )}
        <div className="wizard-nav__spacer" />
        {step < 5 && (
          <button
            id="wizard-next"
            className="btn btn--primary"
            type="button"
            disabled={
              (step === 1 && !step1Valid) ||
              (step === 2 && !step2Valid) ||
              (step === 4 && !step4Valid)
            }
            onClick={() => setStep((s) => s + 1)}
          >
            Next →
          </button>
        )}
        {step === 5 && (
          <button
            id="wizard-submit"
            className="btn btn--primary"
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating Product…' : 'Create Product'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function NewProductPage() {
  return (
    <PermissionGuard permissionKey="inventory:edit" redirect>
      <NewProductContent />
    </PermissionGuard>
  );
}
