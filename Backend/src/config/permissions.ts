/**
 * Server-side permission matrix — the ENFORCING copy.
 *
 * Frontend/src/config/permissions.ts holds an identical matrix, but that one
 * only decides what to *show* (nav items, buttons). A client can be tampered
 * with, so every protected route must also call requirePermission() here.
 *
 * Keep the two files in sync: adding a PermissionKey means adding it in both.
 */

import type { Role } from '@/types/domain';

export type PermissionKey =
  | 'dashboard:view'
  | 'store:view'
  | 'store:edit'
  | 'staff:view'
  | 'staff:create'
  | 'staff:edit'
  | 'staff:deactivate'
  | 'inventory:view'
  | 'inventory:edit'
  | 'billing:view'
  | 'billing:create'
  | 'reports:view'
  | 'settings:view'
  | 'settings:edit'
  | 'audit:view';

type PermissionMatrix = Record<Role, Record<PermissionKey, boolean>>;

export const PERMISSION_MATRIX: PermissionMatrix = {
  OWNER: {
    'dashboard:view': true,
    'store:view': true,
    'store:edit': true,
    'staff:view': true,
    'staff:create': true,
    'staff:edit': true,
    'staff:deactivate': true,
    'inventory:view': true,
    'inventory:edit': true,
    'billing:view': true,
    'billing:create': true,
    'reports:view': true,
    'settings:view': true,
    'settings:edit': true,
    'audit:view': true,
  },
  MANAGER: {
    'dashboard:view': true,
    'store:view': true,
    'store:edit': false,
    'staff:view': true,
    'staff:create': true,
    'staff:edit': true,
    'staff:deactivate': true,
    'inventory:view': true,
    'inventory:edit': true,
    'billing:view': true,
    'billing:create': true,
    'reports:view': true,
    'settings:view': true,
    'settings:edit': false,
    'audit:view': true,
  },
  CASHIER: {
    'dashboard:view': true,
    'store:view': true,
    'store:edit': false,
    'staff:view': false,
    'staff:create': false,
    'staff:edit': false,
    'staff:deactivate': false,
    'inventory:view': true,
    'inventory:edit': false,
    'billing:view': true,
    'billing:create': true,
    'reports:view': false,
    'settings:view': false,
    'settings:edit': false,
    'audit:view': false,
  },
  INVENTORY_STAFF: {
    'dashboard:view': true,
    'store:view': true,
    'store:edit': false,
    'staff:view': false,
    'staff:create': false,
    'staff:edit': false,
    'staff:deactivate': false,
    'inventory:view': true,
    'inventory:edit': true,
    'billing:view': false,
    'billing:create': false,
    'reports:view': false,
    'settings:view': false,
    'settings:edit': false,
    'audit:view': false,
  },
  ACCOUNTANT: {
    'dashboard:view': true,
    'store:view': true,
    'store:edit': false,
    'staff:view': false,
    'staff:create': false,
    'staff:edit': false,
    'staff:deactivate': false,
    'inventory:view': true,
    'inventory:edit': false,
    'billing:view': true,
    'billing:create': false,
    'reports:view': true,
    'settings:view': false,
    'settings:edit': false,
    'audit:view': true,
  },
  VIEWER: {
    'dashboard:view': true,
    'store:view': true,
    'store:edit': false,
    'staff:view': false,
    'staff:create': false,
    'staff:edit': false,
    'staff:deactivate': false,
    'inventory:view': true,
    'inventory:edit': false,
    'billing:view': false,
    'billing:create': false,
    'reports:view': false,
    'settings:view': false,
    'settings:edit': false,
    'audit:view': false,
  },
};

export function evaluatePermission(role: Role, key: PermissionKey): boolean {
  return PERMISSION_MATRIX[role]?.[key] ?? false;
}
