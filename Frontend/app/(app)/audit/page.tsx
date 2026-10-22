'use client';

import React from 'react';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { AuditLogViewer } from '@/modules/audit/components/AuditLogViewer';

export default function AuditLogPage() {
  return (
    <PermissionGuard permissionKey="audit:view">
      <div className="page-content">
        <AuditLogViewer />
      </div>
    </PermissionGuard>
  );
}
