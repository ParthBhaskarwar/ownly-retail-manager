import type { InventoryMovement } from '@/modules/inventory/types';

export interface IInventoryMovementRepository {
  getByItemId(inventoryItemId: string): Promise<InventoryMovement[]>;
  getByReference(referenceType: string, referenceId: string): Promise<InventoryMovement[]>;
  getByStore(storeId: string, limit?: number): Promise<InventoryMovement[]>;
  create(movement: InventoryMovement): Promise<InventoryMovement>;
  bulkCreate(movements: InventoryMovement[]): Promise<InventoryMovement[]>;
}
