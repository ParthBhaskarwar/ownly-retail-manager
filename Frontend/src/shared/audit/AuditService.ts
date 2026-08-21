/**
 * AuditService — stub implementation.
 *
 * Records actions with user + timestamp for later audit log UI (future week).
 * All modules call this service; the full audit UI + persistence comes later.
 * This stub logs to console and to an in-memory/localStorage queue.
 */

export interface AuditEvent {
  id: string;
  action: string;
  userId: string | null;
  storeId: string | null;
  meta: Record<string, unknown>;
  timestamp: string;
}

const STORAGE_KEY = 'ownly:audit_log';

function readLog(): AuditEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as AuditEvent[];
  } catch {
    return [];
  }
}

function writeLog(events: AuditEvent[]): void {
  if (typeof window === 'undefined') return;
  // Keep last 500 events to avoid unbounded growth
  const trimmed = events.slice(-500);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

let _counter = 0;

export const AuditService = {
  /**
   * Log an audit event. Safe to call from any service.
   * @param action  Short string key, e.g. "auth.signup", "staff.deactivate"
   * @param userId  ID of the user performing the action (or null if unauthenticated)
   * @param storeId Store context (or null)
   * @param meta    Any additional structured data
   */
  log(
    action: string,
    userId: string | null,
    storeId: string | null = null,
    meta: Record<string, unknown> = {}
  ): void {
    const event: AuditEvent = {
      id: `audit_${Date.now()}_${++_counter}`,
      action,
      userId,
      storeId,
      meta,
      timestamp: new Date().toISOString(),
    };

    // In development, log to console for visibility
    if (process.env.NODE_ENV === 'development') {
      console.info('[Audit]', event.action, { userId, storeId, ...meta });
    }

    const existing = readLog();
    writeLog([...existing, event]);
  },

  /**
   * Retrieve the audit log (for future audit log UI).
   */
  getAll(): AuditEvent[] {
    return readLog();
  },

  /**
   * Get audit events for a specific store.
   */
  getByStore(storeId: string): AuditEvent[] {
    return readLog().filter((e) => e.storeId === storeId);
  },

  /**
   * Clear the local audit log (dev/test utility).
   */
  clear(): void {
    writeLog([]);
  },
};
