/**
 * PostgreSQL connection pool.
 * Uses Knex as the query builder.
 */

import knex from 'knex';
import { config } from '../config/env';

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
  debug: config.isDev && process.env.NODE_ENV !== 'test',
});

// Verify connection on startup
if (process.env.NODE_ENV !== 'test') {
  db.raw('SELECT 1')
    .then(() => console.log('✅ PostgreSQL connected'))
    .catch((err: Error) => {
      console.warn('⚠️ PostgreSQL connection warning:', err.message);
    });
}
