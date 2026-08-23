/**
 * PostgreSQL connection pool.
 * Uses Knex as the query builder — raw SQL or Knex query builder both work.
 *
 * Identifier case conversion and type parsing are configured in ./pg-mapping,
 * shared with knexfile.ts so migrations, seeds and runtime behave identically.
 * Repositories therefore speak camelCase and never hand-map column names.
 *
 * Usage:
 *   import { db } from '@/db/client';
 *   const user = await db('users').where({ id }).first();
 */

import knex from 'knex';
import { config } from '@/config/env';
import { postProcessResponse, wrapIdentifier, sslConfig } from './pg-mapping';

export const db = knex({
  client: 'pg',
  connection: {
    connectionString: config.databaseUrl,
    ssl: sslConfig,
  },
  pool: {
    min: 2,
    max: 10,
  },
  postProcessResponse,
  wrapIdentifier,
  // Log queries in dev mode
  debug: false,
});

/**
 * Verifies connectivity. Called explicitly from app.ts on startup rather than
 * at import time, so that importing this module (e.g. from a script or test)
 * never has the side effect of killing the process.
 */
export async function assertDbConnection(): Promise<void> {
  await db.raw('SELECT 1');
}
