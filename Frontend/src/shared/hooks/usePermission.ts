'use client';
import { useAuthContext } from '@/context/AuthContext';
import { evaluatePermission, PermissionKey } from '@/config/permissions';
import { Role } from '@/modules/account/types';

/**
 * usePermission — check if the current user has a specific permission.
 *
 * Always uses the centralized evaluatePermission() function.
 * Components never implement their own role checks.
 *
 * @example
 * const canCreateStaff = usePermission('staff:create');
 * if (!canCreateStaff) return <AccessDenied />;
 */
export function usePermission(key: PermissionKey): boolean {
  const { user } = useAuthContext();
  if (!user) return false;
  return evaluatePermission(user.role as Role, key);
}

/**
 * usePermissions — check multiple permissions at once.
 * Returns a record of key → boolean.
 */
export function usePermissions<K extends PermissionKey>(
  keys: K[]
): Record<K, boolean> {
  const { user } = useAuthContext();
  const result = {} as Record<K, boolean>;
  for (const key of keys) {
    result[key] = user ? evaluatePermission(user.role as Role, key) : false;
  }
  return result;
}
