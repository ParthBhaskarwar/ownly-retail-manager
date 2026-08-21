/**
 * Central permission-matrix configuration.
 *
 * This is the SINGLE SOURCE OF TRUTH for what each role can do.
 * No per-screen hard-coded role checks — everything flows through
 * evaluatePermission() and the usePermission() hook.
 *
 * To add a new permission: add the key to PermissionKey, then
 * populate its allowed value for each role below.
 */

import { Role } from '@/modules/staff/types';

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
  // Inventory (stubbed for future weeks)
  | 'inventory:view'
  | 'inventory:edit'
  // Billing (stubbed for future weeks)
  | 'billing:view'
  | 'billing:create'
  // Reports (stubbed for future weeks)
  | 'reports:view'
  // Settings
  | 'settings:view'
  | 'settings:edit'
  // Audit logs (stubbed for future weeks)
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

// ─── Evaluator ────────────────────────────────────────────────────────────────

/**
 * Evaluate whether a given role has a specific permission.
 * This is the canonical permission check function — use this everywhere.
 */
export function evaluatePermission(role: Role, key: PermissionKey): boolean {
  return PERMISSION_MATRIX[role]?.[key] ?? false;
}

/**
 * Get all allowed permission keys for a role.
 */
export function getAllowedPermissions(role: Role): PermissionKey[] {
  const matrix = PERMISSION_MATRIX[role];
  return (Object.keys(matrix) as PermissionKey[]).filter((key) => matrix[key]);
}
