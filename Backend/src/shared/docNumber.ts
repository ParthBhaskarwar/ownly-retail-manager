/**
 * Sequential per-store document numbers (INV-20260928-0007, RET-…, EX-…).
 *
 * A bare COUNT(*)+1 races: two simultaneous checkouts read the same count and
 * the second hits the unique (store_id, number) constraint. Taking a
 * transaction-scoped advisory lock per (table, store) serialises number
 * allocation without blocking anything else, and the exists-check below makes
 * the result safe even if older rows were numbered differently.
 */

import type { Knex } from 'knex';

export type DocTable = 'invoices' | 'returns' | 'exchanges' | 'credit_notes';

const NUMBER_COLUMN: Record<DocTable, string> = {
  invoices: 'invoice_number',
  returns: 'return_number',
  exchanges: 'exchange_number',
  credit_notes: 'credit_note_number',
};

export async function nextDocNumber(
  trx: Knex.Transaction,
  table: DocTable,
  prefix: string,
  storeId: string
): Promise<string> {
  await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`${table}:${storeId}`]);

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const column = NUMBER_COLUMN[table];
  const countRow = (await trx(table).where('store_id', storeId).count('* as n').first()) as
    | { n: string | number }
    | undefined;

  let seq = Number(countRow?.n ?? 0) + 1;
  for (;;) {
    const candidate = `${prefix}-${dateStr}-${String(seq).padStart(4, '0')}`;
    const clash = await trx(table).where('store_id', storeId).andWhere(column, candidate).first('id');
    if (!clash) return candidate;
    seq++;
  }
}
