/**
 * Audit log types — mirrors backend /api/audit.
 */

export interface AuditLogEntry {
  id: string;
  storeId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface AuditFilters {
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AuditListResponse {
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}
