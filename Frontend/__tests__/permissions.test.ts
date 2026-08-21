/**
 * Unit tests: Permission matrix evaluation.
 * Tests evaluatePermission() and getAllowedPermissions() for all 6 roles.
 */

import { evaluatePermission, getAllowedPermissions, PERMISSION_MATRIX, PermissionKey } from '@/config/permissions';
import type { Role } from '@/modules/account/types';

const ALL_ROLES: Role[] = ['OWNER', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'ACCOUNTANT', 'VIEWER'];

describe('evaluatePermission()', () => {
  // ── OWNER: must have all permissions ────────────────────────────────────────
  describe('OWNER', () => {
    const allKeys = Object.keys(PERMISSION_MATRIX.OWNER) as PermissionKey[];

    test.each(allKeys)('OWNER should have %s', (key) => {
      expect(evaluatePermission('OWNER', key)).toBe(true);
    });
  });

  // ── VIEWER: should have very restricted access ───────────────────────────────
  describe('VIEWER', () => {
    test('VIEWER can view dashboard', () => {
      expect(evaluatePermission('VIEWER', 'dashboard:view')).toBe(true);
    });
    test('VIEWER can view store', () => {
      expect(evaluatePermission('VIEWER', 'store:view')).toBe(true);
    });
    test('VIEWER can view inventory', () => {
      expect(evaluatePermission('VIEWER', 'inventory:view')).toBe(true);
    });
    test('VIEWER cannot create staff', () => {
      expect(evaluatePermission('VIEWER', 'staff:create')).toBe(false);
    });
    test('VIEWER cannot edit store', () => {
      expect(evaluatePermission('VIEWER', 'store:edit')).toBe(false);
    });
    test('VIEWER cannot view billing', () => {
      expect(evaluatePermission('VIEWER', 'billing:view')).toBe(false);
    });
    test('VIEWER cannot view settings', () => {
      expect(evaluatePermission('VIEWER', 'settings:view')).toBe(false);
    });
    test('VIEWER cannot view audit', () => {
      expect(evaluatePermission('VIEWER', 'audit:view')).toBe(false);
    });
  });

  // ── CASHIER: billing access, no staff management ────────────────────────────
  describe('CASHIER', () => {
    test('CASHIER can view billing', () => {
      expect(evaluatePermission('CASHIER', 'billing:view')).toBe(true);
    });
    test('CASHIER can create billing', () => {
      expect(evaluatePermission('CASHIER', 'billing:create')).toBe(true);
    });
    test('CASHIER cannot view staff', () => {
      expect(evaluatePermission('CASHIER', 'staff:view')).toBe(false);
    });
    test('CASHIER cannot edit store', () => {
      expect(evaluatePermission('CASHIER', 'store:edit')).toBe(false);
    });
    test('CASHIER cannot deactivate staff', () => {
      expect(evaluatePermission('CASHIER', 'staff:deactivate')).toBe(false);
    });
    test('CASHIER cannot view reports', () => {
      expect(evaluatePermission('CASHIER', 'reports:view')).toBe(false);
    });
  });

  // ── INVENTORY_STAFF: inventory edit, no billing ─────────────────────────────
  describe('INVENTORY_STAFF', () => {
    test('INVENTORY_STAFF can view inventory', () => {
      expect(evaluatePermission('INVENTORY_STAFF', 'inventory:view')).toBe(true);
    });
    test('INVENTORY_STAFF can edit inventory', () => {
      expect(evaluatePermission('INVENTORY_STAFF', 'inventory:edit')).toBe(true);
    });
    test('INVENTORY_STAFF cannot view billing', () => {
      expect(evaluatePermission('INVENTORY_STAFF', 'billing:view')).toBe(false);
    });
    test('INVENTORY_STAFF cannot view staff', () => {
      expect(evaluatePermission('INVENTORY_STAFF', 'staff:view')).toBe(false);
    });
    test('INVENTORY_STAFF cannot create billing', () => {
      expect(evaluatePermission('INVENTORY_STAFF', 'billing:create')).toBe(false);
    });
  });

  // ── ACCOUNTANT: can see billing and reports, not edit anything ──────────────
  describe('ACCOUNTANT', () => {
    test('ACCOUNTANT can view billing', () => {
      expect(evaluatePermission('ACCOUNTANT', 'billing:view')).toBe(true);
    });
    test('ACCOUNTANT can view reports', () => {
      expect(evaluatePermission('ACCOUNTANT', 'reports:view')).toBe(true);
    });
    test('ACCOUNTANT can view audit', () => {
      expect(evaluatePermission('ACCOUNTANT', 'audit:view')).toBe(true);
    });
    test('ACCOUNTANT cannot create billing', () => {
      expect(evaluatePermission('ACCOUNTANT', 'billing:create')).toBe(false);
    });
    test('ACCOUNTANT cannot view staff', () => {
      expect(evaluatePermission('ACCOUNTANT', 'staff:view')).toBe(false);
    });
    test('ACCOUNTANT cannot edit inventory', () => {
      expect(evaluatePermission('ACCOUNTANT', 'inventory:edit')).toBe(false);
    });
    test('ACCOUNTANT cannot view settings', () => {
      expect(evaluatePermission('ACCOUNTANT', 'settings:view')).toBe(false);
    });
  });

  // ── MANAGER: broad access but cannot edit store settings ────────────────────
  describe('MANAGER', () => {
    test('MANAGER can view staff', () => {
      expect(evaluatePermission('MANAGER', 'staff:view')).toBe(true);
    });
    test('MANAGER can create staff', () => {
      expect(evaluatePermission('MANAGER', 'staff:create')).toBe(true);
    });
    test('MANAGER can deactivate staff', () => {
      expect(evaluatePermission('MANAGER', 'staff:deactivate')).toBe(true);
    });
    test('MANAGER can view reports', () => {
      expect(evaluatePermission('MANAGER', 'reports:view')).toBe(true);
    });
    test('MANAGER cannot edit store', () => {
      expect(evaluatePermission('MANAGER', 'store:edit')).toBe(false);
    });
    test('MANAGER cannot edit settings', () => {
      expect(evaluatePermission('MANAGER', 'settings:edit')).toBe(false);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────
  describe('Edge cases', () => {
    test('returns false for unknown permission key on any role', () => {
      ALL_ROLES.forEach((role) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(evaluatePermission(role, 'nonexistent:key' as any)).toBe(false);
      });
    });

    test('no role other than OWNER can edit settings', () => {
      const nonOwners = ALL_ROLES.filter((r) => r !== 'OWNER');
      nonOwners.forEach((role) => {
        expect(evaluatePermission(role, 'settings:edit')).toBe(false);
      });
    });

    test('all roles can view dashboard', () => {
      ALL_ROLES.forEach((role) => {
        expect(evaluatePermission(role, 'dashboard:view')).toBe(true);
      });
    });
  });
});

describe('getAllowedPermissions()', () => {
  test('OWNER has more permissions than any other role', () => {
    const ownerPerms = getAllowedPermissions('OWNER').length;
    const nonOwnerPerms = ALL_ROLES.filter((r) => r !== 'OWNER').map(
      (r) => getAllowedPermissions(r).length
    );
    nonOwnerPerms.forEach((count) => {
      expect(ownerPerms).toBeGreaterThan(count);
    });
  });

  test('VIEWER has the fewest permissions', () => {
    const viewerPerms = getAllowedPermissions('VIEWER').length;
    const otherPerms = ALL_ROLES.filter((r) => r !== 'VIEWER').map(
      (r) => getAllowedPermissions(r).length
    );
    otherPerms.forEach((count) => {
      expect(count).toBeGreaterThanOrEqual(viewerPerms);
    });
  });

  test('returns an array (not empty) for all roles', () => {
    ALL_ROLES.forEach((role) => {
      const perms = getAllowedPermissions(role);
      expect(Array.isArray(perms)).toBe(true);
      expect(perms.length).toBeGreaterThan(0);
    });
  });
});
