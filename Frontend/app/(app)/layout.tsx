'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { Sidebar } from '@/shell/components/Sidebar';
import { Header } from '@/shell/components/Header';
import { StoreProvider } from '@/context/StoreContext';
import { useToast } from '@/shared/hooks/useToast';
import { ToastContainer } from '@/shared/components/Toast';

export default function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  return (
    <AuthGuard>
      <StoreProvider>
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
      </StoreProvider>
    </AuthGuard>
  );
}
