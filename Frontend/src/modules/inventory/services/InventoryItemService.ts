import { v4 as uuidv4 } from 'uuid';
import { Adapters } from '@/adapters';
import { AuditService } from '@/shared/audit/AuditService';
import type {
  InventoryItem,
  InventoryMovement,
  AddStockInput,
  UpdateInventoryStatusInput,
  StockSummary,
} from '@/modules/inventory/types';

// ─── Barcode generation ───────────────────────────────────────────────────────

/**
 * Generates a store-prefixed barcode for auto-assignment.
 * Format: {STORE_CODE}-{VARIANT_SKU_PART}-{PADDED_SEQUENCE}
 * Example: OWN-BDJ001XL-00001
 *
 * Barcodes are unique per store (enforced by compound index on write).
 */
function generateBarcode(storeCode: string, variantSku: string, sequence: number): string {
  const skuPart = variantSku.replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase();
  const seq = String(sequence).padStart(5, '0');
  return `${storeCode.toUpperCase()}-${skuPart}-${seq}`;
}

async function getNextBarcodeSequence(storeId: string, variantId: string): Promise<number> {
  // Count existing items for this variant to determine next sequence
  const existing = await Adapters.inventoryItem.findByVariant(variantId);
  return existing.length + 1;
}

// ─── InventoryItemService ─────────────────────────────────────────────────────

export const InventoryItemService = {
  /**
   * Add physical stock pieces for a variant.
   * Creates one InventoryItem per piece + one InventoryMovement (PURCHASE) per piece.
   * If barcodes are not provided, auto-generates them.
   *
   * This is the main stock-entry operation — called from StockEntryForm.
   */
  async addStock(input: AddStockInput, storeCode: string, variantSku: string): Promise<InventoryItem[]> {
    const { storeId, variantId, quantity, purchaseCostPrice, purchaseDate, performedBy, notes } = input;

    // Validate barcode count if provided
    if (input.barcodes && input.barcodes.length !== quantity) {
      throw new Error(
        `Barcode count (${input.barcodes.length}) does not match quantity (${quantity}).`
      );
    }

    // Validate provided barcodes are unique in this store
    if (input.barcodes) {
      const duplicateChecks = await Promise.all(
        input.barcodes.map((bc) => Adapters.inventoryItem.findByBarcode(storeId, bc))
      );
      const duplicates = input.barcodes.filter((_, i) => duplicateChecks[i] !== null);
      if (duplicates.length > 0) {
        throw new Error(
          `The following barcodes already exist in this store: ${duplicates.join(', ')}`
        );
      }
    }

    const now = new Date().toISOString();
    let seqStart = await getNextBarcodeSequence(storeId, variantId);

    // Build InventoryItem records
    const items: InventoryItem[] = Array.from({ length: quantity }, (_, i) => {
      const barcode = input.barcodes
        ? input.barcodes[i]
        : generateBarcode(storeCode, variantSku, seqStart + i);

      return {
        id: uuidv4(),
        storeId,
        variantId,
        barcode,
        purchaseCostPrice,
        purchaseDate,
        status: 'IN_STOCK' as const,
        createdAt: now,
        createdBy: performedBy,
        updatedAt: now,
      };
    });

    // Build InventoryMovement records (one PURCHASE event per item)
    const movements: InventoryMovement[] = items.map((item) => ({
      id: uuidv4(),
      storeId,
      inventoryItemId: item.id,
      movementType: 'PURCHASE' as const,
      fromStatus: 'IN_STOCK' as const, // Initial entry — no prior status
      toStatus: 'IN_STOCK' as const,
      referenceType: 'PURCHASE_ENTRY' as const,
      referenceId: uuidv4(), // One purchase entry reference per batch
      performedBy,
      performedAt: now,
      notes,
    }));

    // Ensure all movements share the same purchase batch reference
    const batchRef = movements[0]?.referenceId ?? uuidv4();
    const movementsWithBatch = movements.map((m) => ({ ...m, referenceId: batchRef }));

    // Write items and movements
    await Adapters.inventoryItem.bulkCreate(items);
    await Adapters.inventoryMovement.bulkCreate(movementsWithBatch);

    AuditService.log('inventory.add_stock', variantId, storeId, {
      quantity,
      purchaseCostPrice,
      purchaseDate,
      batchRef,
    });

    return items;
  },

  /**
   * Look up a single item by barcode.
   * Primary billing hook — called on every barcode scan in Week 3.
   * Uses the [storeId+barcode] compound index: O(log n).
   */
  async findByBarcode(storeId: string, barcode: string): Promise<InventoryItem | null> {
    return Adapters.inventoryItem.findByBarcode(storeId, barcode);
  },

  /**
   * Update item status and record the movement.
   * Used by billing (SALE), returns (RETURN_TO_STOCK / RETURN_DAMAGED),
   * and manual adjustments (DAMAGE_WRITE_OFF, LOSS_WRITE_OFF).
   *
   * The status update and movement creation are logically coupled:
   * always call this method rather than updating status directly.
   */
  async updateStatus(input: UpdateInventoryStatusInput): Promise<InventoryItem> {
    const item = await Adapters.inventoryItem.findById(input.inventoryItemId);
    if (!item) throw new Error(`Inventory item ${input.inventoryItemId} not found`);

    const updatedItem = await Adapters.inventoryItem.updateStatus(
      input.inventoryItemId,
      input.newStatus
    );

    await Adapters.inventoryMovement.create({
      id: uuidv4(),
      storeId: item.storeId,
      inventoryItemId: item.id,
      movementType: input.movementType,
      fromStatus: item.status,
      toStatus: input.newStatus,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      performedBy: input.performedBy,
      performedAt: new Date().toISOString(),
      notes: input.notes,
    });

    return updatedItem;
  },

  async getStockSummary(variantId: string): Promise<StockSummary> {
    return Adapters.inventoryItem.getStockSummary(variantId);
  },
};

// ─── InventoryMovementService ─────────────────────────────────────────────────

export const InventoryMovementService = {
  async getMovementsForItem(inventoryItemId: string): Promise<InventoryMovement[]> {
    return Adapters.inventoryMovement.getByItemId(inventoryItemId);
  },

  async getMovementsByReference(
    referenceType: string,
    referenceId: string
  ): Promise<InventoryMovement[]> {
    return Adapters.inventoryMovement.getByReference(referenceType, referenceId);
  },
};
