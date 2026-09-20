/**
 * Central permission-matrix configuration.
 */

import { Role } from '@/modules/account/types';

// ─── Permission Keys ──────────────────────────────────────────────────────────

export type PermissionKey =
  // Dashboard
  | 'dashboard:view'
  // Store
  | 'store:view'
  | 'store:edit'
  // Staff
  | 'staff:view'
  | 'staff:create'
  | 'staff:edit'
  | 'staff:deactivate'
  // Inventory
  | 'inventory:view'
  | 'inventory:edit'
  // Billing & POS
  | 'billing:view'
  | 'billing:create'
  | 'billing:discount:limited'
  | 'billing:discount:unlimited'
  // Returns & Exchanges
  | 'returns:create'
  | 'exchanges:create'
  | 'credit_notes:manage'
  // Reports
  | 'reports:view'
  // Settings
  | 'settings:view'
  | 'settings:edit'
  // Audit logs
  | 'audit:view';

// ─── Permission Matrix ────────────────────────────────────────────────────────

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
    'billing:discount:limited': true,
    'billing:discount:unlimited': true,
    'returns:create': true,
    'exchanges:create': true,
    'credit_notes:manage': true,
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
    'billing:discount:limited': true,
    'billing:discount:unlimited': true,
    'returns:create': true,
    'exchanges:create': true,
    'credit_notes:manage': true,
    'reports:view': true,
    'settings:view': true,
    'settings:edit': true,
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
    'billing:discount:limited': true,
    'billing:discount:unlimited': false,
    'returns:create': true,
    'exchanges:create': true,
    'credit_notes:manage': false,
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
    'billing:discount:limited': false,
    'billing:discount:unlimited': false,
    'returns:create': false,
    'exchanges:create': false,
    'credit_notes:manage': false,
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
    'billing:discount:limited': false,
    'billing:discount:unlimited': false,
    'returns:create': false,
    'exchanges:create': false,
    'credit_notes:manage': true,
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
    'billing:discount:limited': false,
    'billing:discount:unlimited': false,
    'returns:create': false,
    'exchanges:create': false,
    'credit_notes:manage': false,
    'reports:view': false,
    'settings:view': false,
    'settings:edit': false,
    'audit:view': false,
  },
};

export function evaluatePermission(role: Role, key: PermissionKey): boolean {
  return PERMISSION_MATRIX[role]?.[key] ?? false;
}

export function getAllowedPermissions(role: Role): PermissionKey[] {
  const matrix = PERMISSION_MATRIX[role];
  return (Object.keys(matrix) as PermissionKey[]).filter((key) => matrix[key]);
}
