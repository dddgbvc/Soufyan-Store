import 'server-only';

import { config } from '@/server/config';
import * as auditRepo from '@/server/db/repositories/audit';
import * as employeesRepo from '@/server/db/repositories/employees';
import * as permissionsRepo from '@/server/db/repositories/permissions';
import * as rateLimitRepo from '@/server/db/repositories/rateLimit';
import type { Employee, Session } from '@/server/db/types';
import { AuditEvent } from '@/server/audit/events';
import { assertLoginAllowed, issueSession, revokeOtherSessions } from '@/server/auth/session';
import { SecretDomain, blindIndex, hashSecret, verifySecret } from '@/server/security/crypto';
import { AuthError } from '@/server/security/errors';
import type { RequestContext } from '@/server/security/requestContext';
import { assertStrongPin, pinSchema } from '@/server/security/validation';

export interface LoginResult {
  employee: Employee;
  permissions: string[];
  session: Session;
  /** Raw session token; the route handler turns this into a cookie. */
  token: string;
  mustChangePin: boolean;
}

/**
 * A pre-computed digest used to keep the "no such PIN" path as slow as the
 * "wrong PIN" path. Without it, response time would reveal whether a guessed
 * PIN belongs to somebody.
 */
let decoyHash: Promise<string> | null = null;
function decoy(): Promise<string> {
  decoyHash ??= hashSecret('000000', SecretDomain.pin);
  return decoyHash;
}

function pinBucket(context: RequestContext): string {
  return `pin:${context.clientKey}`;
}

/**
 * PIN is the primary login path: the employee types six digits and nothing
 * else, so the server has to identify them from the secret alone.
 *
 * That is done with a keyed blind index (an O(1) indexed lookup) and then
 * *confirmed* against the slow salted digest — the index is a router, never a
 * proof. Since the search space is only 10^6, the escalating per-client rate
 * limit is the real defence, not the hash.
 */
export async function loginWithPin(pin: string, context: RequestContext): Promise<LoginResult> {
  const { employeeId, mustChangePin } = await verifyPinCredentials(pin, context);
  return finishLogin(employeeId, 'pin', context, mustChangePin);
}

/**
 * Credential check only — no session is created. Shared by the PIN login route
 * and by QR approval, where a phone proves identity for a different device.
 */
export async function verifyPinCredentials(
  pin: string,
  context: RequestContext,
): Promise<{ employeeId: string; mustChangePin: boolean }> {
  const bucket = pinBucket(context);
  const limit = await rateLimitRepo.consume(
    bucket,
    config.pin.maxAttemptsPerWindow,
    config.pin.windowSeconds,
    config.pin.lockoutSeconds,
  );

  if (!limit.allowed) {
    await auditRepo.record({
      event: AuditEvent.loginBlocked,
      severity: 'warning',
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { method: 'pin', retryAfter: limit.retryAfter },
    });
    throw new AuthError('rate_limited', { retryAfter: limit.retryAfter });
  }

  if (!pinSchema.safeParse(pin).success) {
    throw new AuthError('invalid_credentials');
  }

  const credentials = await employeesRepo.findCredentialsByPinLookup(blindIndex(pin, SecretDomain.pin));

  if (!credentials) {
    // Burn the same amount of CPU as a real verification would, so response
    // time never reveals whether a guessed PIN belongs to somebody.
    await verifySecret(pin, await decoy(), SecretDomain.pin);
    await auditRepo.record({
      event: AuditEvent.loginPinFailure,
      severity: 'warning',
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: 'unknown_pin', attemptsRemaining: limit.remaining },
    });
    throw new AuthError('invalid_credentials');
  }

  // The blind index matched, but only the salted digest is authoritative.
  if (!(await verifySecret(pin, credentials.pinHash, SecretDomain.pin))) {
    await auditRepo.record({
      event: AuditEvent.loginPinFailure,
      severity: 'critical',
      success: false,
      employeeId: credentials.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: 'digest_mismatch' },
    });
    throw new AuthError('invalid_credentials');
  }

  if (credentials.status !== 'active') {
    await auditRepo.record({
      event: AuditEvent.loginDisabled,
      severity: 'warning',
      success: false,
      employeeId: credentials.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { status: credentials.status },
    });
    throw new AuthError('account_disabled');
  }

  if (credentials.lockedUntil && credentials.lockedUntil.getTime() > Date.now()) {
    const retryAfter = Math.max(1, Math.ceil((credentials.lockedUntil.getTime() - Date.now()) / 1000));
    await auditRepo.record({
      event: AuditEvent.loginLocked,
      severity: 'warning',
      success: false,
      employeeId: credentials.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { retryAfter },
    });
    throw new AuthError('account_locked', { retryAfter });
  }

  // A correct PIN from this client clears its penalty counter.
  await rateLimitRepo.reset(bucket);

  return { employeeId: credentials.id, mustChangePin: credentials.mustChangePin };
}

