import bcrypt from 'bcryptjs';
import { User, SignUpInput } from '@/modules/account/types';
import { IUserRepository } from '@/modules/account/repository/IUserRepository';
import { AppConfig } from '@/config/env';

const STORAGE_KEY = 'ownly:users';

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

export class LocalUserAdapter implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    return readAll().find((u) => u.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return readAll().find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async findByStoreId(storeId: string): Promise<User[]> {
    return readAll().filter((u) => u.storeId === storeId);
  }

  async create(input: SignUpInput & { id: string; role: User['role'] }): Promise<User> {
    const all = readAll();
    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(input.password, AppConfig.auth.bcryptRounds);
    const user: User = {
      id: input.id,
      storeId: null,
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
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

  async update(
    id: string,
    updates: Partial<Omit<User, 'id' | 'passwordHash' | 'createdAt'>>
  ): Promise<User> {
    const all = readAll();
    const idx = all.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error(`User ${id} not found`);
    const updated = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
    all[idx] = updated;
    writeAll(all);
    return updated;
  }

  async updatePassword(id: string, newPasswordHash: string): Promise<void> {
    const all = readAll();
    const idx = all.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error(`User ${id} not found`);
    all[idx] = { ...all[idx], passwordHash: newPasswordHash, updatedAt: new Date().toISOString() };
    writeAll(all);
  }

  async setVerified(id: string, verifiedAt: string): Promise<void> {
    await this.update(id, { verifiedAt });
  }

  async setStoreId(id: string, storeId: string): Promise<void> {
    await this.update(id, { storeId });
  }

  async recordLogin(id: string, lastLoginAt: string): Promise<void> {
    await this.update(id, { lastLoginAt });
  }

  async deactivate(id: string): Promise<void> {
    await this.update(id, { isActive: false });
  }
}
