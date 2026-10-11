/**
 * Auth middleware — verifies the JWT and enforces the permission matrix.
 *
 * The token only proves *who* the caller is. Role, store and active status are
 * re-read from the database on every request, so deactivating a staff member,
 * changing their role, or creating the owner's store takes effect immediately
 * instead of when the old token happens to expire.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/env';
import { db } from '@/db/client';
import { evaluatePermission, type PermissionKey } from '@/config/permissions';
import { AppError } from '@/shared/AppError';
import type { Role } from '@/types/domain';

export interface JwtPayload {
  userId: string;
  storeId: string | null;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing or malformed Authorization header');
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(authHeader.slice(7), config.jwtSecret) as JwtPayload;
    } catch {
      throw AppError.unauthorized('Invalid or expired token');
    }
    if (typeof payload.userId !== 'string' || !UUID_RE.test(payload.userId)) {
      throw AppError.unauthorized('Invalid or expired token');
    }

    const row = (await db('users')
      .where({ id: payload.userId })
      .first('id', 'store_id', 'role', 'is_active')) as
      | { id: string; storeId: string | null; role: Role; isActive: boolean }
      | undefined;

    if (!row) throw AppError.unauthorized('Account no longer exists.');
    if (!row.isActive) throw AppError.forbidden('This account has been deactivated.');

    req.user = { userId: row.id, storeId: row.storeId, role: row.role };
    next();
  } catch (err) {
    next(err);
  }
}

/** Requires the authenticated user's role to hold `key` in the permission matrix. */
export function requirePermission(key: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!evaluatePermission(req.user.role, key)) {
      next(AppError.forbidden(`Your role (${req.user.role}) cannot perform this action.`));
      return;
    }
    next();
  };
}

/** Restricts a route to specific roles, regardless of the permission matrix. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden(`Only ${roles.join(' / ')} can perform this action.`));
      return;
    }
    next();
  };
}

/**
 * Returns the caller's storeId, rejecting if they have not completed store
 * setup. Every tenant-scoped query derives its storeId from the token this
 * way — never from the request body, which a client could forge to read
 * another store's data.
 */
export function requireStoreId(req: Request): string {
  if (!req.user) throw AppError.unauthorized();
  if (!req.user.storeId) throw AppError.badRequest('No store is set up for this account yet.');
  return req.user.storeId;
}

export function requireUserId(req: Request): string {
  if (!req.user) throw AppError.unauthorized();
  return req.user.userId;
}
