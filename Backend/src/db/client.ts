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
    // Send TCP keep-alives so a hosted database (Neon) does not silently drop
    // connections that sit idle in the pool.
    keepAlive: true,
  },
  pool: {
    // min 0 + a short idle timeout: connections are retired by us before the server
    // kills them. With min 2, an idle pooled connection could be dead by the next
    // request, which failed with "Connection terminated unexpectedly" (a 500).
    min: 0,
    max: 10,
    idleTimeoutMillis: 10_000,
    reapIntervalMillis: 2_000,
    acquireTimeoutMillis: 30_000,
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
