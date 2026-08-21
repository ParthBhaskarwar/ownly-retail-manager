'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RetailTypeSelector } from '@/modules/retail-template/components/RetailTypeSelector';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { useAuth } from '@/shared/hooks/useAuth';
import type { RetailType } from '@/modules/retail-template/types';

export default function RetailTypePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<RetailType | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  const handleSelect = (type: RetailType) => {
    setSelected(type);
  };

  const handleContinue = async () => {
    if (!selected) return;
    setIsLoading(true);
    // Store selection in session for store-setup page
    sessionStorage.setItem('ownly:selected_retail_type', selected);
    router.push('/onboarding/store-setup');
  };

  return (
    <AuthGuard>
      <div className="onboarding-page animate-fade-in-up">
        <div className="onboarding-page__header">
          <div className="onboarding-step-badge">Step 2 of 4</div>
          <h1 className="onboarding-page__title">What type of store do you run?</h1>
          <p className="onboarding-page__subtitle">
            Select your retail category. This configures your product fields, dashboard, and reporting.
          </p>
        </div>

        <RetailTypeSelector
          onSelect={handleSelect}
          selectedType={selected}
          isLoading={isLoading}
        />

        {selected && (
          <div className="onboarding-page__cta animate-fade-in-up">
            <button
              id="retail-type-continue-btn"
              className="btn btn-primary btn-lg"
              onClick={handleContinue}
              disabled={isLoading}
            >
              Continue with {selected.replace('_', ' & ').replace('_', ' ')} →
            </button>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
