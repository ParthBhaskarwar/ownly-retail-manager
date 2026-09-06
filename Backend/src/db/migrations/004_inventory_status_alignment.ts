/**
 * Migration 004 — align inventory statuses with the approved feature catalogue.
 *
 * Plan §2.8 requires these item statuses:
 *   Available, Sold, Returned, Exchanged, Damaged, Defective, Missing,
 *   Supplier Return
 *
 * The original schema was missing EXCHANGED, DEFECTIVE and SUPPLIER_RETURN.
 * Acceptance is judged against the catalogue's list, so they are added here,
 * along with the movement types that produce them.
 *
 * Knex's t.enu() creates a varchar + CHECK constraint rather than a native
 * Postgres enum type, so widening the allowed set means dropping and
 * recreating the constraint. Existing rows are unaffected — this only ever
 * permits more values, never fewer.
 */

import type { Knex } from 'knex';

const ITEM_STATUSES_BEFORE = [
  'IN_STOCK', 'RESERVED', 'SOLD', 'RETURNED_TO_STOCK',
  'RETURNED_DAMAGED', 'DAMAGED', 'LOST', 'TRANSFERRED_OUT',
];

const ITEM_STATUSES_AFTER = [
  ...ITEM_STATUSES_BEFORE,
  'EXCHANGED',        // §2.8 "Exchanged"
  'DEFECTIVE',        // §2.8 "Defective"  (distinct from physically damaged)
  'SUPPLIER_RETURN',  // §2.8 "Supplier Return"
];

const MOVEMENT_TYPES_BEFORE = [
  'PURCHASE', 'SALE', 'RETURN_TO_STOCK', 'RETURN_DAMAGED',
  'DAMAGE_WRITE_OFF', 'LOSS_WRITE_OFF', 'TRANSFER_OUT', 'TRANSFER_IN',
  'MANUAL_ADJUSTMENT',
];

const MOVEMENT_TYPES_AFTER = [
  ...MOVEMENT_TYPES_BEFORE,
  'EXCHANGE',
  'DEFECT_WRITE_OFF',
  'SUPPLIER_RETURN',
];

function list(values: string[]): string {
  return values.map((v) => `'${v}'`).join(', ');
}

/**
 * Knex names enum check constraints `<table>_<column>_check`. Dropping with
 * IF EXISTS keeps this migration safe on a database where the constraint was
 * created under a different name or already removed.
 */
async function replaceCheck(
  knex: Knex,
  table: string,
  column: string,
  values: string[]
): Promise<void> {
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, `${table}_${column}_check`]);
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (?? IN (${list(values)}))`,
    [table, `${table}_${column}_check`, column]
  );
}

export async function up(knex: Knex): Promise<void> {
  await replaceCheck(knex, 'inventory_items', 'status', ITEM_STATUSES_AFTER);
  await replaceCheck(knex, 'inventory_movements', 'movement_type', MOVEMENT_TYPES_AFTER);
}

export async function down(knex: Knex): Promise<void> {
  // Narrowing would fail if any row already uses a newly added value, so
  // clear those first — they only exist because of this migration.
  await knex('inventory_items')
    .whereIn('status', ['EXCHANGED', 'DEFECTIVE', 'SUPPLIER_RETURN'])
    .update({ status: 'IN_STOCK' });
  await knex('inventory_movements')
    .whereIn('movement_type', ['EXCHANGE', 'DEFECT_WRITE_OFF', 'SUPPLIER_RETURN'])
    .update({ movement_type: 'MANUAL_ADJUSTMENT' });

  await replaceCheck(knex, 'inventory_items', 'status', ITEM_STATUSES_BEFORE);
  await replaceCheck(knex, 'inventory_movements', 'movement_type', MOVEMENT_TYPES_BEFORE);
}
