'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BackupService, getBackupStatus } from '../services/BackupService';
import type { BackupHealth, BackupRecord, RestoreSummary } from '../types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupManager() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [browserQuota, setBrowserQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [list, h] = await Promise.all([BackupService.listBackups(), BackupService.getHealth()]);
      setBackups(list);
      setHealth(h);

      if (typeof window !== 'undefined' && navigator.storage?.estimate) {
        navigator.storage.estimate().then((est) => {
          setBrowserQuota({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
        }).catch(() => {});
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load backups.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const status = getBackupStatus(health?.latestBackupAt ?? null);

  const handleCreate = async () => {
    setIsCreating(true);
    setNotice(null);
    try {
      const record = await BackupService.createBackup();
      setNotice({ type: 'success', text: `Backup created (${formatBytes(record.fileSizeBytes)}).` });
      await refresh();
    } catch (err) {
      setNotice({ type: 'error', text: `Backup failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDownload = async (record: BackupRecord) => {
    setBusyId(record.id);
    setNotice(null);
    try {
      await BackupService.downloadBackup(record);
    } catch (err) {
      setNotice({ type: 'error', text: `Download failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    setBusyId(restoreTarget.id);
    setNotice(null);
    try {
      const summary = await BackupService.restoreBackup(restoreTarget.id);
      setRestoreSummary(summary);
      setRestoreTarget(null);
      setNotice({ type: 'success', text: 'Restore finished.' });
      await refresh();
    } catch (err) {
      setRestoreTarget(null);
      setNotice({ type: 'error', text: `Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setBusyId(null);
    }
  };

  const totalRestored = restoreSummary
    ? Object.values(restoreSummary.rowsInserted).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="backup-manager animate-fade-in">
      <div className="pe-page-header">
        <h1 className="page-title">Backup &amp; Restore</h1>
        <p className="page-subtitle">
          Create snapshots of your store data on the server, download a copy to keep safe, and recover missing records.
        </p>
      </div>

      {!isLoading && !loadError && status.backupDue && (
        <div className="alert alert--warning" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
            <div>
              <strong>Backup reminder:</strong> {status.message}
            </div>
            <button type="button" className="btn btn--primary btn--sm" onClick={handleCreate} disabled={isCreating}>
              {isCreating ? 'Creating…' : 'Back up now'}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div
          className={`alert ${notice.type === 'success' ? 'alert--success' : 'alert--error'}`}
          style={{ marginBottom: 'var(--space-4)' }}
          role="status"
        >
          {notice.text}
        </div>
      )}

      {restoreSummary && (
        <div className="alert alert--info" style={{ marginBottom: 'var(--space-4)' }}>
          <strong>Restore result:</strong> {totalRestored} missing record{totalRestored === 1 ? '' : 's'} put back
          {restoreSummary.tablesRestored.length > 0 && <> in {restoreSummary.tablesRestored.join(', ')}</>}.
          {restoreSummary.notes && <div style={{ marginTop: 4, fontSize: 'var(--text-xs)' }}>{restoreSummary.notes}</div>}
        </div>
      )}

      {loadError && (
        <div className="alert alert--error" style={{ marginBottom: 'var(--space-4)' }}>
          {loadError}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      <div
        className="dashboard-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <section className="card">
          <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card__title">Backup status</h2>
            <span
              className={`badge ${
                status.tier === 'HEALTHY' ? 'badge--paid' : status.tier === 'WARNING' ? 'badge--caution' : 'badge--return'
              }`}
            >
              {status.tier}
            </span>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)' }}>{status.message}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 'var(--text-xs)' }}>
            <div className="stat-pill">Backups: <strong>{health?.backupCount ?? 0}</strong></div>
            <div className="stat-pill">Total size: <strong>{formatBytes(health?.totalSizeBytes ?? 0)}</strong></div>
          </div>
          <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
            Last backup: {health?.latestBackupAt ? new Date(health.latestBackupAt).toLocaleString() : 'Never'}
          </div>
        </section>

        <section className="card">
          <div className="card__header">
            <h2 className="card__title">Create a backup</h2>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', marginBottom: 'var(--space-4)' }}>
            Saves products, variants, stock and barcodes, suppliers, customers, invoices, returns and audit history for
            your store.
          </p>
          <button
            type="button"
            id="export-backup-btn"
            className="btn btn--primary"
            style={{ width: '100%' }}
            onClick={handleCreate}
            disabled={isCreating}
          >
            {isCreating ? 'Creating backup…' : 'Create backup now'}
          </button>
        </section>
      </div>

      {/* Storage Health Widget — DEF-009 */}
      <section className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="card__title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)' }}>storage</span>
              Storage Health Overview
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', margin: '4px 0 0 0' }}>
              Live server disk usage, browser IndexedDB quota, and PostgreSQL table row counts.
            </p>
          </div>
          <Link href="/storage-health" className="btn btn--secondary btn--sm">
            View Storage Health Dashboard →
          </Link>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {/* 1. Disk Usage */}
          <div className="stat-pill" style={{ padding: '12px 14px' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', textTransform: 'uppercase' }}>
              Server Disk Usage
            </span>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'bold', color: 'var(--color-accent)', marginTop: 4 }}>
              {formatBytes(health?.totalSizeBytes ?? 0)}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', marginTop: 4 }}>
              {health?.backupCount ?? 0} backups · {health?.directoryExists ? 'Disk online' : 'Disk error'}
            </div>
          </div>

          {/* 2. IndexedDB Quota */}
          <div className="stat-pill" style={{ padding: '12px 14px' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', textTransform: 'uppercase' }}>
              IndexedDB &amp; Browser Quota
            </span>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'bold', color: 'var(--color-ink)', marginTop: 4 }}>
              {formatBytes(browserQuota?.usage ?? 0)}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', marginTop: 4 }}>
              of {formatBytes(browserQuota?.quota ?? 0)} quota ({browserQuota?.quota ? ((browserQuota.usage / browserQuota.quota) * 100).toFixed(1) : '0'}%)
            </div>
          </div>

          {/* 3. DB Row Counts */}
          <div className="stat-pill" style={{ padding: '12px 14px' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', textTransform: 'uppercase' }}>
              Store Database Records
            </span>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'bold', color: 'var(--color-ink)', marginTop: 4 }}>
              {(health?.database?.totalRecords ?? 0).toLocaleString()} rows
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', marginTop: 4 }}>
              Across {Object.keys(health?.database?.tableCounts || {}).length || 10} store tables
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h2 className="card__title">Backup history</h2>
        </div>

        {isLoading ? (
          <div className="skeleton" style={{ height: 80 }} />
        ) : backups.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>No backups yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Created</th>
                  <th style={{ textAlign: 'left' }}>File</th>
                  <th style={{ textAlign: 'right' }}>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td>{new Date(b.createdAt).toLocaleString()}</td>
                    <td style={{ fontSize: 'var(--text-xs)', wordBreak: 'break-all' }}>
                      {b.filename}
                      {!b.fileExists && <span className="badge badge--return" style={{ marginLeft: 8 }}>file missing</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatBytes(b.fileSizeBytes)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={!b.fileExists || busyId === b.id}
                        onClick={() => void handleDownload(b)}
                      >
                        Download
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={!b.fileExists || busyId === b.id}
                        onClick={() => setRestoreTarget(b)}
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Restore Confirmation Modal — DEF-007 Warning Dialog */}
      {restoreTarget && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal card animate-fade-in-up" style={{ maxWidth: 520, width: '90%', padding: 'var(--space-6)' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', marginTop: 0, color: 'var(--color-ink)' }}>
              Confirm Restore — Data Overwrite Warning
            </h2>
            <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-sm)' }}>
              Snapshot from <strong>{new Date(restoreTarget.createdAt).toLocaleString()}</strong> ({restoreTarget.filename}).
            </p>
            <div className="alert alert--warning" style={{ fontSize: 'var(--text-xs)', margin: 'var(--space-4) 0' }}>
              <strong>Caution:</strong> This will restore records from the selected backup file into your active store. <strong>This will overwrite current data. Proceed?</strong>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0 }}>
              Existing rows with identical IDs are skipped. Missing records across products, variants, inventory, and invoices will be restored.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 'var(--space-5)' }}>
              <button type="button" className="btn btn--secondary" onClick={() => setRestoreTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                id="confirm-restore-btn"
                className="btn btn--primary"
                onClick={() => void handleConfirmRestore()}
                disabled={busyId === restoreTarget.id}
              >
                {busyId === restoreTarget.id ? 'Restoring…' : 'Yes, Proceed with Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
