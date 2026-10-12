/**
 * AppError — an error carrying an HTTP status.
 *
 * Services throw these for expected, user-facing failure cases ("SKU already
 * exists", "invalid credentials"). The global error handler in app.ts turns
 * them into a JSON response with the right status and the message intact, so
 * the frontend's existing `catch (err) { setError(err.message) }` blocks keep
 * showing meaningful text.
 *
 * Anything that is NOT an AppError is treated as an unexpected bug: logged
 * server-side and returned as a generic 500 without leaking internals.
 */

export class AppError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string): AppError {
    return new AppError(400, message);
  }

  static unauthorized(message = 'Unauthenticated'): AppError {
    return new AppError(401, message);
  }

  static forbidden(message = 'Insufficient permissions'): AppError {
    return new AppError(403, message);
  }

  static notFound(message: string): AppError {
    return new AppError(404, message);
  }

  /** Business-rule violation, e.g. a duplicate SKU or barcode. */
  static conflict(message: string): AppError {
    return new AppError(409, message);
  }
}

/**
 * Reads a single route param as a string.
 *
 * Express 5 types params as `string | string[]` because wildcard segments can
 * repeat. None of our routes use wildcards, so an array here means a
 * malformed request rather than something to try to interpret.
 */
export function param(
  params: Record<string, string | string[] | undefined>,
  name: string
): string {
  const value = params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw AppError.badRequest(`Missing or invalid "${name}" in the request path.`);
  }
  return value;
}

/** Reads a single query-string value as a string, or undefined when absent. */
export function queryParam(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Postgres cannot store a NUL byte in text, and a stray one turns into a 500.
  const clean = value.split('\u0000').join('');
  return clean.length > 0 ? clean : undefined;
}

/** Positive integer from a query/body value, clamped to [min, max]; falls back when absent or not a number. */
export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** A real calendar date in YYYY-MM-DD form, or throws a 400. */
export function dateParam(value: unknown, name: string): string | undefined {
  const s = queryParam(value);
  if (s === undefined) return undefined;
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
    && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  if (!ok) throw AppError.badRequest(`"${name}" must be a valid date in YYYY-MM-DD format.`);
  return s;
}
