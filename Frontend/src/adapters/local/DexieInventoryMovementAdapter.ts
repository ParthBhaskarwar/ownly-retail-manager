import { db } from '@/db/db';
import type { IInventoryMovementRepository } from '@/modules/inventory/repository/IInventoryMovementRepository';
import type { InventoryMovement } from '@/modules/inventory/types';

export class DexieInventoryMovementAdapter implements IInventoryMovementRepository {
  async getByItemId(inventoryItemId: string): Promise<InventoryMovement[]> {
    const movements = await db.inventoryMovements
      .where('inventoryItemId')
      .equals(inventoryItemId)
      .toArray();
    // Return chronological order
    return movements.sort(
      (a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime()
    );
  }

  async getByReference(
    referenceType: string,
    referenceId: string
  ): Promise<InventoryMovement[]> {
    return db.inventoryMovements
      .where('[referenceType+referenceId]')
      .equals([referenceType, referenceId])
      .toArray();
  }

  async getByStore(storeId: string, limit = 100): Promise<InventoryMovement[]> {
    const all = await db.inventoryMovements.where('storeId').equals(storeId).toArray();
    return all
      .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime())
      .slice(0, limit);
  }

  async create(movement: InventoryMovement): Promise<InventoryMovement> {
    await db.inventoryMovements.add(movement);
    return movement;
  }

  async bulkCreate(movements: InventoryMovement[]): Promise<InventoryMovement[]> {
    await db.inventoryMovements.bulkAdd(movements);
    return movements;
  }
}
