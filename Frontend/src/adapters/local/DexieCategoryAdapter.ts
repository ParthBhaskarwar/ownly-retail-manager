import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db/db';
import type { ICategoryRepository } from '@/modules/catalog/repository/ICategoryRepository';
import type { Category, CategoryWithSubcategories, CreateCategoryInput } from '@/modules/catalog/types';

export class DexieCategoryAdapter implements ICategoryRepository {
  async findByTemplate(retailTemplateId: string): Promise<Category[]> {
    return db.categories.where('retailTemplateId').equals(retailTemplateId).toArray();
  }

  async findByTemplateWithSubcategories(
    retailTemplateId: string
  ): Promise<CategoryWithSubcategories[]> {
    const categories = await this.findByTemplate(retailTemplateId);
    return Promise.all(
      categories.map(async (cat) => {
        const subcategories = await db.subcategories
          .where('categoryId')
          .equals(cat.id)
          .toArray();
        return { ...cat, subcategories };
      })
    );
  }

  async findById(id: string): Promise<Category | null> {
    return (await db.categories.get(id)) ?? null;
  }

  async create(input: CreateCategoryInput & { id: string }): Promise<Category> {
    const now = new Date().toISOString();
    const category: Category = {
      id: input.id,
      retailTemplateId: input.retailTemplateId,
      storeId: input.storeId,
      name: input.name,
      isSystem: false,
      isActive: true,
      sortOrder: 99,
      createdAt: now,
    };
    await db.categories.add(category);
    return category;
  }
}
