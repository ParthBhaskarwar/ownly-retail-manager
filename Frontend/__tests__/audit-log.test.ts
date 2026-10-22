import { AuditService } from '../src/modules/audit/services/AuditService';
import type { AuditLogEntry } from '../src/modules/audit/types';

describe('AuditService (D14 Frontend)', () => {
  const sampleLogs: AuditLogEntry[] = [
    {
      id: 'log-1',
      storeId: 'store-1',
      userId: 'user-1',
      userName: 'John Owner',
      userEmail: 'owner@test.com',
      userRole: 'OWNER',
      action: 'product.price_change',
      entityType: 'product',
      entityId: 'prod-123',
      meta: { oldPrice: 500, newPrice: 650 },
      createdAt: '2026-10-22T10:00:00Z',
    },
    {
      id: 'log-2',
      storeId: 'store-1',
      userId: 'user-2',
      userName: 'Alice Cashier',
      userEmail: 'cashier@test.com',
      userRole: 'CASHIER',
      action: 'backup.create',
      entityType: 'backup',
      entityId: 'bkp-456',
      meta: { filename: 'backup.json' },
      createdAt: '2026-10-22T11:00:00Z',
    },
  ];

  it('exports logs to CSV without throwing', () => {
    // Mock URL and document methods
    const createObjectURL = jest.fn(() => 'blob:mock');
    const revokeObjectURL = jest.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    expect(() => {
      AuditService.exportToCsv(sampleLogs);
    }).not.toThrow();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('handles empty log list gracefully in CSV export', () => {
    const createObjectURL = jest.fn();
    window.URL.createObjectURL = createObjectURL;

    AuditService.exportToCsv([]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
