import type {
  InventoryItem,
  InventoryStatus,
  StockSummary,
  InventorySearchFilters,
} from '@/modules/inventory/types';

export interface IInventoryItemRepository {
  /** O(log n) barcode lookup — primary billing hook for Week 3. */
  findByBarcode(storeId: string, barcode: string): Promise<InventoryItem | null>;
  findById(id: string): Promise<InventoryItem | null>;
  findByVariant(variantId: string): Promise<InventoryItem[]>;
  findByVariantAndStatus(variantId: string, status: InventoryStatus): Promise<InventoryItem[]>;
  getStockSummary(variantId: string): Promise<StockSummary>;
  search(filters: InventorySearchFilters): Promise<{ items: InventoryItem[]; total: number }>;
  create(item: InventoryItem): Promise<InventoryItem>;
  bulkCreate(items: InventoryItem[]): Promise<InventoryItem[]>;
  updateStatus(id: string, status: InventoryStatus): Promise<InventoryItem>;
}
