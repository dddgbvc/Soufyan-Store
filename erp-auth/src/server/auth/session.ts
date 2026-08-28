import 'server-only';

import { cookies } from 'next/headers';

import { config } from '@/server/config';
import * as employeesRepo from '@/server/db/repositories/employees';
import * as sessionsRepo from '@/server/db/repositories/sessions';
import type { AuthMethod, Employee, Session } from '@/server/db/types';
import { generateToken, hashToken } from '@/server/security/crypto';
import { AuthError } from '@/server/security/errors';
import type { RequestContext } from '@/server/security/requestContext';

export interface AuthenticatedSession {
  session: Session;
  employee: Employee;
}

export interface IssuedSession {
  session: Session;
  /** Raw token. Belongs in a Set-Cookie header and nowhere else. */
  token: string;
}

/**
 * Session logic is deliberately transport-agnostic: it issues and validates
 * tokens, while the HTTP layer decides where a token comes from and where it
 * goes. That keeps the whole auth core testable without a request context.
 */
export async function issueSession(
  employeeId: string,
  method: AuthMethod,
  context: RequestContext,
  options: { deviceLabel?: string | null; rotatedFrom?: string | null } = {},
): Promise<IssuedSession> {
  const token = generateToken(32);
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + config.session.absoluteHours * 3_600_000);
  const idleExpiresAt = new Date(now + config.session.idleMinutes * 60_000);

  const session = await sessionsRepo.create({
    employeeId,
    // Only the digest is stored, so a database leak cannot be replayed.
    tokenHash: hashToken(token),
    method,
    expiresAt: idleExpiresAt < absoluteExpiresAt ? idleExpiresAt : absoluteExpiresAt,
    absoluteExpiresAt,
    ip: context.ip,
    userAgent: context.userAgent,
    deviceLabel: options.deviceLabel ?? describeDevice(context.userAgent),
    rotatedFrom: options.rotatedFrom ?? null,
  });

  return { session, token };
}

/** Validates a raw token and slides the idle window forward. */
export async function resolveSession(token: string): Promise<AuthenticatedSession | null> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
  return sessionsRepo.resolveAndTouch(hashToken(token), config.session.idleMinutes * 60);
}

export async function revokeSessionByToken(token: string, reason: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
  return sessionsRepo.revokeByTokenHash(hashToken(token), reason);
}

// ---------------------------------------------------------------------------
// HTTP layer: the only place that touches cookies.
// ---------------------------------------------------------------------------

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProduction,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(config.session.cookieName, token, cookieOptions(config.session.absoluteHours * 3600));
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(config.session.cookieName, '', cookieOptions(0));
}

export async function readSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(config.session.cookieName)?.value ?? null;
}

/** Resolves the caller's session from the request cookie. */
export async function getSession(): Promise<AuthenticatedSession | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  return resolveSession(token);
}

export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await getSession();
  if (!session) throw new AuthError('session_expired');
  return session;
}

/** Revokes the current session server-side and clears the cookie. */
export async function destroySession(reason = 'logout'): Promise<string | null> {
  const token = await readSessionCookie();
  const sessionId = token ? await revokeSessionByToken(token, reason) : null;
  await clearSessionCookie();
  return sessionId;
}

/**
 * Replaces the current session with a fresh one. Used after a credential change
 * so a token stolen before the change cannot survive it.
 */
export async function rotateSession(current: AuthenticatedSession, context: RequestContext): Promise<Session> {
  await sessionsRepo.revokeById(current.session.id, 'rotated');
  const issued = await issueSession(current.employee.id, current.session.method, context, {
    rotatedFrom: current.session.id,
    deviceLabel: current.session.deviceLabel,
  });
  await setSessionCookie(issued.token);
  return issued.session;
}

// ---------------------------------------------------------------------------
// Shared session bookkeeping
// ---------------------------------------------------------------------------

export async function revokeOtherSessions(employeeId: string, keepSessionId: string, reason: string): Promise<number> {
  return sessionsRepo.revokeAllForEmployee(employeeId, reason, keepSessionId);
}

export async function revokeAllSessions(employeeId: string, reason: string): Promise<number> {
  return sessionsRepo.revokeAllForEmployee(employeeId, reason, null);
}

export async function listSessions(employeeId: string, limit = 20): Promise<Session[]> {
  return sessionsRepo.listForEmployee(employeeId, limit);
}

/**
 * Guard applied before any session is issued: disabled and locked accounts are
 * rejected even when the credential itself was correct.
 */
export async function assertLoginAllowed(employeeId: string): Promise<void> {
  const employee = await employeesRepo.findById(employeeId);
  if (!employee) throw new AuthError('invalid_credentials');
  if (employee.status !== 'active') throw new AuthError('account_disabled');
  if (employee.isLocked) {
    const retryAfter = employee.lockedUntil
      ? Math.max(1, Math.ceil((employee.lockedUntil.getTime() - Date.now()) / 1000))
      : 60;
    throw new AuthError('account_locked', { retryAfter });
  }
}

/** Best-effort human label for the session list. Never used for security. */
function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  const platform = ua.includes('android')
    ? 'Android'
    : /iphone|ipad|ipod/.test(ua)
      ? 'iOS'
      : ua.includes('windows')
        ? 'Windows'
        : ua.includes('mac os')
          ? 'macOS'
          : ua.includes('linux')
            ? 'Linux'
            : 'جهاز';
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('chrome')
      ? 'Chrome'
      : ua.includes('firefox')
        ? 'Firefox'
        : ua.includes('safari')
          ? 'Safari'
          : 'متصفح';
  return `${platform} · ${browser}`;
}
