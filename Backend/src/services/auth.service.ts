/**
 * AuthService — server-side authentication.
 *
 * Ported from Frontend/src/modules/account/services/AuthService.ts, with the
 * parts that were only safe as a local stub made real:
 *   - bcrypt hashing runs on the server, never in the browser
 *   - the session token is a signed JWT, not `${uuid}.${timestamp}`
 *   - a `sessions` row backs every login, giving login history and the
 *     ability to revoke (plan §2.2 "Login history, session controls")
 *
 * Email delivery is still stubbed: the 6-digit verification code is returned
 * in the signup response in development so the UI can display it. That is a
 * known limitation to disclose at handover.
 */

import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/db/client';
import { config } from '@/config/env';
import { AppError } from '@/shared/AppError';
import { AuditService } from './audit.service';
import type { AuthResult, DeviceInfo, Role, Session, User } from '@/types/domain';

// ─── Row → domain mapping ─────────────────────────────────────────────────────
// postProcessResponse already camelCases keys; these helpers drop secrets and
// normalise nullable columns.

interface UserRow extends User {
  passwordHash: string;
  verificationCode: string | null;
}

function toUser(row: UserRow): User {
  const { passwordHash: _p, verificationCode: _v, ...safe } = row;
  return safe as User;
}

function signToken(user: Pick<User, 'id' | 'storeId' | 'role'>): string {
  return jwt.sign(
    { userId: user.id, storeId: user.storeId, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
  );
}

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const AuthService = {
  /**
   * Register a new owner account. Role is always OWNER — account creators
   * never pick their own role; staff are created separately by an owner.
   */
  async signUp(input: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<{ userId: string; email: string; devCode?: string }> {
    const email = input.email.trim().toLowerCase();

    const existing = await db('users').where({ email }).first();
    if (existing) throw AppError.conflict('An account with this email already exists.');

    const id = randomUUID();
    const code = generateVerificationCode();

    await db('users').insert({
      id,
      store_id: null,
      name: input.name.trim(),
      email,
      phone: input.phone.trim(),
      password_hash: await bcrypt.hash(input.password, config.bcryptRounds),
      role: 'OWNER',
      is_active: true,
      verified_at: null,
      verification_code: code,
    });

    await AuditService.log({ action: 'auth.signup', userId: id, meta: { email } });

    // Stub: a real deployment would email this instead of returning it.
    console.info(`[Auth] Verification code for ${email}: ${code}`);
    return { userId: id, email, devCode: config.isDev ? code : undefined };
  },

  async verify(userId: string, code: string): Promise<void> {
    const user = await db('users').where({ id: userId }).first();
    if (!user) throw AppError.notFound('Account not found. Please sign up again.');
    if (user.verifiedAt) return; // already verified — idempotent

    if (!user.verificationCode || user.verificationCode !== code) {
      throw AppError.badRequest('Invalid verification code. Please try again.');
    }

    await db('users').where({ id: userId }).update({
      verified_at: new Date(),
      verification_code: null,
      updated_at: new Date(),
    });

    await AuditService.log({ action: 'auth.verify', userId });
  },

  async login(
    input: { email: string; password: string },
    deviceInfo: DeviceInfo | null
  ): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const row = (await db('users').where({ email }).first()) as UserRow | undefined;

    // Same message for "no such user" and "wrong password" so the endpoint
    // cannot be used to enumerate which emails have accounts.
    if (!row) throw AppError.unauthorized('Invalid email or password.');
    if (!row.isActive) {
      throw AppError.forbidden('This account has been deactivated. Contact your store owner.');
    }
    if (!(await bcrypt.compare(input.password, row.passwordHash))) {
      throw AppError.unauthorized('Invalid email or password.');
    }
    if (!row.verifiedAt) {
      throw AppError.forbidden('Please verify your email address before logging in.');
    }

    const now = new Date();
    const sessionId = randomUUID();
    const expiresAt = new Date(now.getTime() + parseDuration(config.jwtExpiresIn));

    await db('sessions').insert({
      id: sessionId,
      user_id: row.id,
      expires_at: expiresAt,
      device_info: deviceInfo ? JSON.stringify(deviceInfo) : null,
    });

    await db('users').where({ id: row.id }).update({ last_login_at: now, updated_at: now });

    await AuditService.log({
      action: 'auth.login',
      userId: row.id,
      storeId: row.storeId,
    });

    const user = toUser({ ...row, lastLoginAt: now.toISOString() });
    const session: Session = {
      id: sessionId,
      userId: row.id,
      expiresAt: expiresAt.toISOString(),
      deviceInfo,
      createdAt: now.toISOString(),
    };

    return { user, session, token: signToken(user) };
  },

  async logout(userId: string): Promise<void> {
    await db('sessions').where({ user_id: userId }).del();
    await AuditService.log({ action: 'auth.logout', userId });
  },

  /** Resolves the caller from their JWT — backs GET /api/auth/me. */
  async me(userId: string): Promise<User> {
    const row = (await db('users').where({ id: userId }).first()) as UserRow | undefined;
    if (!row) throw AppError.unauthorized('Account no longer exists.');
    if (!row.isActive) throw AppError.forbidden('This account has been deactivated.');
    return toUser(row);
  },

  /**
   * Re-issues a token after storeId changes (store creation), so the caller's
   * subsequent requests carry the new storeId without forcing a re-login.
   */
  issueToken(user: Pick<User, 'id' | 'storeId' | 'role'>): string {
    return signToken(user);
  },
};

/** Converts '7d' / '24h' / '30m' / '3600' to milliseconds. */
function parseDuration(value: string): number {
  const match = /^(\d+)([dhms])?$/.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = parseInt(match[1], 10);
  const unit = match[2] ?? 's';
  const factor = { d: 86400000, h: 3600000, m: 60000, s: 1000 }[unit] ?? 1000;
  return amount * factor;
}

export type { Role };
