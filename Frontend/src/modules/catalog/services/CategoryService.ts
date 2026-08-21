import { v4 as uuidv4 } from 'uuid';
import { Adapters } from '@/adapters';
import type { Category, Subcategory, CategoryWithSubcategories, CreateCategoryInput, Supplier, CreateSupplierInput, UpdateSupplierInput } from '@/modules/catalog/types';
import { CLOTHING_TEMPLATE_ID } from '@/db/seeds/clothing-attributes';

// ─── CategoryService ──────────────────────────────────────────────────────────

export const CategoryService = {
  /**
   * Get all categories with their subcategories for the current store's retail template.
   * Used to populate the cascading category → subcategory dropdowns.
   */
  async getCategoriesWithSubcategories(
    retailTemplateId: string = CLOTHING_TEMPLATE_ID
  ): Promise<CategoryWithSubcategories[]> {
    return Adapters.category.findByTemplateWithSubcategories(retailTemplateId);
  },

  async getCategories(retailTemplateId: string = CLOTHING_TEMPLATE_ID): Promise<Category[]> {
    return Adapters.category.findByTemplate(retailTemplateId);
  },

  async getSubcategories(categoryId: string): Promise<Subcategory[]> {
    return Adapters.subcategory.findByCategoryId(categoryId);
  },

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    return Adapters.category.create({ ...input, id: uuidv4() });
  },
};

// ─── SupplierService ──────────────────────────────────────────────────────────

export const SupplierService = {
  async getSuppliers(storeId: string): Promise<Supplier[]> {
    return Adapters.supplier.findByStoreActive(storeId);
  },

  async getAllSuppliers(storeId: string): Promise<Supplier[]> {
    return Adapters.supplier.findByStore(storeId);
  },

  async createSupplier(input: CreateSupplierInput): Promise<Supplier> {
    // Validate unique code per store
    const existing = await Adapters.supplier.findByCode(input.storeId, input.code);
    if (existing) {
      throw new Error(`A supplier with code "${input.code}" already exists in this store.`);
    }
    return Adapters.supplier.create({ ...input, id: uuidv4() });
  },

  async updateSupplier(id: string, updates: UpdateSupplierInput): Promise<Supplier> {
    return Adapters.supplier.update(id, updates);
  },
};
