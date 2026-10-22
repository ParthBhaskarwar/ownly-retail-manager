import { db } from '@/db/db';

export const Adapters = {
  product: {
    findById: async (id: string) => {
      return db ? await db.products.get(id) : null;
    },
    update: async (id: string, updates: any) => {
      if (db) await db.products.update(id, updates);
      return db ? await db.products.get(id) : null;
    },
    search: async (filters: any) => {
      if (!db) return { items: [], total: 0 };
      const items = await db.products.toArray();
      return { items, total: items.length };
    }
  },
  productVariant: {
    update: async (id: string, updates: any) => {
      if (db) await db.productVariants.update(id, updates);
      return db ? await db.productVariants.get(id) : null;
    },
    findByProductId: async (productId: string) => {
      return db ? await db.productVariants.where({ productId }).toArray() : [];
    }
  },
  supplier: {
    findByStore: async (storeId: string) => {
      return db ? await db.suppliers.where({ storeId }).toArray() : [];
    },
    findById: async (id: string) => {
      return db ? await db.suppliers.get(id) : null;
    }
  },
  inventoryItem: {
    getStockSummary: async (variantId: string) => {
      if (!db) return { inStock: 0, sold: 0, total: 0 };
      const items = await db.inventoryItems.where({ variantId }).toArray();
      const inStock = items.filter(i => i.status === 'IN_STOCK').length;
      return { inStock, sold: 0, total: items.length };
    }
  },
  category: {
    findByTemplate: async (templateId: string) => {
      return db ? await db.categories.where({ templateId }).toArray() : [];
    }
  }
};
