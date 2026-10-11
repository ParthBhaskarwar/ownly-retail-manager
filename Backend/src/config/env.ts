/**
 * Environment configuration — all env reads are centralised here.
 */

import path from 'path';
import dotenv from 'dotenv';

// Resolve .env relative to project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function getEnv(key: string, fallback: string): string {
  const value = process.env[key];
  if (!value) return fallback;
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  databaseUrl: getEnv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/ownly_dev'),
  jwtSecret: getEnv('JWT_SECRET', 'ownly-dev-jwt-secret-key-12345'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
  /** Directory where backup JSON files are stored. Created automatically if absent. */
  backupDir: getEnv('BACKUP_DIR', path.resolve(__dirname, '../../backups')),
  /** Offline photo-AI (CLIP embeddings + pgvector). Manual entry never depends on it. */
  embeddings: {
    enabled: (process.env.EMBEDDINGS_ENABLED ?? 'true') !== 'false',
    /** Where the CLIP model files are cached after the first download. */
    modelCacheDir: getEnv('EMBEDDING_MODEL_DIR', path.resolve(__dirname, '../../models')),
    /** true = never touch the network; the model must already be in modelCacheDir. */
    offline: (process.env.EMBEDDING_OFFLINE ?? 'false') === 'true',
    /** Cosine similarity at/above which a photo is flagged as a possible duplicate. Calibrate on real photos. */
    duplicateThreshold: parseFloat(process.env.EMBEDDING_DUPLICATE_THRESHOLD ?? '0.92'),
    /** Minimum cosine similarity to list a product as "similar". Calibrate on real photos. */
    similarThreshold: parseFloat(process.env.EMBEDDING_SIMILAR_THRESHOLD ?? '0.80'),
  },
};
