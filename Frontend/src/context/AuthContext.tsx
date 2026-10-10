'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { User, Session, LoginInput, SignUpInput, PendingVerification } from '@/modules/account/types';
import {
  AuthService,
  getStoredSessionToken,
  clearStoredSession,
} from '@/modules/account/services/AuthService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthState {
  user: Omit<User, 'passwordHash'> | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  signUp: (input: SignUpInput) => Promise<PendingVerification>;
  verify: (userId: string, code: string) => Promise<void>;
  resendCode: (userId: string) => Promise<{ devCode?: string }>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const refreshSession = useCallback(async () => {
    const token = getStoredSessionToken();
    if (!token) {
      setState({ user: null, session: null, isLoading: false, isAuthenticated: false });
      return;
    }
    // Retry transient failures (server restarting, dropped connection) before giving up.
    // A definitive "not logged in" answer clears the token inside resolveSession; a
    // transient failure leaves the token in place so a reload can recover.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await AuthService.resolveSession(token);
        if (result) {
          setState({ user: result.user, session: result.session, isLoading: false, isAuthenticated: true });
        } else {
          setState({ user: null, session: null, isLoading: false, isAuthenticated: false });
        }
        return;
      } catch {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
    setState({ user: null, session: null, isLoading: false, isAuthenticated: false });
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const signUp = useCallback(async (input: SignUpInput): Promise<PendingVerification> => {
    return AuthService.signUp(input);
  }, []);

  const verify = useCallback(async (userId: string, code: string): Promise<void> => {
    await AuthService.verify(userId, code);
  }, []);

  const resendCode = useCallback(async (userId: string): Promise<{ devCode?: string }> => {
    return AuthService.resendCode(userId);
  }, []);

  const login = useCallback(async (input: LoginInput): Promise<void> => {
    const result = await AuthService.login(input);
    setState({
      user: result.user,
      session: result.session,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    if (state.session) {
      await AuthService.logout(state.session.id, state.user?.id ?? '');
    } else {
      clearStoredSession();
    }
    setState({ user: null, session: null, isLoading: false, isAuthenticated: false });
  }, [state.session, state.user]);

  return (
    <AuthContext.Provider value={{ ...state, signUp, verify, resendCode, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