/** Shared tail of every login path: session, bookkeeping, audit, permissions. */
export async function finishLogin(
  employeeId: string,
  method: 'pin' | 'password' | 'qr',
  context: RequestContext,
  mustChangePin = false,
): Promise<LoginResult> {
  await assertLoginAllowed(employeeId);

  const { session, token } = await issueSession(employeeId, method, context);
  await employeesRepo.recordLogin(employeeId, method);

  const [employee, permissions] = await Promise.all([
    employeesRepo.findById(employeeId),
    permissionsRepo.keysForEmployee(employeeId),
  ]);

  if (!employee) throw new AuthError('server_error');

  await auditRepo.record({
    event:
      method === 'pin'
        ? AuditEvent.loginPinSuccess
        : method === 'password'
          ? AuditEvent.loginPasswordSuccess
          : AuditEvent.loginQrSuccess,
    employeeId,
    sessionId: session.id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { method, permissionCount: permissions.length },
  });

  return { employee, permissions, session, token, mustChangePin: mustChangePin || employee.mustChangePin };
}

/**
 * Writes a new PIN for an employee. Enforces the strength policy and the
 * system-wide uniqueness that PIN-only identification depends on.
 */
export async function setPinFor(
  employeeId: string,
  newPin: string,
  options: { mustChangePin?: boolean; actorId?: string | null; context: RequestContext; event: string },
): Promise<void> {
  assertStrongPin(newPin);

  const lookup = blindIndex(newPin, SecretDomain.pin);
  if (await employeesRepo.pinLookupTaken(lookup, employeeId)) {
    // Two employees sharing a PIN would make PIN-only login ambiguous.
    throw new AuthError('pin_taken');
  }

  const hash = await hashSecret(newPin, SecretDomain.pin);
  const updated = await employeesRepo.setPin(employeeId, hash, lookup, options.mustChangePin ?? false);
  if (!updated) throw new AuthError('not_found');

  await auditRepo.record({
    event: options.event,
    severity: 'warning',
    employeeId,
    actorEmployeeId: options.actorId ?? null,
    ip: options.context.ip,
    userAgent: options.context.userAgent,
    metadata: { mustChangePin: options.mustChangePin ?? false },
  });
}

/** Self-service PIN change: requires the current PIN and drops other sessions. */
export async function changeOwnPin(
  employeeId: string,
  currentPin: string,
  newPin: string,
  context: RequestContext,
  keepSessionId: string,
): Promise<void> {
  const bucket = `pin-change:${employeeId}`;
  const limit = await rateLimitRepo.consume(bucket, 5, 900, 300);
  if (!limit.allowed) throw new AuthError('rate_limited', { retryAfter: limit.retryAfter });

  const credentials = await employeesRepo.findCredentialsById(employeeId);
  if (!credentials || !(await verifySecret(currentPin, credentials.pinHash, SecretDomain.pin))) {
    throw new AuthError('invalid_credentials');
  }

  if (currentPin === newPin) throw new AuthError('weak_pin');

  await setPinFor(employeeId, newPin, {
    context,
    actorId: employeeId,
    event: AuditEvent.pinChanged,
  });

  await rateLimitRepo.reset(bucket);
  // Every other device loses access the moment the credential changes; the
  // caller then rotates the current session so the old token dies too.
  await revokeOtherSessions(employeeId, keepSessionId, 'pin_changed');
}
