/**
 * load-synthetic — imports the datagen synthetic store into PostgreSQL.
 *
 *   npm run data:load-synthetic                 # load, shifting dates to end today
 *   npm run data:load-synthetic -- --replace    # delete the synthetic store first
 *   npm run data:load-synthetic -- --no-shift   # keep the generator's original dates
 *   npm run data:load-synthetic -- --dir ../datagen/out/db
 *
 * The AI scoring (Week 7) learns only from a store's own sales history, and no
 * real store has any yet. This loads datagen's 36-month "Vastra Bazaar" store
 * as a separate store so the AI features have something honest to work on.
 * Real stores are never read or modified.
 *
 * Three things the CSVs cannot do on their own:
 *
 *  1. Global IDs. categories / subcategories / attribute_definitions are
 *     global rows created by seeds/001_clothing_template.ts with random UUIDs,
 *     so datagen's IDs for them never match. Those tables are skipped and every
 *     reference to them is remapped by name.
 *  2. Dates. The generator's window ends on a fixed day. Every date/timestamp
 *     is shifted by the same whole number of days so the history ends today;
 *     otherwise "last 30 days" is empty and every forecast says "no demand".
 *  3. Login. The CSV password hashes are deliberately invalid. The owner's
 *     password is set from SYNTHETIC_OWNER_PASSWORD (Backend/.env) if present.
 */

import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcryptjs';
import type { Knex } from 'knex';
import { db } from '@/db/client';

// Mirrors LOAD_ORDER in datagen/tables.py.
const LOAD_ORDER = [
  'users', 'stores', 'suppliers', 'categories', 'subcategories',
  'attribute_definitions', 'products', 'product_attribute_values',
  'product_variants', 'variant_attribute_values', 'inventory_items',
  'inventory_movements', 'customers', 'invoices', 'invoice_items', 'payments',
  'returns', 'return_items', 'credit_notes', 'exchanges',
];

/** Global template tables: already present from the seed, remapped by name. */
const GLOBAL_TABLES = new Set(['categories', 'subcategories', 'attribute_definitions']);

const TEMPLATE_ID = 'tpl_clothing';
const MAX_BIND_PARAMS = 60_000;

type Row = Record<string, string | null>;

// ─── CSV ──────────────────────────────────────────────────────────────────────

/** RFC 4180 parser: quoted fields, "" escapes, newlines inside quotes. */
function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field); field = '';
      records.push(record); record = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) { record.push(field); records.push(record); }

  const [header, ...body] = records.filter((r) => !(r.length === 1 && r[0] === ''));
  return body.map((r) => {
    const row: Row = {};
    header.forEach((col, idx) => { row[col] = r[idx] === '' || r[idx] === undefined ? null : r[idx]; });
    return row;
  });
}

function readTable(dir: string, table: string): Row[] {
  const file = path.join(dir, `${table}.csv`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run: python -m datagen --profile standard --seed 42`);
  return parseCsv(fs.readFileSync(file, 'utf8'));
}

// ─── Date shifting ────────────────────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(.*)$/;

/** Adds whole days to 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS...' keeping its shape. */
function shiftDate(value: string, days: number): string {
  const m = DATE_RE.exec(value);
  if (!m) return value;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return ymd + m[4];
}

function daysBetween(fromYmd: string, to: Date): number {
  const [y, m, d] = fromYmd.split('-').map(Number);
  const from = Date.UTC(y, m - 1, d);
  const today = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((today - from) / 86_400_000);
}

async function dateColumns(): Promise<Map<string, Set<string>>> {
  const result = await db.raw(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('date', 'timestamp with time zone', 'timestamp without time zone')`
  );
  const map = new Map<string, Set<string>>();
  for (const r of result.rows as Array<{ table_name: string; column_name: string }>) {
    if (!map.has(r.table_name)) map.set(r.table_name, new Set());
    map.get(r.table_name)!.add(r.column_name);
  }
  return map;
}

