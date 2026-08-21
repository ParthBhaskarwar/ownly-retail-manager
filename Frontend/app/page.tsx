'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';

/**
 * Root page — redirects based on auth state:
 * - Not authenticated → /login
 * - Authenticated, no store → /onboarding/retail-type
 * - Authenticated, store setup → /dashboard
 */
export default function RootPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
    } else {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--color-bg-base)',
      }}
    >
      <div className="animate-spin" style={{
        width: 40,
        height: 40,
        border: '3px solid var(--color-border)',
        borderTop: '3px solid var(--color-brand-500)',
        borderRadius: '50%',
      }} />
    </div>
  );
}
