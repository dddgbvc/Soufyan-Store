import 'server-only';

import { cookies, headers } from 'next/headers';

import { config } from '@/server/config';
import { fingerprint, generateToken } from '@/server/security/crypto';
import { AuthError } from '@/server/security/errors';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  origin: string | null;
  /** Stable-ish per-browser id used for rate limiting and QR device binding. */
  deviceId: string;
  /** Bucket suffix combining IP and device so neither alone defeats the limit. */
  clientKey: string;
}

const PRIVATE_HEADER_ORDER = ['x-real-ip', 'cf-connecting-ip', 'x-vercel-forwarded-for'] as const;

function firstForwardedFor(value: string | null): string | null {
  if (!value) return null;
  const [first] = value.split(',');
  return first?.trim() || null;
}

/** Postgres `inet` rejects junk, so anything unparseable is stored as null. */
function normalizeIp(value: string | null): string | null {
  if (!value) return null;
  const candidate = value.trim().replace(/^\[|\]$/g, '').split('%')[0];
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(candidate) &&
    candidate.split('.').every((octet) => Number(octet) <= 255);
  const isIpv6 = /^[0-9a-fA-F:]+$/.test(candidate) && candidate.includes(':');
  return isIpv4 || isIpv6 ? candidate : null;
}

/**
 * Reads everything the security layer needs to know about the caller, and
 * lazily plants a device cookie so anonymous callers can still be rate limited
 * per browser rather than per shared NAT address.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const headerList = await headers();
  const cookieStore = await cookies();

  let ip = normalizeIp(firstForwardedFor(headerList.get('x-forwarded-for')));
  for (const header of PRIVATE_HEADER_ORDER) {
    if (ip) break;
    ip = normalizeIp(headerList.get(header));
  }

  const userAgent = headerList.get('user-agent')?.slice(0, 512) ?? null;
  const origin = headerList.get('origin');

  let deviceId = cookieStore.get(config.session.deviceCookieName)?.value ?? '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(deviceId)) {
    deviceId = generateToken(24);
    try {
      cookieStore.set(config.session.deviceCookieName, deviceId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    } catch {
      // Server Components render read-only; the id still works for this
      // request, it simply will not persist until a route handler plants it.
    }
  }

  return {
    ip,
    userAgent,
    origin,
    deviceId,
    clientKey: fingerprint(ip, deviceId),
  };
}

/**
 * Same-origin enforcement for state-changing requests. Combined with the
 * SameSite=Lax session cookie and the double-submit token, this closes the CSRF
 * hole from three independent directions.
 */
export async function assertSameOrigin(): Promise<void> {
  const headerList = await headers();
  const origin = headerList.get('origin');

  // Non-browser clients (curl, native app) send no Origin at all; those cannot
  // carry a victim's cookies implicitly, so there is nothing to forge.
  if (!origin) return;

  const allowed = new Set<string>([config.appUrl]);
  const host = headerList.get('host');
  if (host) {
    allowed.add(`https://${host}`);
    if (!config.isProduction) allowed.add(`http://${host}`);
  }

  if (!allowed.has(origin.replace(/\/+$/, ''))) {
    throw new AuthError('csrf_failed');
  }
}
