'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { OnboardingChecklist } from '@/modules/store/components/OnboardingChecklist';
import { StoreService } from '@/modules/store/services/StoreService';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { useAuth } from '@/shared/hooks/useAuth';
import { Button } from '@/shared/components/Button';
import type { OnboardingStep } from '@/modules/store/types';
import type { Store } from '@/modules/store/types';

export default function OnboardingCompletePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    StoreService.getByOwnerId(user.id).then(async (s) => {
      setStore(s);
      try {
        const onboarding = await StoreService.fetchOnboardingState();
        const onboardingSteps = StoreService.getOnboardingSteps(user.id, s, user, onboarding.staffAdded);
        setSteps(onboardingSteps);
      } catch {
        const onboardingSteps = StoreService.getOnboardingSteps(user.id, s, user);
        setSteps(onboardingSteps);
      }
    });
  }, [user]);

  const handleFinish = async () => {
    if (!store) return;
    setIsLoading(true);
    try {
      await StoreService.markSetupComplete(store.id, user!.id);
      router.push('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthGuard>
      <div className="onboarding-page onboarding-page--complete animate-fade-in-up">
        <div className="onboarding-page__header">
          <h1 className="onboarding-page__title gradient-text">Almost there!</h1>
          <p className="onboarding-page__subtitle">
            Complete the steps below to finish setting up your store.
          </p>
        </div>

        {steps.length > 0 && <OnboardingChecklist steps={steps} />}

        <div className="onboarding-complete__actions">
          <Link href="/staff/new">
            <Button variant="secondary" id="onboarding-add-staff-btn">
              👥 Add Staff Member
            </Button>
          </Link>
          <Button
            variant="primary"
            size="lg"
            id="onboarding-go-dashboard-btn"
            isLoading={isLoading}
            onClick={handleFinish}
          >
            Go to Dashboard →
          </Button>
        </div>
      </div>
    </AuthGuard>
  );
}
