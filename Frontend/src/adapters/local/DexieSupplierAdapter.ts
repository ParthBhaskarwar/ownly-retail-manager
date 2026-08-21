import { db } from '@/db/db';
import type { ISupplierRepository } from '@/modules/catalog/repository/ISupplierRepository';
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from '@/modules/catalog/types';

export class DexieSupplierAdapter implements ISupplierRepository {
  async findByStore(storeId: string): Promise<Supplier[]> {
    return db.suppliers.where('storeId').equals(storeId).toArray();
  }

  async findByStoreActive(storeId: string): Promise<Supplier[]> {
    return db.suppliers
      .where('[storeId+isActive]')
      .equals([storeId, 1])
      .toArray();
  }

  async findById(id: string): Promise<Supplier | null> {
    return (await db.suppliers.get(id)) ?? null;
  }

  async findByCode(storeId: string, code: string): Promise<Supplier | null> {
    return (
      (await db.suppliers.where('[storeId+code]').equals([storeId, code]).first()) ?? null
    );
  }

  async create(input: CreateSupplierInput & { id: string }): Promise<Supplier> {
    const now = new Date().toISOString();
    const supplier: Supplier = {
      id: input.id,
      storeId: input.storeId,
      name: input.name,
      code: input.code,
      gstin: input.gstin,
      address: input.address,
      paymentTerms: input.paymentTerms,
      notes: input.notes,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await db.suppliers.add(supplier);
    return supplier;
  }

  async update(id: string, updates: UpdateSupplierInput): Promise<Supplier> {
    const existing = await db.suppliers.get(id);
    if (!existing) throw new Error(`Supplier ${id} not found`);
    const updated: Supplier = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await db.suppliers.put(updated);
    return updated;
  }
}
