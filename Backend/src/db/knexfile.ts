/**
 * Knex configuration file — used by the Knex CLI for migrations and seeds.
 *
 * Shares pg-mapping with src/db/client.ts so the CLI and the running server
 * use identical identifier-case and type-parsing rules.
 *
 * Run:
 *   npm run db:migrate   →  knex migrate:latest --knexfile src/db/knexfile.ts
 *   npm run db:seed      →  knex seed:run --knexfile src/db/knexfile.ts
 */

import type { Knex } from 'knex';
import * as dotenv from 'dotenv';
import path from 'path';
import { wrapIdentifier, sslConfig } from './pg-mapping';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// NOTE: deliberately NO postProcessResponse here, unlike src/db/client.ts.
// Knex's migrator reads its own knex_migrations bookkeeping rows, and
// rewriting those keys (migration_time → migrationTime) can break it.
// Migrations and seeds name their columns explicitly, so they don't need
// snake→camel on the way out. wrapIdentifier is safe: it is a no-op on
// names that are already snake_case.
const shared: Knex.Config = {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig,
  },
  wrapIdentifier,
  migrations: {
    tableName: 'knex_migrations',
    directory: path.join(__dirname, 'migrations'),
    extension: 'ts',
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
    extension: 'ts',
  },
};

const config: { [key: string]: Knex.Config } = {
  development: {
    ...shared,
    pool: { min: 2, max: 10 },
  },

  production: {
    ...shared,
    pool: { min: 2, max: 20 },
  },
};

module.exports = config;
export default config;
