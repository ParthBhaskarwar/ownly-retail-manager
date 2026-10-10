'use client';

import React from 'react';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { ReportViewer } from '@/modules/reports/components/ReportViewer';

export default function ReportsPage() {
  return (
    <PermissionGuard permissionKey="reports:view">
      <div className="page-content">
        <ReportViewer />
      </div>
    </PermissionGuard>
  );
}
