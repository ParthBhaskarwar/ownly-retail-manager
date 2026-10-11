'use client';

import { useEffect } from 'react';

/**
 * Route-segment error boundary for the whole authenticated app shell.
 *
 * Without this, an uncaught render error anywhere under (app) unmounts the
 * tree with no fallback UI — the user just sees a blank page.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app-error-boundary]', error);
  }, [error]);

  return (
    <div className="page-content">
      <div className="empty-state">
        <span className="empty-state__icon" aria-hidden="true">⚠</span>
        <h3 className="empty-state__title">Something went wrong</h3>
        <p className="empty-state__desc">
          This page hit an unexpected error. You can try again, or head back to the dashboard.
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Try Again
          </button>
          <a href="/dashboard" className="btn btn-secondary">
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
