'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { BackupService } from '../services/BackupService';
import type { FullBackupPayload, RestoreValidationResult, StorageHealthStatus } from '../types';

export function BackupManager() {
  const { user } = useAuthContext();
  const { store } = useStoreContext();
  const storeId = user?.storeId || store?.id || '';
  const storeName = store?.name || 'My Store';

  const [health, setHealth] = useState<StorageHealthStatus | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);

  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePayload, setRestorePayload] = useState<FullBackupPayload | null>(null);
  const [validationResult, setValidationResult] = useState<RestoreValidationResult | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshHealth = async () => {
    setIsLoadingHealth(true);
    try {
      const data = await BackupService.getStorageHealth(storeId);
      setHealth(data);
    } catch (e) {
      console.error('Failed to get storage health', e);
    } finally {
      setIsLoadingHealth(false);
    }
  };

  useEffect(() => {
    void refreshHealth();
  }, [storeId]);

  const handleExportBackup = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    try {
      const payload = await BackupService.createFullBackup(storeId, storeName);
      BackupService.downloadBackupFile(payload);
      setExportSuccess(true);
      await refreshHealth();
      setTimeout(() => setExportSuccess(false), 5000);
    } catch (err) {
      alert(`Backup failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreFile(file);
    setRestoreStatus(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const validation = BackupService.validateBackup(content);
      setValidationResult(validation);

      if (validation.isValid) {
        try {
          const payload = JSON.parse(content) as FullBackupPayload;
          setRestorePayload(payload);
          setShowPreviewModal(true);
        } catch {
          setRestorePayload(null);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!restorePayload) return;
    setIsRestoring(true);
    try {
      await BackupService.restoreBackup(restorePayload, user?.id);
      setRestoreStatus('Database successfully restored from backup! Refreshing...');
      setShowPreviewModal(false);
      setRestoreFile(null);
      setRestorePayload(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refreshHealth();
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      alert(`Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleGenerateSampleData = async () => {
    if (!confirm('This will populate sample products, categories, suppliers, and inventory stock to test the system. Continue?')) {
      return;
    }
    setIsGeneratingDemo(true);
    setDemoMessage(null);
    try {
      const { db } = await import('@/db/db');
      const { v4: uuidv4 } = await import('uuid');
      if (!db) return;

      const now = new Date().toISOString();
      const past30d = new Date(Date.now() - 25 * 86400000).toISOString();
      const past70d = new Date(Date.now() - 75 * 86400000).toISOString();

      const supplierId = uuidv4();
      await db.suppliers.put({
        id: supplierId,
        storeId,
        name: 'Vogue Mills Mumbai',
        code: 'VOGUE',
        address: 'Lower Parel, Mumbai',
        paymentTerms: 'Net 30',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      const sampleProds = [
        { name: 'Slim Fit Oxford Shirt', sku: 'OXFSHIRT', sp: 1890, cp: 850, cat: 'Shirts' },
        { name: 'Selvedge Denim Jeans', sku: 'SELVDENIM', sp: 2990, cp: 1400, cat: 'Jeans' },
        { name: 'Linen Summer Kurta', sku: 'LINNKURTA', sp: 1590, cp: 690, cat: 'Kurtas' },
        { name: 'Casual Pique Polo', sku: 'PIQPOLO', sp: 990, cp: 420, cat: 'T-Shirts' },
      ];

      for (const p of sampleProds) {
        const prodId = uuidv4();
        const catId = uuidv4();
        await db.categories.put({
          id: catId,
          storeId,
          retailTemplateId: 'template_clothing',
          name: p.cat,
          isSystem: false,
          isActive: true,
          sortOrder: 0,
          createdAt: now,
        });

        await db.products.put({
          id: prodId,
          storeId,
          retailTemplateId: 'template_clothing',
          categoryId: catId,
          subcategoryId: null,
          supplierId,
          name: p.name,
          baseSku: p.sku,
          description: `Premium quality ${p.name.toLowerCase()}`,
          baseSellingPrice: p.sp,
          baseCostPrice: p.cp,
          status: 'ACTIVE',
          imageUrls: [],
          createdBy: user?.id || 'admin',
          updatedBy: user?.id || 'admin',
          createdAt: now,
          updatedAt: now,
        });

        const sizes = ['S', 'M', 'L', 'XL'];
        for (let i = 0; i < sizes.length; i++) {
          const sz = sizes[i];
          const varId = uuidv4();
          const varSku = `${p.sku}-${sz}`;
          await db.productVariants.put({
            id: varId,
            productId: prodId,
            sku: varSku,
            displayName: `${p.name} — ${sz}`,
            sellingPriceOverride: null,
            costPriceOverride: null,
            sortOrder: i,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });

          const qty = i === 3 ? 2 : 6;
          const pDate = i % 2 === 0 ? past70d : past30d;

          const items: import('@/modules/inventory/types').InventoryItem[] = [];
          const movs: import('@/modules/inventory/types').InventoryMovement[] = [];

          for (let q = 1; q <= qty; q++) {
            const itemId = uuidv4();
            const bc = `OWN-${varSku.replace(/[^A-Z0-9]/gi, '').slice(0, 8)}-${String(q).padStart(5, '0')}`;
            const isSold = q === 1;

            items.push({
              id: itemId,
              storeId,
              variantId: varId,
              barcode: bc,
              purchaseCostPrice: p.cp,
              purchaseDate: pDate,
              status: isSold ? 'SOLD' : 'IN_STOCK',
              createdAt: pDate,
              createdBy: user?.id || 'admin',
              updatedAt: now,
            });

            movs.push({
              id: uuidv4(),
              storeId,
              inventoryItemId: itemId,
              movementType: isSold ? 'SALE' : 'PURCHASE',
              fromStatus: 'IN_STOCK',
              toStatus: isSold ? 'SOLD' : 'IN_STOCK',
              referenceType: isSold ? 'INVOICE' : 'PURCHASE_ENTRY',
              referenceId: uuidv4(),
              performedBy: user?.id || 'admin',
              performedAt: isSold ? now : pDate,
              notes: isSold ? 'Customer checkout' : 'Initial stock receipt',
            });
          }

          await db.inventoryItems.bulkPut(items);
          await db.inventoryMovements.bulkPut(movs);
        }
      }

      setDemoMessage('Sample dataset successfully generated! Products, inventory, and sales are now ready to explore.');
      await refreshHealth();
    } catch (e) {
      alert(`Demo generation failed: ${e instanceof Error ? e.message : 'Error'}`);
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  return (
    <div className="backup-manager animate-fade-in">
      <div className="pe-page-header">
        <h1 className="page-title">Backup, Restore &amp; Data Safety</h1>
        <p className="page-subtitle">
          Export full offline backups, restore previous snapshots, monitor local storage health, and safeguard store data without cloud dependencies.
        </p>
      </div>

      {health?.backupDue && (
        <div className="alert alert--warning" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              <strong>⚠️ Backup Reminder:</strong>{' '}
              {health.lastBackupDate
                ? `Last backup was created ${health.daysSinceLastBackup} days ago. It is recommended to keep weekly backups.`
                : 'No backup has been created for this store yet. Create a backup now to protect your data.'}
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleExportBackup}
              disabled={isExporting}
            >
              {isExporting ? 'Exporting...' : 'Export Backup Now'}
            </button>
          </div>
        </div>
      )}

      {exportSuccess && (
        <div className="alert alert--success" style={{ marginBottom: 'var(--space-4)' }}>
          ✓ Backup file successfully generated and downloaded to your computer!
        </div>
      )}

      {restoreStatus && (
        <div className="alert alert--success" style={{ marginBottom: 'var(--space-4)' }}>
          {restoreStatus}
        </div>
      )}

      {demoMessage && (
        <div className="alert alert--info" style={{ marginBottom: 'var(--space-4)' }}>
          ✓ {demoMessage}
        </div>
      )}

      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <section className="card">
          <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card__title">💾 Local Storage Health</h2>
            <span className={`badge ${health?.healthTier === 'HEALTHY' ? 'badge--paid' : health?.healthTier === 'WARNING' ? 'badge--caution' : 'badge--return'}`}>
              {health?.healthTier || 'HEALTHY'}
            </span>
          </div>

          <div style={{ padding: 'var(--space-2) 0' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', margin: '0 0 var(--space-3)' }}>
              {health?.statusMessage || 'Local IndexedDB storage is operational.'}
            </p>

            {health?.isSupported && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>
                  <span>Used: {((health.usageBytes || 0) / (1024 * 1024)).toFixed(2)} MB</span>
                  <span>Quota: {((health.quotaBytes || 0) / (1024 * 1024 * 1024)).toFixed(1)} GB</span>
                </div>
                <div style={{ height: '8px', background: 'var(--color-paper)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(2, Math.min(100, health.percentUsed))}%`,
                      background: health.healthTier === 'HEALTHY' ? 'var(--color-paid)' : 'var(--color-caution)',
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: 'var(--text-xs)' }}>
              <div className="stat-pill">Products: <strong>{health?.tableCounts?.products ?? 0}</strong></div>
              <div className="stat-pill">Variants: <strong>{health?.tableCounts?.variants ?? 0}</strong></div>
              <div className="stat-pill">Inventory Items: <strong>{health?.tableCounts?.inventoryItems ?? 0}</strong></div>
              <div className="stat-pill">Movements: <strong>{health?.tableCounts?.movements ?? 0}</strong></div>
              <div className="stat-pill">Categories: <strong>{health?.tableCounts?.categories ?? 0}</strong></div>
              <div className="stat-pill">Suppliers: <strong>{health?.tableCounts?.suppliers ?? 0}</strong></div>
            </div>

            <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              Last Backup: {health?.lastBackupDate ? new Date(health.lastBackupDate).toLocaleString() : 'Never'}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card__header">
            <h2 className="card__title">📦 Full Database Export</h2>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', marginBottom: 'var(--space-4)' }}>
            Downloads an encrypted, self-contained JSON snapshot containing all products, variants, physical items, barcodes, suppliers, movements, staff, and audit history.
          </p>

          <button
            type="button"
            id="export-backup-btn"
            className="btn btn--primary"
            style={{ width: '100%' }}
            onClick={handleExportBackup}
            disabled={isExporting}
          >
            {isExporting ? 'Creating Backup Snapshot...' : '⬇ Export Full Backup (.json)'}
          </button>
        </section>

        <section className="card">
          <div className="card__header">
            <h2 className="card__title">🔄 Restore from Backup</h2>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', marginBottom: 'var(--space-4)' }}>
            Upload a verified `.json` backup file to restore your store catalog, physical stock, and barcodes.
          </p>

          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            id="select-restore-file-btn"
            className="btn btn--secondary"
            style={{ width: '100%' }}
            onClick={() => fileInputRef.current?.click()}
          >
            📂 Select Backup File to Restore
          </button>

          {validationResult && !validationResult.isValid && (
            <div className="alert alert--error" style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
              <strong>Validation Failed:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: '16px' }}>
                {validationResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card__header">
            <h2 className="card__title">🧪 Testing &amp; Sample Data</h2>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', marginBottom: 'var(--space-4)' }}>
            Generate realistic clothing inventory (Oxford shirts, denim jeans, kurtas, polos) with sales history to evaluate reports and test backup/restore correctness.
          </p>

          <button
            type="button"
            id="generate-sample-data-btn"
            className="btn btn--ghost"
            style={{ width: '100%' }}
            onClick={handleGenerateSampleData}
            disabled={isGeneratingDemo}
          >
            {isGeneratingDemo ? 'Generating Sample Data...' : '⚡ Generate Sample Clothing Store Data'}
          </button>
        </section>
      </div>

      {showPreviewModal && restorePayload && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal card animate-fade-in-up" style={{ maxWidth: 540, width: '90%', padding: 'var(--space-6)' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', marginTop: 0 }}>
              Confirm Database Restore
            </h2>
            <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-sm)' }}>
              You are about to restore data from backup snapshot created on{' '}
              <strong>{new Date(restorePayload.metadata.timestamp).toLocaleString()}</strong>.
            </p>

            <div className="card" style={{ background: 'var(--color-paper)', padding: 'var(--space-3)', margin: 'var(--space-4) 0' }}>
              <div style={{ fontSize: 'var(--text-xs)', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <div>Store: <strong>{restorePayload.metadata.storeName}</strong></div>
                <div>Version: <strong>{restorePayload.metadata.version}</strong></div>
                <div>Products: <strong>{restorePayload.metadata.recordCounts.products}</strong></div>
                <div>Variants: <strong>{restorePayload.metadata.recordCounts.variants}</strong></div>
                <div>Physical Items: <strong>{restorePayload.metadata.recordCounts.inventoryItems}</strong></div>
                <div>Movements: <strong>{restorePayload.metadata.recordCounts.inventoryMovements}</strong></div>
                <div>Categories: <strong>{restorePayload.metadata.recordCounts.categories}</strong></div>
                <div>Suppliers: <strong>{restorePayload.metadata.recordCounts.suppliers}</strong></div>
              </div>
            </div>

            <div className="alert alert--warning" style={{ fontSize: 'var(--text-xs)', margin: 'var(--space-3) 0' }}>
              ⚠️ Restoring will replace current local database items with this backup snapshot.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: 'var(--space-4)' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setShowPreviewModal(false);
                  setRestoreFile(null);
                  setRestorePayload(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-restore-btn"
                className="btn btn--primary"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
              >
                {isRestoring ? 'Restoring Database...' : 'Confirm & Restore Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
