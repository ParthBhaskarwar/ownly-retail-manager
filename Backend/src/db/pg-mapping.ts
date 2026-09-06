/**
 * Shared Postgres/Knex data-fidelity configuration.
 *
 * Imported by BOTH src/db/client.ts (runtime) and src/db/knexfile.ts (CLI
 * migrations/seeds) so both speak exactly the same dialect. Two problems are
 * solved here, once, rather than by hand-mapping in every repository:
 *
 * 1. Type parsing. node-postgres returns NUMERIC/DECIMAL as *strings* to avoid
 *    float precision loss ('1800.00', not 1800). Every price in this app is a
 *    `number` in TypeScript and is used in arithmetic (margins, profit,
 *    stock valuation), so a string would silently corrupt every calculation.
 *    Money here is rupees with 2 decimals — far inside IEEE-754 safe range —
 *    so parseFloat is correct and safe.
 *    DATE is returned as a plain 'YYYY-MM-DD' string rather than a JS Date,
 *    matching the ISO-string convention used throughout the domain types.
 *
 * 2. Identifier case. The schema is snake_case (store_id); the domain types
 *    are camelCase (storeId). wrapIdentifier converts on the way in,
 *    postProcessResponse converts on the way out.
 */

import { types as pgTypes } from 'pg';

// ─── Type parsers ─────────────────────────────────────────────────────────────

const PG_NUMERIC_OID = 1700;
const PG_DATE_OID = 1082;
const PG_INT8_OID = 20;

pgTypes.setTypeParser(PG_NUMERIC_OID, (value: string) => (value === null ? null : parseFloat(value)));
pgTypes.setTypeParser(PG_DATE_OID, (value: string) => value); // keep 'YYYY-MM-DD'
// COUNT(*) comes back as int8 → string by default; every count in this app is
// small enough for a JS number.
pgTypes.setTypeParser(PG_INT8_OID, (value: string) => (value === null ? null : parseInt(value, 10)));

// ─── Identifier case conversion ───────────────────────────────────────────────

export function camelToSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function snakeToCamel(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/**
 * Recursively converts result keys snake_case → camelCase.
 *
 * Date instances are converted to ISO strings (the domain types model all
 * timestamps as ISO strings). Plain objects are walked; arrays are mapped.
 * jsonb columns arrive as already-parsed JS values — their *contents* are
 * user data, not identifiers, so they are returned untouched.
 */
function convertKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(convertKeys);
  if (typeof value !== 'object') return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[snakeToCamel(key)] = convertKeys(val);
  }
  return out;
}

export function postProcessResponse(result: unknown): unknown {
  return convertKeys(result);
}

export function wrapIdentifier(value: string, origImpl: (v: string) => string): string {
  // '*' must pass through untouched.
  return origImpl(value === '*' ? value : camelToSnake(value));
}

// ─── Shared connection settings ───────────────────────────────────────────────

/** Neon (and any hosted Postgres) requires TLS. */
export const sslConfig = { rejectUnauthorized: false } as const;
