import { User } from '@/modules/account/types';
import { CreateStaffInput, UpdateStaffInput } from '@/modules/staff/types';
import { IStaffRepository } from '@/modules/staff/repository/IStaffRepository';

const STORAGE_KEY = 'ownly:users'; // Staff are stored in the same users store

function readAll(): User[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as User[];
  } catch {
    return [];
  }
}

function writeAll(users: User[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export class LocalStaffAdapter implements IStaffRepository {
  async findByStoreId(storeId: string): Promise<User[]> {
    return readAll().filter((u) => u.storeId === storeId);
  }

  async findById(id: string): Promise<User | null> {
    return readAll().find((u) => u.id === id) ?? null;
  }

  async create(
    input: CreateStaffInput & { id: string; passwordHash: string }
  ): Promise<User> {
    const all = readAll();
    const now = new Date().toISOString();
    const user: User = {
      id: input.id,
      storeId: input.storeId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: input.passwordHash,
      role: input.role,
      isActive: true,
      verifiedAt: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    writeAll([...all, user]);
    return user;
  }

  async update(id: string, updates: UpdateStaffInput): Promise<User> {
    const all = readAll();
    const idx = all.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error(`Staff member ${id} not found`);
    const updated = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
    all[idx] = updated;
    writeAll(all);
    return updated;
  }

  async deactivate(id: string): Promise<void> {
    await this.update(id, { isActive: false });
  }

  async reactivate(id: string): Promise<void> {
    await this.update(id, { isActive: true });
  }
}
