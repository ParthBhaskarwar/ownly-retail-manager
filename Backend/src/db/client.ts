/**
 * PostgreSQL connection pool.
 * Uses Knex as the query builder — raw SQL or Knex query builder both work.
 *
 * Usage:
 *   import { db } from '@/db/client';
 *   const users = await db('users').where({ id }).first();
 */

import knex from 'knex';
import { config } from '@/config/env';

export const db = knex({
  client: 'pg',
  connection: config.databaseUrl,
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: './migrations',
  },
  seeds: {
    directory: './seeds',
  },
  // Log queries in dev mode
  debug: config.isDev,
});

// Verify connection on startup
db.raw('SELECT 1')
  .then(() => console.log('✅ PostgreSQL connected'))
  .catch((err: Error) => {
    console.error('❌ PostgreSQL connection failed:', err.message);
    process.exit(1);
  });
