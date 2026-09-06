'use client';

import React from 'react';
import type { Category, Supplier } from '@/modules/catalog/types';

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'];

export interface InventoryFilterValues {
  query: string;
  categoryId: string;
  supplierId: string;
  size: string;
}

/**
 * Search plus the category / supplier / size dropdowns that plan §2.8 calls
 * for ("Search by product, SKU, barcode, category, subcategory, size,
 * supplier and status"). Status lives in the tab strip rather than here,
 * since it is the primary way people slice this list.
 */
export function InventoryFilters({
  values,
  categories,
  suppliers,
  onChange,
  onReset,
}: {
  values: InventoryFilterValues;
  categories: Category[];
  suppliers: Supplier[];
  onChange: (patch: Partial<InventoryFilterValues>) => void;
  onReset: () => void;
}) {
  const hasActiveFilter =
    Boolean(values.query || values.categoryId || values.supplierId || values.size);

  return (
    <div className="inventory-filters">
      <div className="inventory-filters__search">
        <label className="sr-only" htmlFor="inventory-search">
          Search by barcode, SKU or product name
        </label>
        <input
          id="inventory-search"
          type="search"
          className="form-input"
          placeholder="Search barcode, SKU or product…"
          value={values.query}
          onChange={(e) => onChange({ query: e.target.value })}
        />
      </div>

      <div className="inventory-filters__selects">
        <div className="inventory-filters__field">
          <label className="form-label" htmlFor="inventory-filter-category">Category</label>
          <select
            id="inventory-filter-category"
            className="form-select"
            value={values.categoryId}
            onChange={(e) => onChange({ categoryId: e.target.value })}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="inventory-filters__field">
          <label className="form-label" htmlFor="inventory-filter-supplier">Supplier</label>
          <select
            id="inventory-filter-supplier"
            className="form-select"
            value={values.supplierId}
            onChange={(e) => onChange({ supplierId: e.target.value })}
            disabled={suppliers.length === 0}
          >
            <option value="">
              {suppliers.length === 0 ? 'No suppliers yet' : 'All suppliers'}
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="inventory-filters__field">
          <label className="form-label" htmlFor="inventory-filter-size">Size</label>
          <select
            id="inventory-filter-size"
            className="form-select"
            value={values.size}
            onChange={(e) => onChange({ size: e.target.value })}
          >
            <option value="">All sizes</option>
            {STANDARD_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {hasActiveFilter && (
          <button
            type="button"
            id="inventory-filters-reset"
            className="btn btn-ghost btn-sm inventory-filters__reset"
            onClick={onReset}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
