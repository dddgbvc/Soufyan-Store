import 'server-only';

import { config } from '@/server/config';
import { AuditEvent } from '@/server/audit/events';
import { withTransaction } from '@/server/db/client';
import * as auditRepo from '@/server/db/repositories/audit';
import * as employeesRepo from '@/server/db/repositories/employees';
import * as otpRepo from '@/server/db/repositories/otp';
import * as rateLimitRepo from '@/server/db/repositories/rateLimit';
import { revokeAllSessions } from '@/server/auth/session';
import { getMailer } from '@/server/mail/mailer';
import { pinResetOtpMail } from '@/server/mail/templates';
import {
  SecretDomain,
  blindIndex,
  fingerprint,
  generateNumericCode,
  generateToken,
  hashSecret,
  hashToken,
  verifySecret,
} from '@/server/security/crypto';
import { AuthError } from '@/server/security/errors';
import type { RequestContext } from '@/server/security/requestContext';
import { assertStrongPin } from '@/server/security/validation';

/**
 * Pre-computed digest used to keep the "no such employee" and "no live code"
 * paths as slow as a real verification. Without it, response time would say
 * whether an address belongs to somebody — undoing the uniform answers that
 * the request step works so hard to give.
 */
let decoyDigest: Promise<string> | null = null;
function decoy(): Promise<string> {
  decoyDigest ??= hashSecret('000000', SecretDomain.otp);
  return decoyDigest;
}

export interface OtpRequestResult {
  /** Always the same shape, whether or not the email belongs to anybody. */
  expiresInSeconds: number;
}

/**
 * Step 1 of PIN recovery.
 *
 * The response is deliberately identical for known and unknown addresses: an
 * attacker cannot use this endpoint to learn who works here. Everything that
 * differs (sending mail, writing a row) happens silently on the server.
 */
