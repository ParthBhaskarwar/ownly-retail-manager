/**
 * Migration 002 — audit_logs.
 *
 * Implements the audit trail required by plan §2.20: "Audit user, timestamp,
 * action, old value, new value and reason." Replaces the localStorage-based
 * AuditService stub that ran in the browser.
 *
 * store_id / user_id are nullable because some auditable events happen before
 * either exists (e.g. auth.signup).
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').nullable().references('id').inTable('stores').onDelete('SET NULL');
    t.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('action', 100).notNullable();      // e.g. 'product.price_change'
    t.string('entity_type', 50).nullable();     // e.g. 'product'
    t.uuid('entity_id').nullable();
    t.jsonb('meta').notNullable().defaultTo('{}');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index(['store_id', 'created_at']);
    t.index(['action']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
