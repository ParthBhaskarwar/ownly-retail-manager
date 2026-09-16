/**
 * AuditService — client-side audit event logger & reader.
 *
 * Records user actions with timestamp, store context, and metadata.
 * Safe to call from any frontend service or component.
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
  // Keep last 500 events to prevent unbounded localStorage growth
  const trimmed = events.slice(-500);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

let _counter = 0;

export const AuditService = {
  /**
   * Log an audit event.
   * @param action  Short string key, e.g. "backup.export", "inventory.restock"
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

    if (process.env.NODE_ENV === 'development') {
      console.info('[Audit]', event.action, { userId, storeId, ...meta });
    }

    const existing = readLog();
    writeLog([...existing, event]);
  },

  /**
   * Retrieve all logged audit events.
   */
  getAll(): AuditEvent[] {
    return readLog();
  },

  /**
   * Get audit events filtered by store ID.
   */
  getByStore(storeId: string): AuditEvent[] {
    return readLog().filter((e) => e.storeId === storeId);
  },

  /**
   * Clear the local audit log (testing/dev utility).
   */
  clear(): void {
    writeLog([]);
  },
};
