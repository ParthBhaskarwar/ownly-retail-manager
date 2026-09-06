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
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
