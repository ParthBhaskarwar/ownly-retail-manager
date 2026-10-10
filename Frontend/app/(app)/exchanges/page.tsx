'use client';

import React from 'react';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { ExchangeWorkflow } from '@/modules/exchanges/components/ExchangeWorkflow';

export default function ExchangesPage() {
  return (
    <PermissionGuard permissionKey="exchanges:create">
    <div className="exchanges-page-container page-stack space-y-6">
      <div className="page-header">
        <h1 className="page-title">Product Exchanges</h1>
        <p className="page-subtitle">Exchange returned items with replacement products, calculate price differences, and settle additional payments or store credit</p>
      </div>

      <ExchangeWorkflow />
    </div>
    </PermissionGuard>
  );
}
