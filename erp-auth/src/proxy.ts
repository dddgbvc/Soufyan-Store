import { NextResponse, type NextRequest } from 'next/server';

const CSRF_COOKIE = process.env.CSRF_COOKIE_NAME ?? 'erp_auth_csrf';
const DEVICE_COOKIE = process.env.DEVICE_COOKIE_NAME ?? 'erp_auth_device';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;

/** Web Crypto keeps this identical whether it runs at the edge or in Node. */
function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  let binary = '';
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Plants the two cookies the security layer depends on before any request can
 * reach a route handler, and stamps the hardening headers on every response.
 *
 * The CSRF cookie is deliberately readable by the app's own scripts — that is
 * how the double-submit token gets echoed back in a header — while the device
 * cookie stays httpOnly because only the server ever needs it.
 */
export function proxy(request: NextRequest): NextResponse {
  const csrf = request.cookies.get(CSRF_COOKIE)?.value;
  const device = request.cookies.get(DEVICE_COOKIE)?.value;

  const nextCsrf = csrf && TOKEN_PATTERN.test(csrf) ? null : randomToken(32);
  const nextDevice = device && TOKEN_PATTERN.test(device) ? null : randomToken(24);

  // Make freshly minted values visible to this same request, not just the next.
  if (nextCsrf) request.cookies.set(CSRF_COOKIE, nextCsrf);
  if (nextDevice) request.cookies.set(DEVICE_COOKIE, nextDevice);

  const response = NextResponse.next({ request });

  if (nextCsrf) {
    response.cookies.set(CSRF_COOKIE, nextCsrf, {
      httpOnly: false,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
      path: '/',
      maxAge: 60 * 60 * 12,
    });
  }

  if (nextDevice) {
    response.cookies.set(DEVICE_COOKIE, nextDevice, {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  response.headers.set('cross-origin-opener-policy', 'same-origin');

  return response;
}

export const config = {
  // Everything except static assets: pages and API routes both need the cookies.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)'],
};
