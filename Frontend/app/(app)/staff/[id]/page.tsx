'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { StaffForm } from '@/modules/staff/components/StaffForm';
import { SessionList } from '@/modules/staff/components/SessionList';
import { StaffService } from '@/modules/staff/services/StaffService';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { useAuth } from '@/shared/hooks/useAuth';
import { useStoreContext } from '@/context/StoreContext';
import type { StaffMember, UpdateStaffInput } from '@/modules/staff/types';
import type { Session } from '@/modules/account/types';

export default function EditStaffPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { store } = useStoreContext();
  const router = useRouter();
  const [member, setMember] = useState<StaffMember | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    Promise.all([
      StaffService.getById(id),
      StaffService.getActiveSessions(id),
    ]).then(([m, s]) => {
      if (!m) { router.replace('/staff'); return; }
      setMember(m);
      setSessions(s);
      setLoadingData(false);
    });
  }, [id, router]);

  const handleUpdate = async (staffId: string, updates: UpdateStaffInput) => {
    if (!user?.id || !store?.id) return;
    setIsLoading(true);
    setServerError('');
    try {
      await StaffService.update(staffId, updates, user.id, store.id);
      router.push('/staff');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to update staff member.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 40, width: 300, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  if (!member) return null;

  return (
    <PermissionGuard permissionKey="staff:edit">
      <div className="page animate-fade-in-up">
        <div className="page-header">
          <div>
            <Link href="/staff" className="page-back-link" id="edit-staff-back-link">
              ← Back to Staff
            </Link>
            <h1 className="page-title">Edit {member.name}</h1>
            <p className="page-subtitle">Update role and contact details.</p>
          </div>
        </div>

        <div className="page-form-card card">
          <StaffForm
            mode="edit"
            staffMember={member}
            onSubmit={handleUpdate}
            isLoading={isLoading}
            serverError={serverError}
          />
        </div>

        {sessions.length > 0 && (
          <div className="card" style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 16, fontSize: 'var(--text-lg)' }}>Active Sessions</h2>
            <SessionList
              sessions={sessions}
              currentSessionId={user?.id}
            />
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
