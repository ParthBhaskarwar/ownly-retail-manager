import { User } from '@/modules/account/types';
import { CreateStaffInput, UpdateStaffInput } from '@/modules/staff/types';

/**
 * IStaffRepository — contract for staff management operations.
 * Note: Staff members are Users with a storeId and non-OWNER roles.
 */
export interface IStaffRepository {
  findByStoreId(storeId: string): Promise<User[]>;
  findById(id: string): Promise<User | null>;
  create(input: CreateStaffInput & { id: string; passwordHash: string }): Promise<User>;
  update(id: string, updates: UpdateStaffInput): Promise<User>;
  deactivate(id: string): Promise<void>;
  reactivate(id: string): Promise<void>;
}
