import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from '@/modules/catalog/types';

export interface ISupplierRepository {
  findByStore(storeId: string): Promise<Supplier[]>;
  findByStoreActive(storeId: string): Promise<Supplier[]>;
  findById(id: string): Promise<Supplier | null>;
  findByCode(storeId: string, code: string): Promise<Supplier | null>;
  create(input: CreateSupplierInput & { id: string }): Promise<Supplier>;
  update(id: string, updates: UpdateSupplierInput): Promise<Supplier>;
}
