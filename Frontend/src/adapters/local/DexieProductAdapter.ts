import { db } from '@/db/db';
import type { IProductRepository } from '@/modules/product/repository/IProductRepository';
import type {
  Product,
  UpdateProductInput,
  ProductSearchFilters,
  ProductSummary,
} from '@/modules/product/types';

export class DexieProductAdapter implements IProductRepository {
  async findById(id: string): Promise<Product | null> {
    return (await db.products.get(id)) ?? null;
  }

  async findByStore(storeId: string): Promise<Product[]> {
    return db.products.where('storeId').equals(storeId).toArray();
  }

  async findBySku(storeId: string, baseSku: string): Promise<Product | null> {
    return (
      (await db.products.where('[storeId+baseSku]').equals([storeId, baseSku]).first()) ?? null
    );
  }

  async search(
    filters: ProductSearchFilters
  ): Promise<{ items: ProductSummary[]; total: number }> {
    const { storeId, query, categoryId, subcategoryId, supplierId, status } = filters;
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;

    // Start from the most selective index available
    let collection = db.products.where('storeId').equals(storeId);

    // Apply indexed filters first (fastest)
    if (status) {
      collection = db.products.where('[storeId+status]').equals([storeId, status]);
    } else if (categoryId) {
      collection = db.products.where('[storeId+categoryId]').equals([storeId, categoryId]);
    } else if (supplierId) {
      collection = db.products.where('[storeId+supplierId]').equals([storeId, supplierId]);
    }

    let results = await collection.toArray();

    // Apply in-memory filters for non-indexed fields
    if (categoryId && !status) {
      results = results.filter((p) => p.categoryId === categoryId);
    }
    if (subcategoryId) {
      results = results.filter((p) => p.subcategoryId === subcategoryId);
    }
    if (supplierId && !categoryId && !status) {
      results = results.filter((p) => p.supplierId === supplierId);
    }
    if (status && categoryId) {
      results = results.filter((p) => p.categoryId === categoryId);
    }
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(
        (p) => p.name.toLowerCase().includes(q) || p.baseSku.toLowerCase().includes(q)
      );
    }

    const total = results.length;
    const paginated = results.slice((page - 1) * pageSize, page * pageSize);

    // Build ProductSummary (resolve counts — stock counts added by ProductService layer)
    const items: ProductSummary[] = paginated.map((p) => ({
      ...p,
      categoryName: '',     // resolved by service
      variantCount: 0,      // resolved by service
      totalInStock: 0,      // resolved by service
    }));

    return { items, total };
  }

  async create(
    input: Omit<Product, 'createdAt' | 'updatedAt'> & { id: string }
  ): Promise<Product> {
    const now = new Date().toISOString();
    const product: Product = { ...input, createdAt: now, updatedAt: now };
    await db.products.add(product);
    return product;
  }

  async update(id: string, updates: UpdateProductInput): Promise<Product> {
    const existing = await db.products.get(id);
    if (!existing) throw new Error(`Product ${id} not found`);
    const updated: Product = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await db.products.put(updated);
    return updated;
  }
}
