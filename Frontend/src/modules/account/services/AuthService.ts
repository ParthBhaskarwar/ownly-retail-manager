/**
 * AuthService — talks to the backend auth API.
 *
 * Every exported name and signature is unchanged from the previous local
 * implementation, so AuthContext and the login/signup/verify forms did not
 * need modifying. What changed is where the work happens: bcrypt hashing,
 * credential checks and session records are now server-side, and the token
 * is a signed JWT rather than a client-generated string.
 */

import { apiClient, getToken, setToken, clearToken } from '@/lib/apiClient';
import {
  User,
  Session,
  SignUpInput,
  LoginInput,
  AuthResult,
  PendingVerification,
  DeviceInfo,
} from '@/modules/account/types';

type SafeUser = Omit<User, 'passwordHash'>;

function getDeviceInfo(): DeviceInfo {
  if (typeof navigator === 'undefined') {
    return { userAgent: 'server', platform: 'server', language: 'en' };
  }
  return {
    userAgent: navigator.userAgent,
    // navigator.platform is deprecated but still the most widely supported
    // way to get this; it is only informational (shown in session history).
    platform: navigator.platform,
    language: navigator.language,
  };
}

// ─── Session token helpers (same names as before) ─────────────────────────────

export function storeActiveSession(token: string): void {
  setToken(token);
}

export function getStoredSessionToken(): string | null {
  return getToken();
}

export function clearStoredSession(): void {
  clearToken();
}

/**
 * Previously the pending verification lived in sessionStorage because the
 * code was generated in the browser. The server owns it now; this is kept so
 * the verify page can still recover the userId after a reload.
 */
const PENDING_VERIFY_KEY = 'ownly:pending_verify';

export function getPendingVerification(): PendingVerification | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_VERIFY_KEY);
    return raw ? (JSON.parse(raw) as PendingVerification) : null;
  } catch {
    return null;
  }
}

function storePendingVerification(data: PendingVerification): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(PENDING_VERIFY_KEY, JSON.stringify(data));
  }
}

function clearPendingVerification(): void {
  if (typeof window !== 'undefined') sessionStorage.removeItem(PENDING_VERIFY_KEY);
}

// ─── AuthService ──────────────────────────────────────────────────────────────

export const AuthService = {
  async signUp(input: SignUpInput): Promise<PendingVerification> {
    const result = await apiClient.post<{ userId: string; email: string; devCode?: string }>(
      '/api/auth/signup',
      input,
      { auth: false }
    );

    const pending: PendingVerification = {
      userId: result.userId,
      email: result.email,
      // Present only while the server runs in development — email delivery
      // is still stubbed. See Backend AuthService.signUp.
      code: result.devCode ?? '',
    };
    storePendingVerification(pending);
    return pending;
  },

  async verify(userId: string, code: string): Promise<void> {
    await apiClient.post('/api/auth/verify', { userId, code }, { auth: false });
    clearPendingVerification();
  },

  /** Asks the server for a fresh verification code (the old one expired or was mistyped too often). */
  async resendCode(userId: string): Promise<{ devCode?: string }> {
    return apiClient.post<{ devCode?: string }>('/api/auth/resend-code', { userId }, { auth: false });
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const result = await apiClient.post<AuthResult>(
      '/api/auth/login',
      { ...input, deviceInfo: getDeviceInfo() },
      { auth: false }
    );
    storeActiveSession(result.token);
    return result;
  },

  async logout(_sessionId: string, _userId: string): Promise<void> {
    try {
      await apiClient.post('/api/auth/logout');
    } finally {
      // Always drop the local token, even if the server call fails —
      // otherwise a network blip would leave the user unable to sign out.
      clearStoredSession();
    }
  },

  /**
   * Resolves the current session from the stored token.
   * Returns null when the token is missing, expired or rejected.
   */
  async resolveSession(
    _token: string
  ): Promise<{ user: SafeUser; session: Session } | null> {
    try {
      const { user } = await apiClient.get<{ user: SafeUser; store: unknown }>('/api/auth/me');

      // The server no longer hands back a session row on every request; the
      // JWT itself is the session. This synthesises the shape AuthContext
      // expects so the context did not need changing.
      const session: Session = {
        id: user.id,
        userId: user.id,
        createdAt: user.lastLoginAt ?? user.createdAt,
        expiresAt: '',
        deviceInfo: getDeviceInfo(),
      };
      return { user, session };
    } catch {
      clearStoredSession();
      return null;
    }
  },

  /**
   * Re-issues the token after storeId changes (store creation). Without this
   * the client would keep sending a token signed with storeId=null and every
   * store-scoped request would fail until the user logged out and back in.
   */
  async refreshToken(): Promise<SafeUser> {
    const { user, token } = await apiClient.post<{ user: SafeUser; token: string }>(
      '/api/auth/refresh'
    );
    storeActiveSession(token);
    return user;
  },
};
