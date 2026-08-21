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
  const canCreate = usePermission('staff:create');

  const loadStaff = useCallback(async () => {
    if (!store?.id) return;
    setIsLoading(true);
    try {
      const list = await StaffService.listByStore(store.id);
      setStaff(list);
    } finally {
      setIsLoading(false);
    }
  }, [store?.id]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const handleDeactivate = async (id: string) => {
    if (!user?.id || !store?.id) return;
    await StaffService.deactivate(id, user.id, store.id);
    await loadStaff();
  };

  const handleReactivate = async (id: string) => {
    if (!user?.id || !store?.id) return;
    await StaffService.reactivate(id, user.id, store.id);
    await loadStaff();
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
