import type { ProductVariant, CreateVariantInput, UpdateVariantInput } from '@/modules/product/types';

export interface IProductVariantRepository {
  findByProductId(productId: string): Promise<ProductVariant[]>;
  findActiveByProductId(productId: string): Promise<ProductVariant[]>;
  findById(id: string): Promise<ProductVariant | null>;
  findBySku(productId: string, sku: string): Promise<ProductVariant | null>;
  create(
    input: CreateVariantInput & { id: string; productId: string }
  ): Promise<ProductVariant>;
  update(id: string, updates: UpdateVariantInput): Promise<ProductVariant>;
}
