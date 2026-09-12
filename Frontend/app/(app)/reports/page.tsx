'use client';

import React from 'react';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { ReportViewer } from '@/modules/reports/components/ReportViewer';

export default function ReportsPage() {
  return (
    <AuthGuard>
      <div className="page-content">
        <ReportViewer />
      </div>
    </AuthGuard>
  );
}
