'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Metadata } from 'next';
import { SignupForm } from '@/modules/account/components/SignupForm';
import { useAuth } from '@/shared/hooks/useAuth';
import type { SignUpInput } from '@/modules/account/types';

export default function SignupPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const handleSignUp = async (input: SignUpInput) => {
    setIsLoading(true);
    setServerError('');
    try {
      const pending = await signUp(input);
      // Store userId in session for verify page
      sessionStorage.setItem('ownly:verify_userId', pending.userId);
      sessionStorage.setItem('ownly:verify_email', pending.email);
      sessionStorage.setItem('ownly:verify_devCode', pending.code);
      router.push('/verify');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-card card animate-fade-in-scale">
      <div className="auth-card__header">
        <h1 className="auth-card__title">Create your account</h1>
        <p className="auth-card__subtitle">
          Set up your store and start managing your retail business.
        </p>
      </div>
      <SignupForm
        onSubmit={handleSignUp}
        isLoading={isLoading}
        serverError={serverError}
      />
    </div>
  );
}
