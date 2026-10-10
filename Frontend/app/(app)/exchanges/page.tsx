'use client';

import React from 'react';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { ExchangeWorkflow } from '@/modules/exchanges/components/ExchangeWorkflow';

export default function ExchangesPage() {
  return (
    <PermissionGuard permissionKey="exchanges:create">
    <div className="exchanges-page-container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Product Exchanges</h1>
        <p className="text-xs text-gray-500 mt-0.5">Exchange returned items with replacement products, calculate price differences, and settle additional payments or store credit</p>
      </div>

      <ExchangeWorkflow />
    </div>
    </PermissionGuard>
  );
}
