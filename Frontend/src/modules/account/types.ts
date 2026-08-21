/**
 * Account module — User and Session domain types.
 */

export type Role =
  | 'OWNER'
  | 'MANAGER'
  | 'CASHIER'
  | 'INVENTORY_STAFF'
  | 'ACCOUNTANT'
  | 'VIEWER';

export interface User {
  id: string;
  storeId: string | null; // null until store is set up
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  verifiedAt: string | null; // ISO date string
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  deviceInfo: DeviceInfo;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
}

// ─── DTOs / Input shapes ──────────────────────────────────────────────────────

export interface SignUpInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface VerifyInput {
  userId: string;
  code: string;
}

export interface UpdatePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

// ─── Auth result types ────────────────────────────────────────────────────────

export interface AuthResult {
  user: Omit<User, 'passwordHash'>;
  session: Session;
  token: string;
}

export interface PendingVerification {
  userId: string;
  code: string; // exposed in dev mode only
  email: string;
}
