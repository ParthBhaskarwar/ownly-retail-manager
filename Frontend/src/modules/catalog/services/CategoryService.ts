/**
 * CategoryService / SupplierService — talk to the backend catalog API.
 *
 * Signatures are unchanged so CategorySelect and the product form work
 * without modification.
 */

import { apiClient } from '@/lib/apiClient';
import { CLOTHING_TEMPLATE_ID } from '@/config/retail-templates';
import type {
  Category,
  Subcategory,
  CategoryWithSubcategories,
  CreateCategoryInput,
  Supplier,
  CreateSupplierInput,
  UpdateSupplierInput,
} from '@/modules/catalog/types';

export const CategoryService = {
  async getCategories(retailTemplateId: string = CLOTHING_TEMPLATE_ID): Promise<Category[]> {
    const { categories } = await apiClient.get<{ categories: Category[] }>(
      '/api/catalog/categories',
      { query: { retailTemplateId } }
    );
    return categories;
  },

  async getSubcategories(categoryId: string): Promise<Subcategory[]> {
    const { subcategories } = await apiClient.get<{ subcategories: Subcategory[] }>(
      `/api/catalog/categories/${categoryId}/subcategories`
    );
    return subcategories;
  },

  /**
   * Categories each with their subcategories, for the cascading dropdowns.
   *
   * Subcategories are fetched per category in parallel rather than
   * sequentially — with 8 clothing categories that is one round-trip's worth
   * of latency instead of eight.
   */
  async getCategoriesWithSubcategories(
    retailTemplateId: string = CLOTHING_TEMPLATE_ID
  ): Promise<CategoryWithSubcategories[]> {
    const categories = await this.getCategories(retailTemplateId);
    const subcategoryLists = await Promise.all(
      categories.map((category) => this.getSubcategories(category.id))
    );
    return categories.map((category, index) => ({
      ...category,
      subcategories: subcategoryLists[index],
    }));
  },

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const { category } = await apiClient.post<{ category: Category }>('/api/catalog/categories', {
      retailTemplateId: input.retailTemplateId,
      name: input.name,
    });
    return category;
  },
};

export const SupplierService = {
  async getSuppliers(_storeId?: string): Promise<Supplier[]> {
    const { suppliers } = await apiClient.get<{ suppliers: Supplier[] }>('/api/catalog/suppliers');
    return suppliers;
  },

  async getAllSuppliers(_storeId?: string): Promise<Supplier[]> {
    const { suppliers } = await apiClient.get<{ suppliers: Supplier[] }>(
      '/api/catalog/suppliers',
      { query: { includeInactive: true } }
    );
    return suppliers;
  },

  async createSupplier(input: CreateSupplierInput): Promise<Supplier> {
    const { supplier } = await apiClient.post<{ supplier: Supplier }>('/api/catalog/suppliers', {
      name: input.name,
      code: input.code,
      gstin: input.gstin,
      address: input.address,
      paymentTerms: input.paymentTerms,
      notes: input.notes,
    });
    return supplier;
  },

  async updateSupplier(id: string, updates: UpdateSupplierInput): Promise<Supplier> {
    const { supplier } = await apiClient.put<{ supplier: Supplier }>(
      `/api/catalog/suppliers/${id}`,
      updates
    );
    return supplier;
  },
};

// ─── Attribute definitions ────────────────────────────────────────────────────

export const AttributeService = {
  async getDefinitions(
    retailTemplateId: string = CLOTHING_TEMPLATE_ID,
    level?: 'product' | 'variant'
  ) {
    const { definitions } = await apiClient.get<{
      definitions: import('@/modules/attributes/types').AttributeDefinition[];
    }>('/api/catalog/attributes/definitions', { query: { retailTemplateId, level } });
    return definitions;
  },
};
