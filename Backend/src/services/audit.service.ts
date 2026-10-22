/**
 * AuditService — writes the audit trail required by plan §2.20.
 *
 * Replaces the browser localStorage stub. Accepts an optional transaction so
 * an audit row can be committed atomically with the change it describes.
 *
 * Auditing must never break the operation it is recording: if the insert
 * fails outside a transaction, we log and continue rather than failing the
 * user's request.
 */

import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { db } from '@/db/client';

export interface AuditInput {
  action: string;              // e.g. 'product.price_change'
  userId?: string | null;
  storeId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}

export interface AuditQueryOptions {
  limit?: number;
  offset?: number;
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface AuditRecordItem {
  id: string;
  storeId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export const AuditService = {
  async log(input: AuditInput, trx?: Knex.Transaction): Promise<void> {
    const row = {
      id: randomUUID(),
      store_id: input.storeId ?? null,
      user_id: input.userId ?? null,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      meta: JSON.stringify(input.meta ?? {}),
    };

    if (trx) {
      // Inside a transaction the caller wants atomicity — let failures surface.
      await trx('audit_logs').insert(row);
      return;
    }

    try {
      await db('audit_logs').insert(row);
    } catch (err) {
      console.error('[Audit] failed to record', input.action, (err as Error).message);
    }
  },

  async listByStore(storeId: string, options: AuditQueryOptions = {}) {
    const limit = Math.min(Math.max(1, options.limit ?? 100), 500);
    const offset = Math.max(0, options.offset ?? 0);

    const baseQuery = db('audit_logs')
      .leftJoin('users', 'audit_logs.user_id', 'users.id')
      .where('audit_logs.store_id', storeId);

    if (options.action) {
      baseQuery.andWhere('audit_logs.action', 'ilike', `%${options.action}%`);
    }

    if (options.entityType) {
      baseQuery.andWhere('audit_logs.entity_type', options.entityType);
    }

    if (options.userId) {
      baseQuery.andWhere('audit_logs.user_id', options.userId);
    }

    if (options.startDate) {
      baseQuery.andWhere('audit_logs.created_at', '>=', options.startDate);
    }

    if (options.endDate) {
      baseQuery.andWhere('audit_logs.created_at', '<=', options.endDate);
    }

    if (options.search) {
      const term = `%${options.search}%`;
      baseQuery.andWhere((builder) => {
        builder
          .where('audit_logs.action', 'ilike', term)
          .orWhere('audit_logs.entity_type', 'ilike', term)
          .orWhere('users.name', 'ilike', term)
          .orWhere('users.email', 'ilike', term);
      });
    }

    // Get total count
    const countResult = await baseQuery.clone().count<{ count: string | number }>('audit_logs.id as count').first();
    const total = Number(countResult?.count ?? 0);

    // Get paginated rows
    const rows = await baseQuery
      .select(
        'audit_logs.id',
        'audit_logs.store_id as storeId',
        'audit_logs.user_id as userId',
        'users.name as userName',
        'users.email as userEmail',
        'users.role as userRole',
        'audit_logs.action',
        'audit_logs.entity_type as entityType',
        'audit_logs.entity_id as entityId',
        'audit_logs.meta',
        'audit_logs.created_at as createdAt'
      )
      .orderBy('audit_logs.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const logs: AuditRecordItem[] = rows.map((r: Record<string, unknown>) => {
      let parsedMeta: Record<string, unknown> = {};
      if (r['meta']) {
        if (typeof r['meta'] === 'string') {
          try {
            parsedMeta = JSON.parse(r['meta'] as string);
          } catch {
            parsedMeta = {};
          }
        } else if (typeof r['meta'] === 'object') {
          parsedMeta = r['meta'] as Record<string, unknown>;
        }
      }

      return {
        id: String(r['id']),
        storeId: r['storeId'] ? String(r['storeId']) : null,
        userId: r['userId'] ? String(r['userId']) : null,
        userName: r['userName'] ? String(r['userName']) : null,
        userEmail: r['userEmail'] ? String(r['userEmail']) : null,
        userRole: r['userRole'] ? String(r['userRole']) : null,
        action: String(r['action']),
        entityType: r['entityType'] ? String(r['entityType']) : null,
        entityId: r['entityId'] ? String(r['entityId']) : null,
        meta: parsedMeta,
        createdAt: new Date(r['createdAt'] as string | number | Date).toISOString(),
      };
    });

    return { logs, total, limit, offset };
  },

  async getDistinctActions(storeId: string): Promise<string[]> {
    const rows = await db('audit_logs')
      .where('store_id', storeId)
      .distinct('action')
      .orderBy('action', 'asc');
    return rows.map((r: { action: string }) => r.action);
  },
};

