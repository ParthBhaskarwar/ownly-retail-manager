'use client';
import { useAuthContext } from '@/context/AuthContext';

/** Convenience re-export of auth context for components. */
export function useAuth() {
  return useAuthContext();
}
