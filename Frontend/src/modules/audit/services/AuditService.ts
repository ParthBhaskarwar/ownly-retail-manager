/**
 * AuditService — client for /api/audit endpoints.
 */

import { apiClient } from '@/lib/apiClient';
import type { AuditFilters, AuditListResponse, AuditLogEntry } from '../types';

export const AuditService = {
  async listLogs(filters: AuditFilters = {}): Promise<AuditListResponse> {
    return apiClient.get<AuditListResponse>('/api/audit', {
      query: {
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
        action: filters.action || undefined,
        entityType: filters.entityType || undefined,
        userId: filters.userId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        search: filters.search || undefined,
      },
    });
  },

  async getActions(): Promise<string[]> {
    const { actions } = await apiClient.get<{ actions: string[] }>('/api/audit/actions');
    return actions;
  },

  exportToCsv(logs: AuditLogEntry[]): void {
    if (!logs.length) return;

    const headers = ['Timestamp', 'Action', 'User', 'Role', 'Entity Type', 'Entity ID', 'Metadata'];
    const rows = logs.map((log) => [
      `"${new Date(log.createdAt).toISOString()}"`,
      `"${log.action.replace(/"/g, '""')}"`,
      `"${(log.userName || log.userEmail || log.userId || 'System').replace(/"/g, '""')}"`,
      `"${(log.userRole || '').replace(/"/g, '""')}"`,
      `"${(log.entityType || '').replace(/"/g, '""')}"`,
      `"${(log.entityId || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(log.meta).replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};
