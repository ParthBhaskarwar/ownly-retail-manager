import { formatBytes, StorageHealthService } from '../src/modules/storage/services/StorageHealthService';

describe('StorageHealthService & formatBytes (D14)', () => {
  describe('formatBytes', () => {
    it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(-10)).toBe('0 B');
    });

    it('formats bytes below 1 KB', () => {
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('formats kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(2048)).toBe('2.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('formats megabytes correctly', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
      expect(formatBytes(5 * 1024 * 1024 + 512 * 1024)).toBe('5.50 MB');
    });

    it('formats gigabytes correctly', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
    });
  });

  describe('getBrowserStorageEstimate', () => {
    it('returns structured storage estimate object even when storage API is missing or mocked', async () => {
      const estimate = await StorageHealthService.getBrowserStorageEstimate();
      expect(estimate).toHaveProperty('usageBytes');
      expect(estimate).toHaveProperty('quotaBytes');
      expect(estimate).toHaveProperty('usagePercentage');
      expect(estimate).toHaveProperty('persisted');
      expect(typeof estimate.usagePercentage).toBe('number');
    });
  });
});
