/**
 * StorageHealthService — provides server storage, DB metrics, and client IndexedDB/storage quota.
 */

import { apiClient } from '@/lib/apiClient';
import type { BrowserStorageEstimate, StorageHealthData } from '../types';

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const StorageHealthService = {
  async getServerStorageHealth(): Promise<StorageHealthData> {
    const { health } = await apiClient.get<{ health: StorageHealthData }>('/api/backup/health');
    return health;
  },

  async getBrowserStorageEstimate(): Promise<BrowserStorageEstimate> {
    if (typeof window === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return {
        usageBytes: 0,
        quotaBytes: 0,
        usagePercentage: 0,
        persisted: false,
        indexedDbSupported: typeof window !== 'undefined' && 'indexedDB' in window,
      };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      const usagePercentage = quota > 0 ? (usage / quota) * 100 : 0;
      let persisted = false;

      if (navigator.storage.persisted) {
        persisted = await navigator.storage.persisted();
      }

      return {
        usageBytes: usage,
        quotaBytes: quota,
        usagePercentage,
        persisted,
        indexedDbSupported: 'indexedDB' in window,
      };
    } catch {
      return {
        usageBytes: 0,
        quotaBytes: 0,
        usagePercentage: 0,
        persisted: false,
        indexedDbSupported: true,
      };
    }
  },

  async clearBrowserCache(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
      }
      return true;
    } catch {
      return false;
    }
  },
};
