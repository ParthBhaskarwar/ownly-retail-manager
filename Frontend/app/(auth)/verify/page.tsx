'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VerifyForm } from '@/modules/account/components/VerifyForm';
import { useAuth } from '@/shared/hooks/useAuth';

export default function VerifyPage() {
  const { verify } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [devCode, setDevCode] = useState('');

  useEffect(() => {
    const uid = sessionStorage.getItem('ownly:verify_userId');
    const em = sessionStorage.getItem('ownly:verify_email');
    const code = sessionStorage.getItem('ownly:verify_devCode');
    if (!uid || !em) {
      router.replace('/signup');
      return;
    }
    setUserId(uid);
    setEmail(em);
    setDevCode(code ?? '');
  }, [router]);

  const handleVerify = async (uid: string, code: string) => {
    setIsLoading(true);
    setServerError('');
    try {
      await verify(uid, code);
      // Clear verify session data
      sessionStorage.removeItem('ownly:verify_userId');
      sessionStorage.removeItem('ownly:verify_email');
      sessionStorage.removeItem('ownly:verify_devCode');
      router.push('/login?verified=true');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!userId) return null;

  return (
    <div className="auth-card card animate-fade-in-scale">
      <div className="auth-card__header">
        <div className="auth-card__icon">✉️</div>
        <h1 className="auth-card__title">Verify your email</h1>
        <p className="auth-card__subtitle">
          Enter the 6-digit code to activate your account.
        </p>
      </div>
      <VerifyForm
        email={email}
        userId={userId}
        devCode={devCode}
        onSubmit={handleVerify}
        isLoading={isLoading}
        serverError={serverError}
      />
    </div>
  );
}
