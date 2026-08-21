import { Store, CreateStoreInput, UpdateStoreInput } from '@/modules/store/types';

/**
 * IStoreRepository — contract for all Store persistence operations.
 */
export interface IStoreRepository {
  findById(id: string): Promise<Store | null>;
  findByOwnerId(ownerId: string): Promise<Store | null>;
  create(input: CreateStoreInput & { id: string }): Promise<Store>;
  update(id: string, updates: UpdateStoreInput): Promise<Store>;
  markSetupComplete(id: string): Promise<Store>;
}
