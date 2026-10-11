'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { StaffForm } from '@/modules/staff/components/StaffForm';
import { StaffService } from '@/modules/staff/services/StaffService';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { useAuth } from '@/shared/hooks/useAuth';
import { useStoreContext } from '@/context/StoreContext';
import type { CreateStaffInput } from '@/modules/staff/types';

export default function NewStaffPage() {
  const { user } = useAuth();
  const { store, isLoading: isStoreLoading } = useStoreContext();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const handleCreate = async (input: CreateStaffInput) => {
    if (!user?.id) return;
    setIsLoading(true);
    setServerError('');
    try {
      await StaffService.create(input, user.id);
      router.push('/staff');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to create staff member.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!store?.id) {
    if (isStoreLoading) {
      return (
        <div className="page">
          <div className="skeleton" style={{ height: 40, width: 300, marginBottom: 24 }} />
          <div className="skeleton" style={{ height: 400 }} />
        </div>
      );
    }
    return (
      <div className="page-content">
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">▦</span>
          <h3 className="empty-state__title">No store found</h3>
          <p className="empty-state__desc">Finish setting up your store before adding staff.</p>
          <Link href="/onboarding/store-setup" className="btn btn-secondary">Set Up Store</Link>
        </div>
      </div>
    );
  }

  return (
    <PermissionGuard permissionKey="staff:create">
      <div className="page animate-fade-in-up">
        <div className="page-header">
          <div>
            <Link href="/staff" className="page-back-link" id="new-staff-back-link">
              ← Back to Staff
            </Link>
            <h1 className="page-title">Add Staff Member</h1>
            <p className="page-subtitle">Create a new account for a team member.</p>
          </div>
        </div>

        <div className="page-form-card card">
          <StaffForm
            mode="create"
            storeId={store.id}
            onSubmit={handleCreate}
            isLoading={isLoading}
            serverError={serverError}
          />
        </div>
      </div>
    </PermissionGuard>
  );
}
