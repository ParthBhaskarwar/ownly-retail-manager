import type { Subcategory, CreateSubcategoryInput } from '@/modules/catalog/types';

export interface ISubcategoryRepository {
  findByCategoryId(categoryId: string): Promise<Subcategory[]>;
  findById(id: string): Promise<Subcategory | null>;
  create(input: CreateSubcategoryInput & { id: string }): Promise<Subcategory>;
}
