'use client';

import React from 'react';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { BackupManager } from '@/modules/backup/components/BackupManager';

export default function BackupPage() {
  return (
    <PermissionGuard permissionKey="settings:edit">
      <div className="page-content">
        <BackupManager />
      </div>
    </PermissionGuard>
  );
}
