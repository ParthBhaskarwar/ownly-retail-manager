'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Store } from '@/modules/store/types';
import { StoreService } from '@/modules/store/services/StoreService';
import { useAuthContext } from './AuthContext';

interface StoreContextValue {
  store: Store | null;
  /** True while a store fetch is in flight. */
  isLoading: boolean;
  /** True once the first store fetch for the current user has finished (found a store or not). */
  isLoaded: boolean;
  refresh: () => Promise<void>;
  setStore: (store: Store) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  const userId = user?.id;
  const userStoreId = user?.storeId;
  const [store, setStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStore(null);
      setIsLoaded(false);
      return;
    }
    setIsLoading(true);
    try {
      // The backend resolves the store from the caller's own account.
      setStore(await StoreService.getByOwnerId(userId));
    } catch {
      setStore(null);
    } finally {
      setIsLoading(false);
      setIsLoaded(true);
    }
    // userStoreId is a dependency so the store is re-read once onboarding assigns one.
  }, [userId, userStoreId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <StoreContext.Provider value={{ store, isLoading, isLoaded, refresh, setStore }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStoreContext(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStoreContext must be used within StoreProvider');
  return ctx;
}
