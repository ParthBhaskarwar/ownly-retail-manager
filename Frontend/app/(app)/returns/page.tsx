'use client';

import React from 'react';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { ReturnWorkflow } from '@/modules/returns/components/ReturnWorkflow';

export default function ReturnsPage() {
  return (
    <PermissionGuard permissionKey="returns:create">
    <div className="returns-page-container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Returns & Refunds</h1>
        <p className="text-xs text-gray-500 mt-0.5">Lookup original invoices, select eligible return items, set condition, and issue refunds or store credit</p>
      </div>

      <ReturnWorkflow />
    </div>
    </PermissionGuard>
  );
}
