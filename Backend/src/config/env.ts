/**
 * Environment configuration — all env reads are centralised here.
 * Components should import from this module, never process.env directly.
 *
 * dotenv.config() is called here so the .env file is loaded before any
 * process.env reads, regardless of the app entry point.
 */

import path from 'path';
import dotenv from 'dotenv';

// Resolve .env relative to the project root (two levels up from src/config/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
};

