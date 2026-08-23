/**
 * InventoryItemService — talks to the backend inventory API.
 *
 * Barcode generation moved to the server, where it belongs: the sequence is
 * assigned inside the same database transaction as the insert, guarded by the
 * (store_id, barcode) unique constraint. The client no longer invents
 * barcodes, so two devices adding stock at once cannot collide.
 *
 * deriveStoreCode is still exported because StockEntryForm uses it to show a
 * preview of the barcode format.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  InventoryItem,
  InventoryItemRow,
  InventoryListFilters,
  InventoryMovement,
  AddStockInput,
  StockAlerts,
  StockSummary,
  StockValuation,
  UpdateInventoryStatusInput,
} from '@/modules/inventory/types';

/**
 * Short human-readable store prefix used in the barcode's first segment.
 * Cosmetic only — must match the server's implementation in
 * Backend/src/services/inventory.service.ts.
 */
export function deriveStoreCode(storeId: string): string {
  return storeId.replace(/-/g, '').slice(0, 6).toUpperCase();
}

export const InventoryItemService = {
  /**
   * Adds physical stock for a variant. One InventoryItem + one PURCHASE
   * movement per unit, each with a unique barcode.
   *
   * `variantSku` is no longer sent — the server reads it from the variant so
   * the barcode text cannot be spoofed by the client. The parameter is kept
   * for call-site compatibility with StockEntryForm.
   */
  async addStock(input: AddStockInput, _variantSku?: string): Promise<InventoryItem[]> {
    const { items } = await apiClient.post<{ items: InventoryItem[]; count: number }>(
      '/api/inventory/stock',
      {
        variantId: input.variantId,
        quantity: input.quantity,
        purchaseCostPrice: input.purchaseCostPrice,
        purchaseDate: input.purchaseDate,
        barcodes: input.barcodes,
        notes: input.notes,
      }
    );
    return items;
  },

  /** Billing hook — one indexed lookup per scan. */
  async findByBarcode(_storeId: string, barcode: string): Promise<InventoryItem | null> {
    try {
      const { item } = await apiClient.get<{ item: InventoryItem }>(
        `/api/inventory/barcode/${encodeURIComponent(barcode)}`
      );
      return item;
    } catch (err) {
      // An unknown barcode is an expected scan outcome, not an error.
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  },

  async updateStatus(input: UpdateInventoryStatusInput): Promise<InventoryItem> {
    const { item } = await apiClient.put<{ item: InventoryItem }>(
      `/api/inventory/${input.inventoryItemId}/status`,
      {
        newStatus: input.newStatus,
        movementType: input.movementType,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        notes: input.notes,
      }
    );
    return item;
  },

  async getStockSummary(variantId: string): Promise<StockSummary> {
    const { stock } = await apiClient.get<{ stock: StockSummary }>(
      `/api/inventory/variants/${variantId}/stock`
    );
    return stock;
  },

  /** Inventory list, joined to product/variant/category context for display. */
  async search(
    filters: InventoryListFilters
  ): Promise<{ items: InventoryItemRow[]; total: number }> {
    return apiClient.get<{ items: InventoryItemRow[]; total: number }>('/api/inventory', {
      query: { ...filters },
    });
  },

  /** One item with its joined product/variant context. */
  async getById(id: string): Promise<InventoryItemRow | null> {
    try {
      const { item } = await apiClient.get<{ item: InventoryItemRow }>(`/api/inventory/item/${id}`);
      return item;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  },

  /** Stock cost value, expected selling value and potential gross profit. */
  async getValuation(filters: { categoryId?: string; supplierId?: string } = {}) {
    const { valuation } = await apiClient.get<{ valuation: StockValuation }>(
      '/api/inventory/valuation',
      { query: filters }
    );
    return valuation;
  },

  /** Low-stock, out-of-stock and stock-ageing alerts. */
  async getAlerts(): Promise<StockAlerts> {
    const { alerts } = await apiClient.get<{ alerts: StockAlerts }>('/api/inventory/alerts');
    return alerts;
  },
};

export const InventoryMovementService = {
  async getMovementsForItem(inventoryItemId: string): Promise<InventoryMovement[]> {
    const { movements } = await apiClient.get<{ movements: InventoryMovement[] }>(
      `/api/inventory/${inventoryItemId}/movements`
    );
    return movements;
  },
};
