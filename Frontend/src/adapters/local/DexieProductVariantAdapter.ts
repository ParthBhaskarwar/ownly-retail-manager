import { db } from '@/db/db';
import type { IProductVariantRepository } from '@/modules/product/repository/IProductVariantRepository';
import type { ProductVariant, CreateVariantInput, UpdateVariantInput } from '@/modules/product/types';

export class DexieProductVariantAdapter implements IProductVariantRepository {
  async findByProductId(productId: string): Promise<ProductVariant[]> {
    return db.productVariants.where('productId').equals(productId).sortBy('sortOrder');
  }

  async findActiveByProductId(productId: string): Promise<ProductVariant[]> {
    const all = await this.findByProductId(productId);
    return all.filter((v) => v.isActive);
  }

  async findById(id: string): Promise<ProductVariant | null> {
    return (await db.productVariants.get(id)) ?? null;
  }

  async findBySku(productId: string, sku: string): Promise<ProductVariant | null> {
    return (
      (await db.productVariants.where('[productId+sku]').equals([productId, sku]).first()) ?? null
    );
  }

  async create(
    input: CreateVariantInput & { id: string; productId: string }
  ): Promise<ProductVariant> {
    const now = new Date().toISOString();
    const variant: ProductVariant = {
      id: input.id,
      productId: input.productId,
      sku: input.sku,
      displayName: input.displayName,
      sellingPriceOverride: input.sellingPriceOverride ?? null,
      costPriceOverride: input.costPriceOverride ?? null,
      isActive: true,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.productVariants.add(variant);
    return variant;
  }

  async update(id: string, updates: UpdateVariantInput): Promise<ProductVariant> {
    const existing = await db.productVariants.get(id);
    if (!existing) throw new Error(`Variant ${id} not found`);
    // Strip attributeValues from the persisted update — attribute values live in their own table
    const { attributeValues: _, ...rest } = updates;
    const updated: ProductVariant = {
      ...existing,
      ...rest,
      updatedAt: new Date().toISOString(),
    };
    await db.productVariants.put(updated);
    return updated;
  }
}
