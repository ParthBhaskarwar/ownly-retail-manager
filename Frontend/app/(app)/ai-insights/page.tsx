'use client';

import React from 'react';
import { AuthGuard, PermissionGuard } from '@/shared/components/PermissionGuard';
import { AiInsightsDashboard } from '@/modules/ai/components/AiInsightsDashboard';

export default function AiInsightsPage() {
  return (
    <AuthGuard>
      <PermissionGuard permissionKey="reports:view">
        <div className="page-content space-y-6">
          <div className="page-header">
            <div>
              <h1 className="page-title">AI Insights &amp; Accuracy</h1>
              <p className="page-subtitle">How well the AI&apos;s predictions matched what actually sold, and every prediction it has made.</p>
            </div>
          </div>
          <AiInsightsDashboard />
        </div>
      </PermissionGuard>
    </AuthGuard>
  );
}
