import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Adapters } from '@/adapters';
import { AppConfig } from '@/config/env';
import { AuditService } from '@/shared/audit/AuditService';
import {
  User,
  SignUpInput,
  LoginInput,
  AuthResult,
  PendingVerification,
  DeviceInfo,
} from '@/modules/account/types';

const ACTIVE_SESSION_KEY = 'ownly:active_session';
const PENDING_VERIFY_KEY = 'ownly:pending_verify';

function getDeviceInfo(): DeviceInfo {
  if (typeof navigator === 'undefined') {
    return { userAgent: 'server', platform: 'server', language: 'en' };
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
  };
}

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function storePendingVerification(data: PendingVerification): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(PENDING_VERIFY_KEY, JSON.stringify(data));
  }
}

export function getPendingVerification(): PendingVerification | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_VERIFY_KEY);
    return raw ? (JSON.parse(raw) as PendingVerification) : null;
  } catch {
    return null;
  }
}

function clearPendingVerification(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(PENDING_VERIFY_KEY);
  }
}

export function storeActiveSession(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ACTIVE_SESSION_KEY, token);
  }
}

export function getStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function clearStoredSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}

// ─── AuthService ──────────────────────────────────────────────────────────────

export const AuthService = {
  /**
   * Sign up a new owner account.
   * Role is always OWNER — no manual role selection for account creators.
   * Returns a pending verification object. Email delivery is stubbed;
   * in dev mode the code is returned directly for the UI to display.
   */
  async signUp(input: SignUpInput): Promise<PendingVerification> {
    const existing = await Adapters.user.findByEmail(input.email);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const id = uuidv4();
    await Adapters.user.create({ ...input, id, role: 'OWNER' });

    const code = generateVerificationCode();
    const pending: PendingVerification = { userId: id, code, email: input.email };
    storePendingVerification(pending);

    // Stub: in production, send email here. For now, log to console.
    console.info(`[Auth] Verification code for ${input.email}: ${code}`);

    AuditService.log('auth.signup', id, null, { email: input.email });
    return pending;
  },

  /**
   * Verify account with 6-digit code.
   */
  async verify(userId: string, code: string): Promise<void> {
    const pending = getPendingVerification();
    if (!pending || pending.userId !== userId) {
      throw new Error('No pending verification found. Please sign up again.');
    }
    if (pending.code !== code) {
      throw new Error('Invalid verification code. Please try again.');
    }
    await Adapters.user.setVerified(userId, new Date().toISOString());
    clearPendingVerification();
    AuditService.log('auth.verify', userId);
  },

  /**
   * Login with email + password.
   * Creates a new session and returns the auth result.
   */
  async login(input: LoginInput): Promise<AuthResult> {
    const user = await Adapters.user.findByEmail(input.email);
    if (!user) {
      throw new Error('Invalid email or password.');
    }
    if (!user.isActive) {
      throw new Error('This account has been deactivated. Contact your store owner.');
    }
    if (!user.verifiedAt) {
      throw new Error('Please verify your email address before logging in.');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid email or password.');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + AppConfig.auth.sessionDurationMs).toISOString();
    const sessionId = uuidv4();
    const token = `${sessionId}.${Date.now()}`;

    const session = await Adapters.session.create({
      id: sessionId,
      userId: user.id,
      expiresAt,
      deviceInfo: getDeviceInfo(),
    });

    await Adapters.user.recordLogin(user.id, now.toISOString());
    storeActiveSession(token);

    AuditService.log('auth.login', user.id, user.storeId);

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, session, token };
  },

  /**
   * Logout — invalidate the current session.
   */
  async logout(sessionId: string, userId: string): Promise<void> {
    await Adapters.session.invalidate(sessionId);
    clearStoredSession();
    AuditService.log('auth.logout', userId);
  },

  /**
   * Resolve the current session from a stored token.
   * Returns the user and session, or null if expired/invalid.
   */
  async resolveSession(token: string): Promise<{ user: Omit<User, 'passwordHash'>; session: import('@/modules/account/types').Session } | null> {
    const sessionId = token.split('.')[0];
    const session = await Adapters.session.findById(sessionId);
    if (!session) return null;

    const now = new Date();
    if (new Date(session.expiresAt) <= now) {
      await Adapters.session.invalidate(sessionId);
      clearStoredSession();
      return null;
    }

    const user = await Adapters.user.findById(session.userId);
    if (!user || !user.isActive) return null;

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, session };
  },
};
