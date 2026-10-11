'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { evaluatePermission, PermissionKey } from '@/config/permissions';
import type { Role } from '@/modules/account/types';

interface PermissionGuardProps {
  /** Permission key required to view this content. */
  permissionKey: PermissionKey;
  /** What to show when access is denied. Defaults to a redirect to /dashboard. */
  fallback?: React.ReactNode;
  /** If true, redirects instead of showing fallback. Default: true */
  redirect?: boolean;
  children: React.ReactNode;
}

/**
 * PermissionGuard — wraps any content that requires a specific permission.
 *
 * Works at both render time AND blocks direct URL navigation since it
 * runs on the client during hydration.
 *
 * Usage:
 *   <PermissionGuard permissionKey="staff:create">
 *     <AddStaffButton />
 *   </PermissionGuard>
 */
export function PermissionGuard({
  permissionKey,
  fallback,
  redirect = true,
  children,
}: PermissionGuardProps) {
  const { user, isLoading } = useAuthContext();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="permission-loading" aria-busy="true">
        <div className="skeleton" style={{ height: 40, width: 200, borderRadius: 8 }} />
      </div>
    );
  }

  if (!user) {
    if (redirect) router.replace('/login');
    return null;
  }

  const allowed = evaluatePermission(user.role as Role, permissionKey);

  if (!allowed) {
    if (fallback) return <>{fallback}</>;
    if (redirect) {
      router.replace('/dashboard');
      return null;
    }
    return (
      <div className="permission-denied animate-fade-in">
        <div className="permission-denied__icon">🔒</div>
        <h3 className="permission-denied__title">Access Restricted</h3>
        <p className="permission-denied__message">
          You don&apos;t have permission to view this content. Contact your store owner if you need access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * AuthGuard — ensures user is authenticated. Redirects to /login if not.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthContext();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="auth-loading" aria-busy="true">
        <div className="auth-loading__spinner animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  return <>{children}</>;
}