// ─── Global ID remapping ──────────────────────────────────────────────────────

interface IdMaps {
  category: Map<string, string>;
  subcategory: Map<string, string>;
  attribute: Map<string, string>;
}

async function buildIdMaps(dir: string, trx: Knex.Transaction): Promise<IdMaps> {
  const csvCats = readTable(dir, 'categories');
  const csvSubs = readTable(dir, 'subcategories');
  const csvAttrs = readTable(dir, 'attribute_definitions');

  // Raw SQL keeps snake_case keys regardless of pg-mapping.
  const dbCats = (await trx.raw(
    `SELECT id, name FROM categories WHERE store_id IS NULL AND retail_template_id = ?`, [TEMPLATE_ID]
  )).rows as Array<{ id: string; name: string }>;
  const dbSubs = (await trx.raw(
    `SELECT s.id, s.name, c.name AS category_name FROM subcategories s
       JOIN categories c ON c.id = s.category_id
      WHERE s.store_id IS NULL AND c.retail_template_id = ?`, [TEMPLATE_ID]
  )).rows as Array<{ id: string; name: string; category_name: string }>;
  const dbAttrs = (await trx.raw(
    `SELECT id, name FROM attribute_definitions WHERE retail_template_id = ?`, [TEMPLATE_ID]
  )).rows as Array<{ id: string; name: string }>;

  const catByName = new Map(dbCats.map((c) => [c.name, c.id]));
  const subByKey = new Map(dbSubs.map((s) => [`${s.category_name}/${s.name}`, s.id]));
  const attrByName = new Map(dbAttrs.map((a) => [a.name, a.id]));
  const csvCatName = new Map(csvCats.map((c) => [c.id!, c.name!]));

  const missing: string[] = [];
  const pick = (m: Map<string, string>, key: string) => {
    const id = m.get(key);
    if (!id) missing.push(key);
    return id ?? '';
  };

  const maps: IdMaps = {
    category: new Map(csvCats.map((c) => [c.id!, pick(catByName, c.name!)])),
    subcategory: new Map(csvSubs.map((s) => [s.id!, pick(subByKey, `${csvCatName.get(s.category_id!)}/${s.name}`)])),
    attribute: new Map(csvAttrs.map((a) => [a.id!, pick(attrByName, a.name!)])),
  };

  if (missing.length) {
    throw new Error(
      `The clothing template seed is missing ${missing.length} rows the synthetic data needs ` +
      `(e.g. ${missing.slice(0, 5).join(', ')}). Run: npm run db:seed`
    );
  }
  return maps;
}

function remap(table: string, row: Row, maps: IdMaps): void {
  const swap = (col: string, m: Map<string, string>) => {
    const v = row[col];
    if (v) {
      const mapped = m.get(v);
      if (!mapped) throw new Error(`${table}.${col}: no mapping for ${v}`);
      row[col] = mapped;
    }
  };
  if (table === 'products') { swap('category_id', maps.category); swap('subcategory_id', maps.subcategory); }
  if (table === 'product_attribute_values' || table === 'variant_attribute_values') {
    swap('attribute_definition_id', maps.attribute);
  }
}

// ─── Replace ──────────────────────────────────────────────────────────────────

/**
 * Deletes everything belonging to one store. Order matters: several links
 * (returns → invoices, invoice_items → inventory_items, stores → users) are
 * RESTRICT, so dependants go first and cascades handle the rest.
 */
