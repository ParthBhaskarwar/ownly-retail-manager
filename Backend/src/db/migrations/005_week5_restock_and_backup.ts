/**
 * Migration 005 — Week 5: restock_batches, backups tables; RESTOCK movement type.
 *
 * restock_batches: one row per manual restock operation, so the full history
 *   of "who restocked what and when" is queryable independently of movements.
 *
 * backups: audit trail for backup files — tracks filename, size, and who
 *   created the backup, used by the storage-health endpoint.
 *
 * RESTOCK movement type: added to inventory_movements check constraint so
 *   the service can record a distinct movement kind for restocking operations
 *   (separate from the original PURCHASE entry on product creation).
 */

import type { Knex } from 'knex';

const MOVEMENT_TYPES_BEFORE = [
  'PURCHASE', 'SALE', 'RETURN_TO_STOCK', 'RETURN_DAMAGED',
  'DAMAGE_WRITE_OFF', 'LOSS_WRITE_OFF', 'TRANSFER_OUT', 'TRANSFER_IN',
  'MANUAL_ADJUSTMENT', 'EXCHANGE', 'DEFECT_WRITE_OFF', 'SUPPLIER_RETURN',
];

const MOVEMENT_TYPES_AFTER = [...MOVEMENT_TYPES_BEFORE, 'RESTOCK'];

function list(values: string[]): string {
  return values.map((v) => `'${v}'`).join(', ');
}

async function replaceMovementCheck(knex: Knex, values: string[]): Promise<void> {
  await knex.raw(
    `ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`,
    ['inventory_movements', 'inventory_movements_movement_type_check']
  );
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (?? IN (${list(values)}))`,
    ['inventory_movements', 'inventory_movements_movement_type_check', 'movement_type']
  );
}

export async function up(knex: Knex): Promise<void> {
  // ── Step 1: Add RESTOCK to movement type check constraint ──────────────────
  await replaceMovementCheck(knex, MOVEMENT_TYPES_AFTER);

  // ── Step 2: restock_batches (depends on stores, users) ────────────────────
  await knex.schema.createTable('restock_batches', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.uuid('performed_by').notNullable().references('id').inTable('users');
    t.text('notes').nullable();
    t.integer('total_units').notNullable().defaultTo(0);
    t.integer('variant_count').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['store_id', 'created_at']);
  });

  // ── Step 3: backups (depends on stores, users) ─────────────────────────────
  await knex.schema.createTable('backups', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('filename', 512).notNullable();
    t.bigInteger('file_size_bytes').notNullable().defaultTo(0);
    t.uuid('created_by').notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['store_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('backups');
  await knex.schema.dropTableIfExists('restock_batches');

  // Remove RESTOCK from any rows before narrowing the constraint back
  await knex('inventory_movements')
    .where('movement_type', 'RESTOCK')
    .update({ movement_type: 'PURCHASE' });

  await replaceMovementCheck(knex, MOVEMENT_TYPES_BEFORE);
}
