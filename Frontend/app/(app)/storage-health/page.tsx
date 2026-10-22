'use client';

import React from 'react';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { StorageHealthDashboard } from '@/modules/storage/components/StorageHealthDashboard';

export default function StorageHealthPage() {
  return (
    <PermissionGuard permissionKey="settings:view">
      <div className="page-content">
        <StorageHealthDashboard />
      </div>
    </PermissionGuard>
  );
}
