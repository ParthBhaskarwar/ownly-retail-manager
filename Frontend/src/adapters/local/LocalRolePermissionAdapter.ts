import { RolePermission } from '@/modules/staff/types';
import { Role } from '@/modules/account/types';
import { PermissionKey } from '@/config/permissions';
import { IRolePermissionRepository } from '@/modules/staff/repository/IRolePermissionRepository';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'ownly:role_permissions';

function readAll(): RolePermission[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as RolePermission[];
  } catch {
    return [];
  }
}

function writeAll(perms: RolePermission[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(perms));
}

export class LocalRolePermissionAdapter implements IRolePermissionRepository {
  async findByStoreAndRole(storeId: string, role: Role): Promise<RolePermission[]> {
    return readAll().filter((p) => p.storeId === storeId && p.role === role);
  }

  async findByStore(storeId: string): Promise<RolePermission[]> {
    return readAll().filter((p) => p.storeId === storeId);
  }

  async upsert(input: {
    storeId: string;
    role: Role;
    permissionKey: PermissionKey;
    allowed: boolean;
  }): Promise<RolePermission> {
    const all = readAll();
    const existing = all.findIndex(
      (p) =>
        p.storeId === input.storeId &&
        p.role === input.role &&
        p.permissionKey === input.permissionKey
    );
    if (existing !== -1) {
      all[existing] = { ...all[existing], allowed: input.allowed };
      writeAll(all);
      return all[existing];
    }
    const newPerm: RolePermission = {
      id: uuidv4(),
      storeId: input.storeId,
      role: input.role,
      permissionKey: input.permissionKey,
      allowed: input.allowed,
    };
    writeAll([...all, newPerm]);
    return newPerm;
  }

  async deleteByStore(storeId: string): Promise<void> {
    writeAll(readAll().filter((p) => p.storeId !== storeId));
  }
}
