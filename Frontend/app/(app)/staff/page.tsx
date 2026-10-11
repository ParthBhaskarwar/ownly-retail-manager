'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { StaffList } from '@/modules/staff/components/StaffList';
import { StaffService } from '@/modules/staff/services/StaffService';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { Modal } from '@/shared/components/Modal';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuth } from '@/shared/hooks/useAuth';
import { useStoreContext } from '@/context/StoreContext';
import type { StaffMember } from '@/modules/staff/types';

type StatusTab = 'ALL' | 'ACTIVE' | 'INACTIVE';

export default function StaffPage() {
  const { user } = useAuth();
  const { store } = useStoreContext();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<StatusTab>('ALL');
  const [toDeactivate, setToDeactivate] = useState<StaffMember | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const canCreate = usePermission('staff:create');

  const loadStaff = useCallback(async () => {
    if (!store?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError('');
    try {
      setStaff(await StaffService.listByStore(store.id));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load staff.');
    } finally {
      setIsLoading(false);
    }
  }, [store?.id]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const confirmDeactivate = async () => {
    if (!toDeactivate || !user?.id || !store?.id) return;
    setIsDeactivating(true);
    try {
      await StaffService.deactivate(toDeactivate.id, user.id, store.id);
      setToDeactivate(null);
      await loadStaff();
    } catch (err) {
      setToDeactivate(null);
      setLoadError(err instanceof Error ? err.message : 'Could not deactivate this staff member.');
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleReactivate = async (id: string) => {
    if (!user?.id || !store?.id) return;
    try {
      await StaffService.reactivate(id, user.id, store.id);
      await loadStaff();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not reactivate this staff member.');
    }
  };

  const counts = useMemo(() => ({
    total: staff.length,
    active: staff.filter((s) => s.isActive).length,
    inactive: staff.filter((s) => !s.isActive).length,
    roles: new Set(staff.map((s) => s.role)).size,
  }), [staff]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((s) => {
      if (tab === 'ACTIVE' && !s.isActive) return false;
      if (tab === 'INACTIVE' && s.isActive) return false;
      if (!q) return true;
      return [s.name, s.email, s.role].some((v) => v?.toLowerCase().includes(q));
    });
  }, [staff, query, tab]);

  return (
    <PermissionGuard permissionKey="staff:view">
      <div className="staff-page animate-fade-in-up">
        <div className="staff-page__head">
          <div>
            <h1 className="staff-page__title">Staff</h1>
            <p className="staff-page__subtitle">Manage your team and their access</p>
          </div>
          {canCreate && (
            <Link href="/staff/new" className="btn btn-primary" id="staff-add-btn">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Add Staff
            </Link>
          )}
        </div>

        <div className="staff-stats">
          <div className="staff-stat">
            <span className="staff-stat__label">Total team members</span>
            <span className="staff-stat__value">{counts.total}</span>
          </div>
          <div className="staff-stat">
            <span className="staff-stat__label">Active</span>
            <span className="staff-stat__value staff-stat__value--ok">{counts.active}</span>
          </div>
          <div className="staff-stat">
            <span className="staff-stat__label">Inactive</span>
            <span className="staff-stat__value">{counts.inactive}</span>
          </div>
          <div className="staff-stat">
            <span className="staff-stat__label">Roles in use</span>
            <span className="staff-stat__value">{counts.roles}</span>
          </div>
        </div>

        <div className="staff-toolbar">
          <label className="staff-search">
            <span className="material-symbols-outlined" aria-hidden="true">search</span>
            <input
              type="search"
              placeholder="Search staff name, email, or role…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search staff"
            />
          </label>
          <div className="staff-tabs" role="tablist" aria-label="Filter by status">
            {([
              ['ALL', `All (${counts.total})`],
              ['ACTIVE', `Active (${counts.active})`],
              ['INACTIVE', `Inactive (${counts.inactive})`],
            ] as Array<[StatusTab, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={`staff-tab ${tab === value ? 'staff-tab--active' : ''}`}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loadError && (
          <div className="alert alert--error" role="alert">
            {loadError}{' '}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadStaff()}>
              Retry
            </button>
          </div>
        )}

        <StaffList
          staff={visible}
          isLoading={isLoading}
          onDeactivate={(id) => setToDeactivate(staff.find((s) => s.id === id) ?? null)}
          onReactivate={handleReactivate}
        />

        <Modal
          isOpen={!!toDeactivate}
          onClose={() => !isDeactivating && setToDeactivate(null)}
          title="Deactivate staff member"
          size="sm"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setToDeactivate(null)} disabled={isDeactivating}>
                Cancel
              </button>
              <button type="button" id="confirm-deactivate-btn" className="btn btn-danger" onClick={() => void confirmDeactivate()} disabled={isDeactivating}>
                {isDeactivating ? 'Deactivating…' : 'Deactivate'}
              </button>
            </>
          }
        >
          <p className="staff-modal__text">
            Deactivate <strong>{toDeactivate?.name}</strong>? They will no longer be able to sign in to the POS or admin
            portal. Their past sales and audit history stay intact, and you can reactivate them any time.
          </p>
        </Modal>
      </div>
    </PermissionGuard>
  );
}
