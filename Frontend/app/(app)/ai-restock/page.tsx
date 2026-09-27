'use client';

import React, { Suspense } from 'react';
import { AuthGuard, PermissionGuard } from '@/shared/components/PermissionGuard';
import { AiRestockAdvisor } from '@/modules/ai/components/AiRestockAdvisor';

export default function AiRestockPage() {
  return (
    <AuthGuard>
      <PermissionGuard permissionKey="inventory:edit">
        <div className="page-content space-y-6">
          <div className="page-header">
            <div>
              <h1 className="page-title">AI-Assisted Restock</h1>
              <p className="page-subtitle">
                Get a buy quantity, size mix and written reasons before you order — then accept, adjust or reject it.
              </p>
            </div>
          </div>
          <Suspense fallback={<div className="skeleton" style={{ height: 320 }} />}>
            <AiRestockAdvisor />
          </Suspense>
        </div>
      </PermissionGuard>
    </AuthGuard>
  );
}
