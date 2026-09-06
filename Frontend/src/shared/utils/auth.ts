/**
 * getAuthToken — reads the active session token from localStorage.
 * Supports both old key ('ownly_auth_token') and new key ('ownly:active_session').
 */
export function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return (
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
