/**
 * Centralized environment configuration.
 * ALL process.env reads happen here — components never access process.env directly.
 */

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export const AppConfig = {
  /** Application metadata */
  app: {
    name: optionalEnv('NEXT_PUBLIC_APP_NAME', 'Ownly'),
    version: optionalEnv('NEXT_PUBLIC_APP_VERSION', '0.1.0'),
    env: optionalEnv('NODE_ENV', 'development'),
  },

  /** API base URL — swap to real backend when ready */
  api: {
    baseUrl: optionalEnv('NEXT_PUBLIC_API_BASE_URL', ''),
    timeout: parseInt(optionalEnv('NEXT_PUBLIC_API_TIMEOUT_MS', '10000'), 10),
  },

  /** Auth settings */
  auth: {
    sessionDurationMs: parseInt(
      optionalEnv('NEXT_PUBLIC_SESSION_DURATION_MS', String(7 * 24 * 60 * 60 * 1000)),
      10
    ), // 7 days default
    bcryptRounds: parseInt(optionalEnv('BCRYPT_ROUNDS', '10'), 10),
  },

  /** Feature flags */
  features: {
    pwaEnabled: optionalEnv('NEXT_PUBLIC_PWA_ENABLED', 'true') === 'true',
    debugMode: optionalEnv('NEXT_PUBLIC_DEBUG_MODE', 'false') === 'true',
  },
} as const;

export type AppConfigType = typeof AppConfig;
