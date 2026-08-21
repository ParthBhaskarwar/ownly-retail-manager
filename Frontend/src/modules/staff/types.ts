/**
 * Staff module — Role, RolePermission domain types.
 * Re-exports Role from account/types for convenience.
 */

import type { Role } from '@/modules/account/types';

export type { Role };

export interface RolePermission {
  id: string;
  storeId: string;
  role: Role;
  permissionKey: string;
  allowed: boolean;
}

// ─── Staff-specific User view ──────────────────────────────────────────────────

/** Staff member as seen in the staff management module (no password hash). */
export interface StaffMember {
  id: string;
  storeId: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  isActive: boolean;
  verifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateStaffInput {
  storeId: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
}

export interface UpdateStaffInput {
  name?: string;
  phone?: string;
  role?: Role;
  isActive?: boolean;
}
