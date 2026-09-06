/**
 * Migration 003 — users.verification_code.
 *
 * The previous client-side auth kept the 6-digit signup code in the browser's
 * sessionStorage, which is not available once verification happens on the
 * server. The code is stored on the user row and cleared on successful
 * verification.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.string('verification_code', 6).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('verification_code');
  });
}
