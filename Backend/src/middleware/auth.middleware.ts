/**
 * Auth middleware — verifies the JWT and enforces the permission matrix.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/env';
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

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    // In development, allow unauthenticated requests with a default owner identity
    // so the billing POS can be demoed locally without a live token.
    if (config.isDev) {
      req.user = { userId: 'local-user', storeId: null, role: 'OWNER' };
      next();
      return;
    }
    next(AppError.unauthorized('Missing or malformed Authorization header'));
    return;
  }

  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, config.jwtSecret) as JwtPayload;
    next();
  } catch {
    // In development, fall back to a default identity if token verification fails.
    if (config.isDev) {
      req.user = { userId: 'local-user', storeId: null, role: 'OWNER' };
      next();
      return;
    }
    next(AppError.unauthorized('Invalid or expired token'));
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