async function deleteStore(trx: Knex.Transaction, storeId: string): Promise<void> {
  const userIds = ((await trx.raw(`SELECT id FROM users WHERE store_id = ?`, [storeId])).rows as Array<{ id: string }>)
    .map((u) => u.id);
  const owner = (await trx.raw(`SELECT owner_id FROM stores WHERE id = ?`, [storeId])).rows[0] as { owner_id: string } | undefined;
  if (owner && !userIds.includes(owner.owner_id)) userIds.push(owner.owner_id);

  for (const table of ['exchanges', 'credit_notes', 'returns', 'invoices', 'customers', 'products',
    'restock_batches', 'backups', 'suppliers']) {
    await trx.raw(`DELETE FROM ?? WHERE store_id = ?`, [table, storeId]);
  }
  await trx.raw(`DELETE FROM stores WHERE id = ?`, [storeId]);
  if (userIds.length) await trx('users').whereIn('id', userIds).delete();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dirArg = args.indexOf('--dir');
  const dir = path.resolve(dirArg >= 0 ? args[dirArg + 1] : path.join(__dirname, '../../../datagen/out/db'));
  const replace = args.includes('--replace');
  const shift = !args.includes('--no-shift');

  const manifestPath = path.join(dir, '..', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    store_id: string; profile: { name: string; end: string };
  };
  const storeId = manifest.store_id;
  const shiftDays = shift ? daysBetween(manifest.profile.end, new Date()) : 0;

  console.log(`Synthetic store ${storeId} (profile ${manifest.profile.name}) from ${dir}`);
  console.log(shift ? `Shifting all dates by +${shiftDays} days so history ends today.` : 'Keeping original dates.');

  const dates = await dateColumns();
  const started = Date.now();

  await db.transaction(async (trx) => {
    const existing = (await trx.raw(`SELECT 1 FROM stores WHERE id = ?`, [storeId])).rows.length > 0;
    if (existing && !replace) {
      throw new Error('The synthetic store is already loaded. Re-run with --replace to reload it.');
    }
    if (existing) {
      console.log('Deleting the existing synthetic store…');
      await deleteStore(trx, storeId);
    }

    const maps = await buildIdMaps(dir, trx);
    let userIds: string[] = [];

    for (const table of LOAD_ORDER) {
      if (GLOBAL_TABLES.has(table)) continue;
      const rows = readTable(dir, table);
      const shiftCols = dates.get(table) ?? new Set<string>();

      for (const row of rows) {
        remap(table, row, maps);
        if (shiftDays) {
          for (const col of shiftCols) {
            const v = row[col];
            if (v) row[col] = shiftDate(v, shiftDays);
          }
        }
      }

      // users.store_id → stores and stores.owner_id → users form a cycle:
      // insert users without a store, then attach them once the store exists.
      if (table === 'users') {
        userIds = rows.map((r) => r.id!);
        for (const r of rows) r.store_id = null;
      }

      await insertRows(trx, table, rows);

      if (table === 'stores') {
        await trx('users').whereIn('id', userIds).update({ store_id: storeId });
      }
      console.log(`  ${table.padEnd(26)} ${rows.length.toLocaleString().padStart(8)} rows`);
    }

    const password = process.env.SYNTHETIC_OWNER_PASSWORD;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await trx.raw(
        `UPDATE users SET password_hash = ? WHERE id = (SELECT owner_id FROM stores WHERE id = ?)`,
        [hash, storeId]
      );
    }
  });

  const owner = (await db.raw(
    `SELECT u.email FROM users u JOIN stores s ON s.owner_id = u.id WHERE s.id = ?`, [storeId]
  )).rows[0] as { email: string };

  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  console.log(`Owner login: ${owner.email} — password from SYNTHETIC_OWNER_PASSWORD` +
    (process.env.SYNTHETIC_OWNER_PASSWORD ? '.' : ' (NOT SET: login disabled until you set it and re-run with --replace).'));
}

async function insertRows(trx: Knex.Transaction, table: string, rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const chunk = Math.max(1, Math.floor(MAX_BIND_PARAMS / Object.keys(rows[0]).length));
  for (let i = 0; i < rows.length; i += chunk) {
    await trx(table).insert(rows.slice(i, i + chunk));
  }
}

main()
  .catch((err) => {
    console.error('Load failed — nothing was written:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
