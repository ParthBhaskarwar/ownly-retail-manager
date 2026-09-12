'use client';

import React from 'react';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { BackupManager } from '@/modules/backup/components/BackupManager';

export default function BackupPage() {
  return (
    <AuthGuard>
      <div className="page-content">
        <BackupManager />
      </div>
    </AuthGuard>
  );
}
