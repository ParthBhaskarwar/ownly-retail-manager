'use client';

import React from 'react';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { StoreSettingsForm } from '@/modules/store/components/StoreSettingsForm';

export default function SettingsPage() {
  return (
    <PermissionGuard permissionKey="settings:view" redirect>
      <StoreSettingsForm />
    </PermissionGuard>
  );
}
