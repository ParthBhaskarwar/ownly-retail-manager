import { Store, CreateStoreInput, UpdateStoreInput } from '@/modules/store/types';
import { IStoreRepository } from '@/modules/store/repository/IStoreRepository';

const STORAGE_KEY = 'ownly:stores';

function readAll(): Store[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Store[];
  } catch {
    return [];
  }
}

function writeAll(stores: Store[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stores));
}

export class LocalStoreAdapter implements IStoreRepository {
  async findById(id: string): Promise<Store | null> {
    return readAll().find((s) => s.id === id) ?? null;
  }

  async findByOwnerId(ownerId: string): Promise<Store | null> {
    return readAll().find((s) => s.ownerId === ownerId) ?? null;
  }

  async create(input: CreateStoreInput & { id: string }): Promise<Store> {
    const now = new Date().toISOString();
    const store: Store = {
      id: input.id,
      ownerId: input.ownerId,
      name: input.name,
      address: input.address,
      phone: input.phone,
      retailType: input.retailType,
      currency: input.currency ?? 'INR',
      gstNumber: input.gstNumber,
      taxSettings: input.taxSettings,
      invoiceSettings: input.invoiceSettings,
      logoUrl: input.logoUrl,
      setupCompleted: false,
      createdAt: now,
      updatedAt: now,
    };
    writeAll([...readAll(), store]);
    return store;
  }

  async update(id: string, updates: UpdateStoreInput): Promise<Store> {
    const all = readAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Store ${id} not found`);
    const updated = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
    all[idx] = updated;
    writeAll(all);
    return updated;
  }

  async markSetupComplete(id: string): Promise<Store> {
    return this.update(id, { setupCompleted: true });
  }
}
