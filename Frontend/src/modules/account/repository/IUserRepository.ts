import { User, SignUpInput } from '@/modules/account/types';

/**
 * IUserRepository — contract for all User persistence operations.
 * Storage adapters (local, API, etc.) must implement this interface.
 */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByStoreId(storeId: string): Promise<User[]>;
  create(input: SignUpInput & { id: string; role: User['role'] }): Promise<User>;
  update(id: string, updates: Partial<Omit<User, 'id' | 'passwordHash' | 'createdAt'>>): Promise<User>;
  updatePassword(id: string, newPasswordHash: string): Promise<void>;
  setVerified(id: string, verifiedAt: string): Promise<void>;
  setStoreId(id: string, storeId: string): Promise<void>;
  recordLogin(id: string, lastLoginAt: string): Promise<void>;
  deactivate(id: string): Promise<void>;
}
