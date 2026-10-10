'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { StaffList } from '@/modules/staff/components/StaffList';
import { StaffService } from '@/modules/staff/services/StaffService';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuth } from '@/shared/hooks/useAuth';
import { useStoreContext } from '@/context/StoreContext';
import { Button } from '@/shared/components/Button';
import type { StaffMember } from '@/modules/staff/types';

export default function StaffPage() {
  const { user } = useAuth();
  const { store } = useStoreContext();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const canCreate = usePermission('staff:create');

  const loadStaff = useCallback(async () => {
    if (!store?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError('');
    try {
      const list = await StaffService.listByStore(store.id);
      setStaff(list);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load staff.');
    } finally {
      setIsLoading(false);
    }
  }, [store?.id]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const handleDeactivate = async (id: string) => {
    if (!user?.id || !store?.id) return;
    const member = staff.find((s) => s.id === id);
    if (!window.confirm(`Deactivate ${member?.name ?? 'this staff member'}? They will be signed out and unable to log in until reactivated.`)) {
      return;
    }
    try {
      await StaffService.deactivate(id, user.id, store.id);
      await loadStaff();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not deactivate this staff member.');
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

  return (
    <PermissionGuard permissionKey="staff:view">
      <div className="page animate-fade-in-up">
        <div className="page-header">
          <div>
            <h1 className="page-title">Staff</h1>
            <p className="page-subtitle">
              Manage your team members and their access levels.
            </p>
          </div>
          {canCreate && (
            <Link href="/staff/new">
              <Button variant="primary" id="staff-add-btn">
                + Add Staff
              </Button>
            </Link>
          )}
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
          staff={staff}
          isLoading={isLoading}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
        />
      </div>
    </PermissionGuard>
  );
}
