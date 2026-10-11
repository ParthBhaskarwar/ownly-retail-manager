import type { ReactNode } from 'react';
import type { Metadata } from 'next';

// The root layout's template already appends "| Ownly"; repeating it here produced
// "Sign In | Ownly | Ownly".
export const metadata: Metadata = {
  title: 'Sign In',
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <div className="auth-layout__inner">
        {/* Brand mark — flat denim, no gradient */}
        <div className="auth-brand">
          <div className="auth-brand__logo">O</div>
          <span className="auth-brand__name">Ownly</span>
        </div>
        {children}
      </div>
    </div>
  );
}
