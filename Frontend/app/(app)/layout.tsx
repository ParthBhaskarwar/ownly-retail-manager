'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { Sidebar } from '@/shell/components/Sidebar';
import { Header } from '@/shell/components/Header';
import { StoreProvider, useStoreContext } from '@/context/StoreContext';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/shared/hooks/useToast';
import { ToastContainer } from '@/shared/components/Toast';

/**
 * An owner who signed up but never created a store has nothing to manage yet:
 * send them through onboarding (retail type → store details) instead of
 * showing pages that would spin or fail with "no store".
 */
function StoreOnboardingGate({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  const { store, isLoaded } = useStoreContext();
  const router = useRouter();

  const needsOnboarding = isLoaded && !store && !user?.storeId && user?.role === 'OWNER';

  useEffect(() => {
    if (needsOnboarding) router.replace('/onboarding/retail-type');
  }, [needsOnboarding, router]);

  if (!isLoaded || needsOnboarding) {
    return (
      <div className="auth-loading" aria-busy="true">
        <div className="auth-loading__spinner animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toasts, removeToast } = useToast();

  return (
    <AuthGuard>
      <StoreProvider>
        <StoreOnboardingGate>
          <div className="app-layout">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <main className="app-main" id="main-content">
              <Header onMenuToggle={() => setSidebarOpen((o) => !o)} />
              <div className="app-content page-enter">
                {children}
              </div>
            </main>
          </div>
          <ToastContainer toasts={toasts} onRemove={removeToast} />
        </StoreOnboardingGate>
      </StoreProvider>
    </AuthGuard>
  );
}
