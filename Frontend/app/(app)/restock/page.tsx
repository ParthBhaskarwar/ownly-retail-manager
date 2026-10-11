'use client';

import React, { Suspense } from 'react';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { RestockForm } from '@/modules/restock/components/RestockForm';

export default function RestockPage() {
  return (
    <PermissionGuard permissionKey="inventory:edit">
      <div className="page-content">
        <Suspense fallback={<div className="skeleton" style={{ height: 200 }} />}>
          <RestockForm />
        </Suspense>
      </div>
    </PermissionGuard>
  );
}
