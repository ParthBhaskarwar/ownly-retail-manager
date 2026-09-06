/**
 * StaffService — staff accounts within a store.
 *
 * Ported from Frontend/src/modules/staff/services/StaffService.ts.
 * Staff are rows in `users` scoped by store_id; the OWNER is the account that
 * created the store.
 *
 * Every method takes storeId from the caller's token (never the request body),
 * so one store can never read or mutate another store's staff.
 */

import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/db/client';
import { config } from '@/config/env';
import { AppError } from '@/shared/AppError';
import { AuditService } from './audit.service';
import type { Role, Session, User } from '@/types/domain';

const SAFE_COLUMNS = [
  'id', 'store_id', 'name', 'email', 'phone', 'role',
  'is_active', 'verified_at', 'last_login_at', 'created_at', 'updated_at',
];

export const StaffService = {
  async list(storeId: string): Promise<User[]> {
    return db('users').select(SAFE_COLUMNS).where({ store_id: storeId }).orderBy('created_at', 'asc');
  },

  async getById(storeId: string, id: string): Promise<User> {
    const row = await db('users').select(SAFE_COLUMNS).where({ id, store_id: storeId }).first();
    if (!row) throw AppError.notFound('Staff member not found.');
    return row as User;
  },

  async create(
    storeId: string,
    actorId: string,
    input: { name: string; email: string; phone: string; password: string; role: Role }
  ): Promise<User> {
    const email = input.email.trim().toLowerCase();

    if (input.role === 'OWNER') {
      throw AppError.badRequest('A store can only have one owner; pick a different role.');
    }

    const existing = await db('users').where({ email }).first();
    if (existing) throw AppError.conflict('An account with this email already exists.');

    const id = randomUUID();
    await db('users').insert({
      id,
      store_id: storeId,
      name: input.name.trim(),
      email,
      phone: input.phone.trim(),
      password_hash: await bcrypt.hash(input.password, config.bcryptRounds),
      role: input.role,
      is_active: true,
      // Staff created by an owner are pre-verified — the owner vouches for them.
      verified_at: new Date(),
    });

    await AuditService.log({
      action: 'staff.create', userId: actorId, storeId,
      entityType: 'user', entityId: id, meta: { email, role: input.role },
    });

    return this.getById(storeId, id);
  },

  async update(
    storeId: string,
    actorId: string,
    id: string,
    updates: Partial<{ name: string; phone: string; role: Role; isActive: boolean }>
  ): Promise<User> {
    const target = await this.getById(storeId, id);

    if (target.role === 'OWNER' && (updates.role || updates.isActive === false)) {
      throw AppError.badRequest('The store owner cannot be demoted or deactivated.');
    }

    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.phone !== undefined) patch.phone = updates.phone;
    if (updates.role !== undefined) patch.role = updates.role;
    if (updates.isActive !== undefined) patch.is_active = updates.isActive;

    await db('users').where({ id, store_id: storeId }).update(patch);

    await AuditService.log({
      action: 'staff.update', userId: actorId, storeId,
      entityType: 'user', entityId: id, meta: { ...updates },
    });

    return this.getById(storeId, id);
  },

  async deactivate(storeId: string, actorId: string, id: string): Promise<User> {
    if (id === actorId) throw AppError.badRequest('You cannot deactivate your own account.');
    return this.update(storeId, actorId, id, { isActive: false });
  },

  /** Login history / active sessions for one staff member (plan §2.2). */
  async listSessions(storeId: string, userId: string): Promise<Session[]> {
    await this.getById(storeId, userId); // scope check
    return db('sessions').where({ user_id: userId }).orderBy('created_at', 'desc').limit(50);
  },
};
