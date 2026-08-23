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

  async listByStore(storeId: string, limit = 200) {
    return db('audit_logs')
      .where({ store_id: storeId })
      .orderBy('created_at', 'desc')
      .limit(limit);
  },
};
