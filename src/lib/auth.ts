import { apiClient } from './apiClient';

/**
 * Authentication helpers for the CILogon (OIDC) session.
 *
 * The backend (src/backend/auth.py) runs the OIDC flow and stores an httpOnly
 * session cookie. The frontend never sees a token; it just asks the backend
 * who the current user is via `/auth/me` (cookie sent automatically by the
 * shared `apiClient`).
 */

export interface UserInfo {
  sub: string;
  email?: string | null;
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  idp_name?: string | null;
  is_admin?: boolean;
}

export interface AuthMeResponse {
  authenticated: boolean;
  message: string;
  user?: UserInfo | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Start the CILogon login flow. This is a full-page navigation (not an XHR) so
 * the browser follows the redirects through CILogon and back to the backend
 * callback, which sets the session cookie and returns us to the app.
 */
export function login(): void {
  if (typeof window !== 'undefined') {
    window.location.href = `${API_URL}/auth/login`;
  }
}

/**
 * Log out by clearing the backend session cookie.
 */
export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

/**
 * Fetch the current session/user from the backend.
 */
export async function getSession(): Promise<AuthMeResponse> {
  try {
    const response = await apiClient.get<AuthMeResponse>('/auth/me');
    return response.data;
  } catch {
    return { authenticated: false, message: 'Not authenticated' };
  }
}

/**
 * Checks if the user is currently authenticated via CILogon.
 */
export async function isLoggedIn(): Promise<boolean> {
  const session = await getSession();
  return session.authenticated;
}

/**
 * Checks if the current user is an admin. Admin status is determined entirely
 * by the backend (email allowlist in src/config/admins.json), surfaced as the
 * `is_admin` flag on the user returned by `/auth/me`.
 *
 * @returns Promise that resolves to a boolean indicating if the user is an admin
 */
export async function isUserAdmin(): Promise<boolean> {
  const session = await getSession();
  return session.authenticated && session.user?.is_admin === true;
}
