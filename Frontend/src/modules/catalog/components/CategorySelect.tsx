'use client';

import React, { useEffect, useState } from 'react';
import { CategoryService } from '@/modules/catalog/services/CategoryService';
import type { CategoryWithSubcategories } from '@/modules/catalog/types';
import { CLOTHING_TEMPLATE_ID } from '@/config/retail-templates';

interface CategorySelectProps {
  retailTemplateId?: string;
  categoryId: string;
  subcategoryId: string;
  onCategoryChange: (categoryId: string) => void;
  onSubcategoryChange: (subcategoryId: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export function CategorySelect({
  retailTemplateId = CLOTHING_TEMPLATE_ID,
  categoryId,
  subcategoryId,
  onCategoryChange,
  onSubcategoryChange,
  required = false,
  disabled = false,
}: CategorySelectProps) {
  const [categories, setCategories] = useState<CategoryWithSubcategories[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    CategoryService.getCategoriesWithSubcategories(retailTemplateId)
      .then(setCategories)
      .finally(() => setLoading(false));
  }, [retailTemplateId]);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const subcategories = selectedCategory?.subcategories ?? [];

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onCategoryChange(e.target.value);
    onSubcategoryChange(''); // Reset subcategory on category change
  };

  if (loading) {
    return (
      <div className="category-select--loading">
        <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
      </div>
    );
  }

  return (
    <div className="category-select">
      <div className="form-field">
        <label className="form-field__label" htmlFor="select-category">
          Category {required && <span className="form-field__required">*</span>}
        </label>
        <select
          id="select-category"
          className="form-field__input"
          value={categoryId}
          onChange={handleCategoryChange}
          required={required}
          disabled={disabled}
        >
          <option value="">Select category…</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {categoryId && (
        <div className="form-field">
          <label className="form-field__label" htmlFor="select-subcategory">
            Subcategory
          </label>
          <select
            id="select-subcategory"
            className="form-field__input"
            value={subcategoryId}
            onChange={(e) => onSubcategoryChange(e.target.value)}
            disabled={disabled || subcategories.length === 0}
          >
            <option value="">Select subcategory…</option>
            {subcategories.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
