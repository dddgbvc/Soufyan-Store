import 'server-only';

import { redirect } from 'next/navigation';

import { requireAuth, requirePermission, type AuthzContext } from '@/server/authz/guard';
import { AuthError } from '@/server/security/errors';

/**
 * Page-level guards.
 *
 * A missing session sends the caller to the login screen; a missing capability
 * returns null so the page can render a proper "not allowed" view instead of
 * an error page. The authorization decision itself still happens on the server.
 */
export async function guardPage(permissionKey: string): Promise<AuthzContext | null> {
  try {
    return await requirePermission(permissionKey);
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === 'session_expired') redirect('/login');
      if (error.code === 'forbidden') return null;
    }
    throw error;
  }
}

export async function guardAuthenticated(): Promise<AuthzContext> {
  try {
    return await requireAuth();
  } catch (error) {
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }
}
