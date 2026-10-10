'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginForm } from '@/modules/account/components/LoginForm';
import { useAuth } from '@/shared/hooks/useAuth';
import type { LoginInput } from '@/modules/account/types';

function LoginContent() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const verified = searchParams.get('verified') === 'true';

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) router.replace('/dashboard');
  }, [user, isLoading, router]);

  const handleLogin = async (input: LoginInput) => {
    setSubmitting(true);
    setServerError('');
    try {
      await login(input);
      router.push('/dashboard');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-card card animate-fade-in-scale">
      {verified && (
        <div className="auth-success-banner animate-fade-in-down">
          Email verified! You can now sign in.
        </div>
      )}
      <div className="auth-card__header">
        <h1 className="auth-card__title">Welcome back</h1>
        <p className="auth-card__subtitle">Sign in to your Ownly store.</p>
      </div>
      <LoginForm onSubmit={handleLogin} isLoading={submitting} serverError={serverError} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
