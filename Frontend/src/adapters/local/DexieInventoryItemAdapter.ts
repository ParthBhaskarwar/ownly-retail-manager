import { db } from '@/db/db';
import type { IInventoryItemRepository } from '@/modules/inventory/repository/IInventoryItemRepository';
import type {
  InventoryItem,
  InventoryStatus,
  StockSummary,
  InventorySearchFilters,
} from '@/modules/inventory/types';

export class DexieInventoryItemAdapter implements IInventoryItemRepository {
  /**
   * findByBarcode — uses the compound unique index [storeId+barcode].
   * This is the critical O(log n) lookup called on every barcode scan during billing.
   */
  async findByBarcode(storeId: string, barcode: string): Promise<InventoryItem | null> {
    return (
      (await db.inventoryItems
        .where('[storeId+barcode]')
        .equals([storeId, barcode])
        .first()) ?? null
    );
  }

  async findById(id: string): Promise<InventoryItem | null> {
    return (await db.inventoryItems.get(id)) ?? null;
  }

  async findByVariant(variantId: string): Promise<InventoryItem[]> {
    return db.inventoryItems.where('variantId').equals(variantId).toArray();
  }

  async findByVariantAndStatus(
    variantId: string,
    status: InventoryStatus
  ): Promise<InventoryItem[]> {
    return db.inventoryItems
      .where('[variantId+status]')
      .equals([variantId, status])
      .toArray();
  }

  async getStockSummary(variantId: string): Promise<StockSummary> {
    const items = await this.findByVariant(variantId);

    const summary: StockSummary = {
      variantId,
      inStock: 0,
      reserved: 0,
      sold: 0,
      returned: 0,
      damaged: 0,
      lost: 0,
      total: items.length,
    };

    for (const item of items) {
      switch (item.status) {
        case 'IN_STOCK':          summary.inStock++;    break;
        case 'RESERVED':          summary.reserved++;   break;
        case 'SOLD':              summary.sold++;       break;
        case 'RETURNED_TO_STOCK': summary.inStock++;    break; // back in stock
        case 'RETURNED_DAMAGED':  summary.damaged++;    break;
        case 'DAMAGED':           summary.damaged++;    break;
        case 'LOST':              summary.lost++;       break;
        case 'TRANSFERRED_OUT':   break;
      }
    }

    return summary;
  }

  async search(
    filters: InventorySearchFilters
  ): Promise<{ items: InventoryItem[]; total: number }> {
    const { storeId, status, variantId, barcode } = filters;
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    let results: InventoryItem[];

    if (barcode) {
      const item = await this.findByBarcode(storeId, barcode);
      results = item ? [item] : [];
    } else if (status) {
      results = await db.inventoryItems
        .where('[storeId+status]')
        .equals([storeId, status])
        .toArray();
      if (variantId) results = results.filter((i) => i.variantId === variantId);
    } else if (variantId) {
      results = await this.findByVariant(variantId);
    } else {
      results = await db.inventoryItems.where('storeId').equals(storeId).toArray();
    }

    // Date range filters
    if (filters.purchaseDateFrom) {
      results = results.filter((i) => i.purchaseDate >= filters.purchaseDateFrom!);
    }
    if (filters.purchaseDateTo) {
      results = results.filter((i) => i.purchaseDate <= filters.purchaseDateTo!);
    }

    const total = results.length;
    const items = results.slice((page - 1) * pageSize, page * pageSize);
    return { items, total };
  }

  async create(item: InventoryItem): Promise<InventoryItem> {
    await db.inventoryItems.add(item);
    return item;
  }

  async bulkCreate(items: InventoryItem[]): Promise<InventoryItem[]> {
    await db.inventoryItems.bulkAdd(items);
    return items;
  }

  async updateStatus(id: string, status: InventoryStatus): Promise<InventoryItem> {
    const existing = await db.inventoryItems.get(id);
    if (!existing) throw new Error(`InventoryItem ${id} not found`);
    const updated: InventoryItem = { ...existing, status, updatedAt: new Date().toISOString() };
    await db.inventoryItems.put(updated);
    return updated;
  }
}
