'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StoreSetupForm } from '@/modules/store/components/StoreSetupForm';
import { StoreService } from '@/modules/store/services/StoreService';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { useAuth } from '@/shared/hooks/useAuth';
import type { CreateStoreInput } from '@/modules/store/types';

export default function StoreSetupPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [retailType, setRetailType] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    const type = sessionStorage.getItem('ownly:selected_retail_type');
    if (!type) {
      router.replace('/onboarding/retail-type');
      return;
    }
    setRetailType(type);
  }, [router]);

  const handleSubmit = async (input: CreateStoreInput) => {
    setIsLoading(true);
    setServerError('');
    try {
      const store = await StoreService.create(input);
      StoreService.markOnboardingStep(user!.id, 'store_details_saved');
      sessionStorage.removeItem('ownly:selected_retail_type');
      router.push('/onboarding/complete');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to save store details.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!retailType || !user) return null;

  return (
    <AuthGuard>
      <div className="onboarding-page animate-fade-in-up">
        <div className="onboarding-page__header">
          <div className="onboarding-step-badge">Step 3 of 4</div>
          <h1 className="onboarding-page__title">Set up your store</h1>
          <p className="onboarding-page__subtitle">
            Tell us about your store. You can update these details anytime.
          </p>
        </div>

        <div className="onboarding-form-card card">
          <StoreSetupForm
            ownerId={user.id}
            retailType={retailType}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            serverError={serverError}
          />
        </div>
      </div>
    </AuthGuard>
  );
}
