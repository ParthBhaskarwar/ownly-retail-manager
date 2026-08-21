/**
 * Catalog module — Category, Subcategory, Supplier domain types.
 */

// ─── Category ─────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  retailTemplateId: string;
  storeId: string | null;    // null = global system category
  name: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CreateCategoryInput {
  storeId: string;
  retailTemplateId: string;
  name: string;
}

// ─── Subcategory ──────────────────────────────────────────────────────────────

export interface Subcategory {
  id: string;
  categoryId: string;
  storeId: string | null;    // null = global system subcategory
  name: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CreateSubcategoryInput {
  categoryId: string;
  storeId: string;
  name: string;
}

// ─── Supplier ─────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  storeId: string;
  name: string;
  code: string;          // short code e.g. 'SUP001'
  gstin?: string;
  address?: string;
  paymentTerms?: string; // e.g. 'Net 30'
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierInput {
  storeId: string;
  name: string;
  code: string;
  gstin?: string;
  address?: string;
  paymentTerms?: string;
  notes?: string;
}

export interface UpdateSupplierInput {
  name?: string;
  gstin?: string;
  address?: string;
  paymentTerms?: string;
  notes?: string;
  isActive?: boolean;
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

/** Category with its subcategories, for cascade dropdowns. */
export interface CategoryWithSubcategories extends Category {
  subcategories: Subcategory[];
}
