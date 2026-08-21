'use client';

import React from 'react';
import Link from 'next/link';
import type { StaffMember } from '@/modules/staff/types';
import { RoleBadge, StatusBadge } from '@/shared/components/Badge';
import { Button } from '@/shared/components/Button';
import type { Role } from '@/modules/account/types';
import { usePermission } from '@/shared/hooks/usePermission';

interface StaffListProps {
  staff: StaffMember[];
  isLoading?: boolean;
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
}

export function StaffList({ staff, isLoading, onDeactivate, onReactivate }: StaffListProps) {
  const canEdit = usePermission('staff:edit');
  const canDeactivate = usePermission('staff:deactivate');

  if (isLoading) {
    return (
      <div className="staff-table-skeleton">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 56, marginBottom: 8, borderRadius: 8 }} />
        ))}
      </div>
    );
  }

  if (staff.length === 0) {
    return (
      <div className="staff-empty animate-fade-in-up">
        <div className="staff-empty__icon">👥</div>
        <h3 className="staff-empty__title">No staff members yet</h3>
        <p className="staff-empty__desc">Add your first team member to get started.</p>
        {canEdit && (
          <Link href="/staff/new">
            <Button variant="primary" id="staff-empty-add-btn">Add Staff Member</Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="staff-table-wrapper animate-fade-in">
      <table className="staff-table" id="staff-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            {(canEdit || canDeactivate) && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <tr key={member.id} className="staff-table__row">
              <td>
                <div className="staff-table__name-cell">
                  <div className="staff-table__avatar">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{member.name}</span>
                </div>
              </td>
              <td className="staff-table__email">{member.email}</td>
              <td><RoleBadge role={member.role as Role} /></td>
              <td><StatusBadge isActive={member.isActive} /></td>
              <td className="staff-table__muted">
                {member.lastLoginAt
                  ? new Date(member.lastLoginAt).toLocaleDateString()
                  : 'Never'}
              </td>
              {(canEdit || canDeactivate) && (
                <td>
                  <div className="staff-table__actions">
                    {canEdit && member.role !== 'OWNER' && (
                      <Link href={`/staff/${member.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          id={`staff-edit-${member.id}`}
                        >
                          Edit
                        </Button>
                      </Link>
                    )}
                    {canDeactivate && member.role !== 'OWNER' && (
                      member.isActive ? (
                        <Button
                          variant="danger"
                          size="sm"
                          id={`staff-deactivate-${member.id}`}
                          onClick={() => onDeactivate(member.id)}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          id={`staff-reactivate-${member.id}`}
                          onClick={() => onReactivate(member.id)}
                        >
                          Reactivate
                        </Button>
                      )
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
