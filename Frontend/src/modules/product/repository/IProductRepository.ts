import type { Product, CreateProductInput, UpdateProductInput, ProductSearchFilters, ProductSummary } from '@/modules/product/types';

export interface IProductRepository {
  findById(id: string): Promise<Product | null>;
  findByStore(storeId: string): Promise<Product[]>;
  findBySku(storeId: string, baseSku: string): Promise<Product | null>;
  search(filters: ProductSearchFilters): Promise<{ items: ProductSummary[]; total: number }>;
  create(input: Omit<Product, 'createdAt' | 'updatedAt'> & { id: string }): Promise<Product>;
  update(id: string, updates: UpdateProductInput): Promise<Product>;
}
