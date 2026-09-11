/**
 * getAuthToken — reads the active session token from localStorage.
 * The canonical key is 'ownly:token' (written by apiClient → setToken).
 * Legacy keys are checked as fallbacks so old sessions still work.
 */
export function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('ownly:token') ||
    localStorage.getItem('ownly:active_session') ||
    localStorage.getItem('ownly_auth_token') ||
    ''
  );
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