export async function requestOtp(email: string, context: RequestContext): Promise<OtpRequestResult> {
  const emailKey = fingerprint(email.toLowerCase());

  // Two independent buckets: one stops a single client hammering many
  // addresses, the other stops many clients hammering a single address.
  const perClient = await rateLimitRepo.consume(
    `otp-req:client:${context.clientKey}`,
    config.otp.maxRequestsPerHour,
    3600,
    600,
  );
  const perEmail = await rateLimitRepo.consume(`otp-req:email:${emailKey}`, config.otp.maxRequestsPerHour, 3600, 600);

  if (!perClient.allowed || !perEmail.allowed) {
    await auditRepo.record({
      event: AuditEvent.otpBlocked,
      severity: 'warning',
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { stage: 'request' },
    });
    // Even the throttle response stays uniform in shape.
    throw new AuthError('rate_limited', {
      retryAfter: Math.max(perClient.retryAfter, perEmail.retryAfter),
    });
  }

  const employee = await employeesRepo.findByEmail(email);

  if (employee && employee.status === 'active' && employee.email) {
    const code = generateNumericCode(config.otp.length);
    const codeHash = await hashSecret(code, SecretDomain.otp);
    const expiresAt = new Date(Date.now() + config.otp.ttlSeconds * 1000);

    await otpRepo.create({
      employeeId: employee.id,
      codeHash,
      expiresAt,
      maxAttempts: config.otp.maxAttempts,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    try {
      await getMailer().send(pinResetOtpMail(employee.email, code, Math.round(config.otp.ttlSeconds / 60)));
    } catch (error) {
      // Never surface delivery failures to the caller — that would confirm the
      // address exists. Operators see it in the audit trail instead.
      await auditRepo.record({
        event: AuditEvent.otpRequested,
        severity: 'critical',
        success: false,
        employeeId: employee.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { delivery: 'failed', reason: error instanceof Error ? error.name : 'unknown' },
      });
      return { expiresInSeconds: config.otp.ttlSeconds };
    }

    await auditRepo.record({
      event: AuditEvent.otpRequested,
      employeeId: employee.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { purpose: 'pin_reset', ttlSeconds: config.otp.ttlSeconds },
    });
  } else {
    await auditRepo.record({
      event: AuditEvent.otpRequested,
      severity: 'info',
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { purpose: 'pin_reset', outcome: 'no_matching_active_account' },
    });
  }

  return { expiresInSeconds: config.otp.ttlSeconds };
}

export interface OtpVerifyResult {
  resetToken: string;
  expiresInSeconds: number;
}

/**
 * Step 2. A correct code is exchanged for a single-use, short-lived reset
 * handle; the code itself is never accepted twice.
 */
export async function verifyOtp(email: string, code: string, context: RequestContext): Promise<OtpVerifyResult> {
  const limit = await rateLimitRepo.consume(`otp-verify:${context.clientKey}`, config.otp.maxAttempts * 2, 900, 600);
  if (!limit.allowed) {
    await auditRepo.record({
      event: AuditEvent.otpBlocked,
      severity: 'warning',
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { stage: 'verify' },
    });
    throw new AuthError('rate_limited', { retryAfter: limit.retryAfter });
  }

  const employee = await employeesRepo.findByEmail(email);
  if (!employee || employee.status !== 'active') {
    await verifySecret(code, await decoy(), SecretDomain.otp);
    throw new AuthError('otp_invalid');
  }

  // Claiming the attempt is atomic: a burned budget cannot be retried by
  // racing two requests through at once.
  const request = await otpRepo.claimAttempt(employee.id);
  if (!request) {
    await verifySecret(code, await decoy(), SecretDomain.otp);
    await auditRepo.record({
      event: AuditEvent.otpFailed,
      severity: 'warning',
      success: false,
      employeeId: employee.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: 'no_live_request_or_attempts_exhausted' },
    });
    throw new AuthError('otp_invalid');
  }

  const valid = await verifySecret(code, request.codeHash, SecretDomain.otp);
  if (!valid) {
    await auditRepo.record({
      event: AuditEvent.otpFailed,
      severity: 'warning',
      success: false,
      employeeId: employee.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { attempt: request.attempts, maxAttempts: request.maxAttempts },
    });
    throw new AuthError('otp_invalid');
  }

  const resetToken = generateToken(32);
  const resetExpiresAt = new Date(Date.now() + config.otp.resetTokenTtlSeconds * 1000);
  const marked = await otpRepo.markVerified(request.id, hashToken(resetToken), resetExpiresAt);
  if (!marked) throw new AuthError('otp_invalid');

  await auditRepo.record({
    event: AuditEvent.otpVerified,
    employeeId: employee.id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { attempt: request.attempts },
  });

  return { resetToken, expiresInSeconds: config.otp.resetTokenTtlSeconds };
}

/**
 * Step 3. Burns the reset handle and installs the new PIN. Every existing
 * session for that employee dies, because a recovery may well mean the old
 * credential was in the wrong hands.
 *
 * Consuming the handle and writing the PIN happen in one transaction: if the
 * new PIN turns out to be unusable, the rollback leaves the handle valid so a
 * typo does not cost the employee the whole recovery journey.
 */
export async function resetPinWithToken(
  resetToken: string,
  newPin: string,
  context: RequestContext,
): Promise<{ employeeId: string }> {
  const limit = await rateLimitRepo.consume(`otp-reset:${context.clientKey}`, 10, 900, 600);
  if (!limit.allowed) throw new AuthError('rate_limited', { retryAfter: limit.retryAfter });

  // Cheap policy check first, so a weak PIN never reaches the token at all.
  assertStrongPin(newPin);

  // The slow KDF runs outside the transaction; holding a connection for it
  // would serialise every other reset behind this one.
  const pinLookup = blindIndex(newPin, SecretDomain.pin);
  const pinHash = await hashSecret(newPin, SecretDomain.pin);

  const employeeId = await withTransaction(async (tx) => {
    const consumed = await otpRepo.consumeResetToken(hashToken(resetToken), tx);
    if (!consumed) throw new AuthError('otp_invalid');

    if (await employeesRepo.pinLookupTaken(pinLookup, consumed.employeeId, tx)) {
      // Rolls back the consumption: the employee can retry with another PIN.
      throw new AuthError('pin_taken');
    }

    const written = await employeesRepo.setPin(consumed.employeeId, pinHash, pinLookup, false, tx);
    if (!written) throw new AuthError('not_found');

    await otpRepo.invalidateAll(consumed.employeeId, tx);
    await auditRepo.record(
      {
        event: AuditEvent.pinReset,
        severity: 'warning',
        employeeId: consumed.employeeId,
        actorEmployeeId: consumed.employeeId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { via: 'email_otp' },
      },
      tx,
    );

    return consumed.employeeId;
  });

  await revokeAllSessions(employeeId, 'pin_reset');

  return { employeeId };
}
