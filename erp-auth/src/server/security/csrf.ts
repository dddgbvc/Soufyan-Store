import 'server-only';

import { cookies, headers } from 'next/headers';

import { config } from '@/server/config';
import { generateToken, safeEquals } from '@/server/security/crypto';
import { AuthError } from '@/server/security/errors';
import { assertSameOrigin } from '@/server/security/requestContext';

export const CSRF_HEADER = 'x-csrf-token';

/**
 * Double-submit token. The cookie is readable by the app's own JavaScript (it
 * has to be, to echo the value back in a header) but is useless to any other
 * origin, which cannot read cross-site cookies.
 */
export async function issueCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(config.session.csrfCookieName)?.value;
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) {
    return existing;
  }

  const token = generateToken(32);
  cookieStore.set(config.session.csrfCookieName, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  return token;
}

/** Verifies Origin and the double-submit token. Call on every mutating route. */
export async function assertCsrf(): Promise<void> {
  await assertSameOrigin();

  const cookieStore = await cookies();
  const headerList = await headers();

  const cookieToken = cookieStore.get(config.session.csrfCookieName)?.value;
  const headerToken = headerList.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || !safeEquals(cookieToken, headerToken)) {
    throw new AuthError('csrf_failed');
  }
}
