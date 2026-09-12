'use client';

import React, { Suspense } from 'react';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { RestockForm } from '@/modules/restock/components/RestockForm';

export default function RestockPage() {
  return (
    <AuthGuard>
      <div className="page-content">
        <Suspense fallback={<div className="skeleton" style={{ height: 200 }} />}>
          <RestockForm />
        </Suspense>
      </div>
    </AuthGuard>
  );
}
