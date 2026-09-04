import 'server-only';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import type { ProviderSession } from '@/modules/isp/providers/core/adapter';
import type { SessionPersistence } from '@/modules/isp/providers/core/auth';

/**
 * Server-side provider session store (spec §42, §46).
 *
 * The trust boundary:
 *
 *     Browser  →  Yaqoot server (this file)  →  Adapter  →  ISP API
 *
 * The browser only ever holds an opaque, httpOnly cookie. Provider tokens,
 * passwords and session refs never reach client JavaScript, localStorage,
 * sessionStorage or a URL — which §42 forbids explicitly.
 *
 * NOTE ON DURABILITY: this store is in-process. That is correct for a single
 * server and for local development, and it deliberately means provider
 * sessions do not survive a restart (fail-closed: the operator logs in
 * again). For multi-instance deployment, back `store` with Redis or a
 * server-side table — the interface below is what you reimplement. Do not
 * move it to the client to make it survive.
 */

const COOKIE_NAME = 'isp_sid';
const COOKIE_MAX_AGE_SECONDS = 12 * 3600;

interface StoredProviderSession {
  readonly session: ProviderSession;
  readonly persistence: SessionPersistence;
  readonly agentDisplayName: string | null;
  readonly establishedAt: number;
}

/** sid → providerId → session */
const store = new Map<string, Map<string, StoredProviderSession>>();

/** Pending second-factor attempts: challengeId → provider it belongs to. */
const pendingChallenges = new Map<string, { providerId: string; sid: string; at: number }>();

function newSid(): string {
  return randomBytes(24).toString('hex');
}

/** Reads the caller's sid, minting one if absent. Must run in a route handler. */
export async function currentSid(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  if (existing && /^[0-9a-f]{48}$/.test(existing)) return existing;

  const sid = newSid();
  jar.set(COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return sid;
}

/** Read-only variant for GET handlers that must not mint a cookie. */
export async function existingSid(): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  return existing && /^[0-9a-f]{48}$/.test(existing) ? existing : null;
}

export function putSession(
  sid: string,
  providerId: string,
  session: ProviderSession,
  persistence: SessionPersistence,
  agentDisplayName: string | null,
): void {
  let bucket = store.get(sid);
  if (!bucket) {
    bucket = new Map();
    store.set(sid, bucket);
  }
  bucket.set(providerId, {
    session,
    persistence,
    agentDisplayName,
    establishedAt: Date.now(),
  });
}

export function getSession(sid: string | null, providerId: string): ProviderSession | null {
  if (sid === null) return null;
  const stored = store.get(sid)?.get(providerId);
  if (!stored) return null;

  if (
    stored.session.expiresAt !== null &&
    Date.parse(stored.session.expiresAt) <= Date.now()
  ) {
    store.get(sid)?.delete(providerId);
    return null;
  }
  return stored.session;
}

export function getAgentName(sid: string | null, providerId: string): string | null {
  if (sid === null) return null;
  return store.get(sid)?.get(providerId)?.agentDisplayName ?? null;
}

export function dropSession(sid: string, providerId: string): void {
  store.get(sid)?.delete(providerId);
}

/**
 * Switching provider context must not disturb the others (§45): each provider
 * keeps its own independent session under the same Yaqoot login.
 */
export function connectedProviderIds(sid: string | null): readonly string[] {
  if (sid === null) return [];
  const bucket = store.get(sid);
  if (!bucket) return [];
  return [...bucket.keys()].filter((providerId) => getSession(sid, providerId) !== null);
}

export function rememberChallenge(challengeId: string, sid: string, providerId: string): void {
  pendingChallenges.set(challengeId, { sid, providerId, at: Date.now() });
}

export function takeChallenge(
  challengeId: string,
): { sid: string; providerId: string } | null {
  const entry = pendingChallenges.get(challengeId);
  if (!entry) return null;
  pendingChallenges.delete(challengeId);
  // Challenges are short-lived; an old one is treated as absent.
  if (Date.now() - entry.at > 10 * 60 * 1000) return null;
  return { sid: entry.sid, providerId: entry.providerId };
}

/** Test seam. */
export function clearAllSessions(): void {
  store.clear();
  pendingChallenges.clear();
}
