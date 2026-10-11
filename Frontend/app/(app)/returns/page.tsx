'use client';

import React from 'react';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { ReturnWorkflow } from '@/modules/returns/components/ReturnWorkflow';

export default function ReturnsPage() {
  return (
    <PermissionGuard permissionKey="returns:create">
    <div className="returns-page-container page-stack space-y-6">
      <div className="page-header">
        <h1 className="page-title">Returns & Refunds</h1>
        <p className="page-subtitle">Lookup original invoices, select eligible return items, set condition, and issue refunds or store credit</p>
      </div>

      <ReturnWorkflow />
    </div>
    </PermissionGuard>
  );
}
