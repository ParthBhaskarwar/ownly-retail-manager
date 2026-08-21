import { db } from '@/db/db';
import type { ISubcategoryRepository } from '@/modules/catalog/repository/ISubcategoryRepository';
import type { Subcategory, CreateSubcategoryInput } from '@/modules/catalog/types';

export class DexieSubcategoryAdapter implements ISubcategoryRepository {
  async findByCategoryId(categoryId: string): Promise<Subcategory[]> {
    return db.subcategories.where('categoryId').equals(categoryId).toArray();
  }

  async findById(id: string): Promise<Subcategory | null> {
    return (await db.subcategories.get(id)) ?? null;
  }

  async create(input: CreateSubcategoryInput & { id: string }): Promise<Subcategory> {
    const now = new Date().toISOString();
    const sub: Subcategory = {
      id: input.id,
      categoryId: input.categoryId,
      storeId: input.storeId,
      name: input.name,
      isSystem: false,
      isActive: true,
      sortOrder: 99,
      createdAt: now,
    };
    await db.subcategories.add(sub);
    return sub;
  }
}
