'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useStoreContext } from '@/context/StoreContext';
import { StoreService } from '@/modules/store/services/StoreService';
import { OnboardingChecklist } from '@/modules/store/components/OnboardingChecklist';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import type { OnboardingStep } from '@/modules/store/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const { store } = useStoreContext();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const showChecklist = !store?.setupCompleted;

  useEffect(() => {
    if (!user) return;
    const s = StoreService.getOnboardingSteps(user.id, store, user);
    setSteps(s);
  }, [user, store]);

  return (
    <PermissionGuard permissionKey="dashboard:view">
      <div className="dashboard animate-fade-in-up">
        {/* Welcome header */}
        <div className="dashboard__welcome">
          <h1 className="dashboard__greeting">
            Welcome back, <span className="gradient-text">{user?.name?.split(' ')[0]}</span> 👋
          </h1>
          {store && (
            <p className="dashboard__store-name">{store.name}</p>
          )}
        </div>

        {/* Onboarding checklist (shown until setup is complete) */}
        {showChecklist && steps.length > 0 && (
          <div className="dashboard__onboarding">
            <OnboardingChecklist steps={steps} />
          </div>
        )}

        {/* Quick-stat cards (stubbed — data comes in future week) */}
        {store?.setupCompleted && (
          <div className="dashboard-stats stagger-children">
            {[
              { label: "Today's Sales", value: '₹0', icon: '💰', id: 'stat-sales' },
              { label: 'Orders Today', value: '0', icon: '📦', id: 'stat-orders' },
              { label: 'Low Stock Items', value: '0', icon: '⚠️', id: 'stat-lowstock' },
              { label: 'Active Staff', value: '0', icon: '👥', id: 'stat-staff' },
            ].map((stat) => (
              <div key={stat.id} id={stat.id} className="stat-card card animate-fade-in-up">
                <div className="stat-card__icon">{stat.icon}</div>
                <div className="stat-card__value">{stat.value}</div>
                <div className="stat-card__label">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
