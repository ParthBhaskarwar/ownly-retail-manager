'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { ProductService, VariantService } from '@/modules/product/services/ProductService';
import { CategorySelect } from '@/modules/catalog/components/CategorySelect';
import { CategoryAttributeForm } from '@/modules/attributes/components/CategoryAttributeForm';
import { ProductPhotoUploader } from '@/modules/product/components/ProductPhotoUploader';
import { AttributeService, SupplierService, CategoryService } from '@/modules/catalog/services/CategoryService';
import type { AttributeDefinition } from '@/modules/attributes/types';
import type { ProductDetail, ProductStatus } from '@/modules/product/types';
import type { Supplier, Category } from '@/modules/catalog/types';
import type { AttributeSuggestions } from '@/modules/product/types';
import { CLOTHING_TEMPLATE_ID } from '@/config/retail-templates';

interface ProductEditFormProps {
  productId: string;
}

export function ProductEditForm({ productId }: ProductEditFormProps) {
  const router = useRouter();
  const { user } = useAuthContext();
  const { store } = useStoreContext();
  const retailTemplateId = CLOTHING_TEMPLATE_ID;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductDetail | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [baseSku, setBaseSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [baseSellingPrice, setBaseSellingPrice] = useState('');
  const [baseCostPrice, setBaseCostPrice] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProductStatus>('ACTIVE');
  const [images, setImages] = useState<string[]>([]);
  const [originalImages, setOriginalImages] = useState<string[]>([]);

  // Suppliers, Categories & Attributes
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [productAttrDefs, setProductAttrDefs] = useState<AttributeDefinition[]>([]);
  const [productAttrValues, setProductAttrValues] = useState<Record<string, string>>({});

  // Variant Prices
  const [variantPrices, setVariantPrices] = useState<Record<string, { selling?: string; cost?: string }>>({});

  const storeId = store?.id ?? user?.storeId ?? '';

  useEffect(() => {
    if (!productId) return;

    setIsLoading(true);
    setServerError(null);

    Promise.all([
      ProductService.getProductDetail(productId),
      AttributeService.getDefinitions(retailTemplateId, 'product'),
      CategoryService.getCategories(),
      storeId ? SupplierService.getSuppliers(storeId) : Promise.resolve([]),
    ])
      .then(([detail, attrDefs, cats, supps]) => {
        if (!detail) {
          setServerError('Product not found.');
          setIsLoading(false);
          return;
        }

        setProduct(detail);
        setName(detail.name);
        setBaseSku(detail.baseSku);
        setCategoryId(detail.categoryId);
        setSubcategoryId(detail.subcategoryId || '');
        setSupplierId(detail.supplierId || '');
        setBaseSellingPrice(detail.baseSellingPrice.toString());
        setBaseCostPrice(detail.baseCostPrice.toString());
        setDescription(detail.description || '');
        setStatus(detail.status);
        setImages(detail.imageUrls || []);
        setOriginalImages(detail.imageUrls || []);

        setProductAttrDefs(attrDefs);
        setCategories(cats);
        setSuppliers(supps);

        // Map existing product attribute values
        const attrValObj: Record<string, string> = {};
        if (detail.attributes) {
          detail.attributes.forEach((attr) => {
            attrValObj[attr.definition.id] = attr.value;
          });
        }
        setProductAttrValues(attrValObj);

        // Map variant price overrides
        const varPricesObj: Record<string, { selling?: string; cost?: string }> = {};
        if (detail.variants) {
          detail.variants.forEach((v) => {
            varPricesObj[v.id] = {
              selling: v.sellingPriceOverride !== undefined && v.sellingPriceOverride !== null ? v.sellingPriceOverride.toString() : '',
              cost: v.costPriceOverride !== undefined && v.costPriceOverride !== null ? v.costPriceOverride.toString() : '',
            };
          });
        }
        setVariantPrices(varPricesObj);

        setIsLoading(false);
      })
      .catch((err) => {
        setServerError(err instanceof Error ? err.message : 'Failed to load product details.');
        setIsLoading(false);
      });
  }, [productId, storeId, retailTemplateId]);

  const selectedCategoryName = useMemo(() => {
    return categories.find((c) => c.id === categoryId)?.name;
  }, [categories, categoryId]);

  const handleAISuggestions = (suggestions: AttributeSuggestions) => {
    const updated = { ...productAttrValues };
    const colourDef = productAttrDefs.find((d) => d.name.toLowerCase() === 'colour' || d.name.toLowerCase() === 'color');
    const patternDef = productAttrDefs.find((d) => d.name.toLowerCase() === 'pattern');

    if (colourDef && suggestions.colours.length > 0 && !updated[colourDef.id]) {
      updated[colourDef.id] = suggestions.colours[0];
    }
    if (patternDef && suggestions.pattern && !updated[patternDef.id]) {
      updated[patternDef.id] = suggestions.pattern;
    }

    setProductAttrValues(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseSku.trim()) {
      setServerError('Product name and base SKU are required.');
      return;
    }

    setServerError(null);
    setIsSubmitting(true);

    try {
      const sp = parseFloat(baseSellingPrice);
      const cp = parseFloat(baseCostPrice);

      const attributeValues = productAttrDefs
        .map((d) => ({ attributeDefinitionId: d.id, value: productAttrValues[d.id] ?? '' }))
        .filter((av) => av.value);

      // Photos are sent as base64 and can be several MB each — only resend
      // them when the user actually changed something, so a plain price/name
      // edit on a product that already has photos doesn't re-upload them.
      const imagesChanged =
        images.length !== originalImages.length || images.some((img, i) => img !== originalImages[i]);

      await ProductService.updateProduct(productId, {
        name: name.trim(),
        categoryId,
        subcategoryId: subcategoryId || undefined,
        supplierId: supplierId || undefined,
        baseSellingPrice: isNaN(sp) ? undefined : sp,
        baseCostPrice: isNaN(cp) ? undefined : cp,
        description: description.trim() || undefined,
        status,
        ...(imagesChanged ? { imageUrls: images } : {}),
        attributeValues,
        updatedBy: user?.id || 'system',
      });

      // Update variant price overrides if modified
      if (product) {
        for (const v of product.variants) {
          const vp = variantPrices[v.id];
          if (vp) {
            const vSelling = vp.selling ? parseFloat(vp.selling) : undefined;
            const vCost = vp.cost ? parseFloat(vp.cost) : undefined;
            await VariantService.updateVariant(v.id, {
              sellingPriceOverride: vSelling,
              costPriceOverride: vCost,
            }, productId);
          }
        }
      }

      setSubmitSuccess(true);
      setTimeout(() => router.push(`/products/${productId}`), 1200);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to update product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center" role="status">
        <div className="btn-spinner inline-block mr-2" />
        <p className="text-gray-400 mt-2">Loading product details...</p>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="pe-success-screen" role="status" aria-live="polite">
        <div className="pe-success-icon" aria-hidden="true">✓</div>
        <h2 className="pe-success-title">Product Updated Successfully</h2>
        <p className="pe-success-desc">Returning to product details page...</p>
      </div>
    );
  }

  return (
    <form className="pe-layout" onSubmit={handleSubmit} noValidate aria-label="Edit product form">
      <div className="pe-main space-y-6">
        <div className="pe-page-header">
          <a href={`/products/${productId}`} className="page-back-link" aria-label="Back to product detail">
            ← Back to Product
          </a>
          <h1 className="page-title">Edit Product</h1>
          <p className="page-subtitle">Update product information, category-specific attributes, and photos.</p>
        </div>

        {serverError && (
          <div className="form-server-error" role="alert">
            <strong>Error:</strong> {serverError}
          </div>
        )}

        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">General Information</h2>
          </header>

          <div className="pe-card__body space-y-4">
            <div className="form-field">
              <label className="form-label" htmlFor="edit-name">Product Name <span className="form-required">*</span></label>
              <input
                id="edit-name"
                className="form-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="edit-sku">Base SKU</label>
              <input
                id="edit-sku"
                className="form-input pe-mono bg-slate-900 cursor-not-allowed"
                type="text"
                value={baseSku}
                disabled
              />
              <span className="form-hint">Base SKU cannot be changed after creation to preserve inventory history.</span>
            </div>

            <div>
              <CategorySelect
                retailTemplateId={retailTemplateId}
                categoryId={categoryId}
                subcategoryId={subcategoryId}
                onCategoryChange={setCategoryId}
                onSubcategoryChange={setSubcategoryId}
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="edit-supplier">Supplier</label>
              <select
                id="edit-supplier"
                className="form-select"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">-- Select Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="edit-status">Status</label>
              <select
                id="edit-status"
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus)}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="DISCONTINUED">Discontinued</option>
              </select>
            </div>
          </div>
        </section>

        {/* Category-Specific Attributes */}
        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">Category-Specific Attributes</h2>
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

        {/* Photos */}
        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">Product Photos &amp; AI Analysis</h2>
          </header>
          <div className="pe-card__body">
            <ProductPhotoUploader
              productId={productId}
              images={images}
              onChange={setImages}
              onAISuggestions={handleAISuggestions}
            />
          </div>
        </section>

        {/* Base Pricing */}
        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">Base Pricing</h2>
          </header>
          <div className="pe-card__body">
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label" htmlFor="edit-selling-price">Base Selling Price (₹)</label>
                <div className="pe-input-prefix-wrap">
                  <span className="pe-input-prefix">₹</span>
                  <input
                    id="edit-selling-price"
                    className="form-input pe-input-with-prefix"
                    type="number"
                    step="0.01"
                    min="0"
                    value={baseSellingPrice}
                    onChange={(e) => setBaseSellingPrice(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="edit-cost-price">Base Cost Price (₹)</label>
                <div className="pe-input-prefix-wrap">
                  <span className="pe-input-prefix">₹</span>
                  <input
                    id="edit-cost-price"
                    className="form-input pe-input-with-prefix"
                    type="number"
                    step="0.01"
                    min="0"
                    value={baseCostPrice}
                    onChange={(e) => setBaseCostPrice(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Variants & Price Overrides */}
        {product && product.variants.length > 0 && (
          <section className="pe-card">
            <header className="pe-card__header">
              <h2 className="pe-card__title">Variants &amp; Price Overrides</h2>
            </header>
            <div className="pe-card__body">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Variant SKU</th>
                      <th>Display Name</th>
                      <th>Selling Price Override (₹)</th>
                      <th>Cost Price Override (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((v) => (
                      <tr key={v.id}>
                        <td className="pe-mono">{v.sku}</td>
                        <td>{v.displayName}</td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            className="form-input text-sm py-1 px-2"
                            placeholder={baseSellingPrice}
                            value={variantPrices[v.id]?.selling ?? ''}
                            onChange={(e) =>
                              setVariantPrices((prev) => ({
                                ...prev,
                                [v.id]: { ...prev[v.id], selling: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            className="form-input text-sm py-1 px-2"
                            placeholder={baseCostPrice}
                            value={variantPrices[v.id]?.cost ?? ''}
                            onChange={(e) =>
                              setVariantPrices((prev) => ({
                                ...prev,
                                [v.id]: { ...prev[v.id], cost: e.target.value },
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        <section className="pe-card">
          <header className="pe-card__header">
            <h2 className="pe-card__title">Description</h2>
          </header>
          <div className="pe-card__body">
            <div className="form-field">
              <textarea
                id="edit-description"
                className="form-textarea"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </section>

        <div className="form-actions">
          <a href={`/products/${productId}`} className="btn btn-secondary">Cancel</a>
          <button id="edit-submit-btn" type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  );
}
