import type { Category, CategoryWithSubcategories, CreateCategoryInput } from '@/modules/catalog/types';

export interface ICategoryRepository {
  findByTemplate(retailTemplateId: string): Promise<Category[]>;
  findByTemplateWithSubcategories(retailTemplateId: string): Promise<CategoryWithSubcategories[]>;
  findById(id: string): Promise<Category | null>;
  create(input: CreateCategoryInput & { id: string }): Promise<Category>;
}
