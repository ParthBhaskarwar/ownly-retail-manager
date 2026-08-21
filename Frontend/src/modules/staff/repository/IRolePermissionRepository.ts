import { RolePermission } from '@/modules/staff/types';
import { Role } from '@/modules/account/types';
import { PermissionKey } from '@/config/permissions';

/**
 * IRolePermissionRepository — contract for role permission overrides.
 * The base permission matrix is in config/permissions.ts.
 * This repository handles per-store overrides stored persistently.
 */
export interface IRolePermissionRepository {
  findByStoreAndRole(storeId: string, role: Role): Promise<RolePermission[]>;
  findByStore(storeId: string): Promise<RolePermission[]>;
  upsert(input: {
    storeId: string;
    role: Role;
    permissionKey: PermissionKey;
    allowed: boolean;
  }): Promise<RolePermission>;
  deleteByStore(storeId: string): Promise<void>;
}
