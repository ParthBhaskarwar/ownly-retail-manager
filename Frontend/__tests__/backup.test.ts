import { BackupService } from '../src/modules/backup/services/BackupService';

describe('BackupService & Data Protection', () => {
  it('validates a well-formed backup payload', () => {
    const validJson = JSON.stringify({
      metadata: {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        storeId: 'store_123',
        storeName: 'Test Clothing Boutique',
        generator: 'Ownly Backup Engine',
        checksum: 'a1b2c3d4',
        recordCounts: {
          products: 2,
          variants: 6,
          inventoryItems: 12,
          inventoryMovements: 12,
          categories: 2,
          subcategories: 0,
          suppliers: 1,
          attributeDefinitions: 4,
          productAttributeValues: 2,
          variantAttributeValues: 6,
        },
      },
      dexie: {
        products: [{ id: 'p1', name: 'Cotton Shirt' }],
        productVariants: [{ id: 'v1', sku: 'SHIRT-M' }],
        inventoryItems: [{ id: 'i1', barcode: 'OWN-SHIRT-00001' }],
        inventoryMovements: [],
        categories: [],
        subcategories: [],
        suppliers: [],
        attributeDefinitions: [],
        productAttributeValues: [],
        variantAttributeValues: [],
      },
      localStorage: {},
    });

    const result = BackupService.validateBackup(validJson);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.metadata?.storeName).toBe('Test Clothing Boutique');
  });

  it('rejects an invalid or malformed JSON backup string', () => {
    const invalidJson = '{ "metadata": "incomplete...';
    const result = BackupService.validateBackup(invalidJson);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a backup payload missing mandatory dexie tables', () => {
    const missingDexieJson = JSON.stringify({
      metadata: {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      },
      dexie: null,
    });

    const result = BackupService.validateBackup(missingDexieJson);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Missing database tables section (dexie).');
  });

  it('calculates storage health with fallback defaults', async () => {
    const health = await BackupService.getStorageHealth('store_123');
    expect(health).toHaveProperty('healthTier');
    expect(health).toHaveProperty('tableCounts');
    expect(['HEALTHY', 'WARNING', 'CRITICAL']).toContain(health.healthTier);
  });
});
