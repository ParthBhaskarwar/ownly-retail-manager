'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Store } from '@/modules/store/types';
import { StoreService } from '@/modules/store/services/StoreService';
import { useAuthContext } from './AuthContext';

interface StoreContextValue {
  store: Store | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  setStore: (store: Store) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  const [store, setStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setStore(null);
      return;
    }
    setIsLoading(true);
    try {
      const s = await StoreService.getByOwnerId(user.id);
      // Also try by storeId if owner already has one
      const result = s ?? (user.storeId ? await StoreService.getById(user.storeId) : null);
      setStore(result);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <StoreContext.Provider value={{ store, isLoading, refresh, setStore }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStoreContext(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStoreContext must be used within StoreProvider');
  return ctx;
}
