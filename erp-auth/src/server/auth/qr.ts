import 'server-only';

import { config } from '@/server/config';
import { AuditEvent } from '@/server/audit/events';
import * as auditRepo from '@/server/db/repositories/audit';
import * as qrRepo from '@/server/db/repositories/qr';
import * as rateLimitRepo from '@/server/db/repositories/rateLimit';
import type { QrStatus } from '@/server/db/types';
import { finishLogin, verifyPinCredentials, type LoginResult } from '@/server/auth/pin';
import { verifyPasswordCredentials } from '@/server/auth/password';
import { generateToken, hashToken } from '@/server/security/crypto';
import { AuthError } from '@/server/security/errors';
import type { RequestContext } from '@/server/security/requestContext';

/** Seconds a challenge stays alive after approval so the desktop can collect it. */
const APPROVAL_GRACE_SECONDS = 60;

export interface CreatedChallenge {
  challengeId: string;
  /** Goes into the QR image only. Never persisted client-side. */
  token: string;
  /** Held in memory by the originating tab; proves "I am the screen that asked". */
  pollSecret: string;
  expiresAt: string;
  /** The URL encoded in the QR. The token rides in the fragment, never the path. */
  url: string;
}

/**
 * Creates a one-time login challenge.
 *
 * Three independent secrets are involved and no single one is enough:
 *   • `token`      — shown as a QR, proves the phone actually saw this screen
 *   • `pollSecret` — returned to the desktop tab, proves it owns the challenge
 *   • device cookie — binds the challenge to the browser that created it
 *
 * The QR therefore carries no email, no employee id, no PIN and no credential
 * of any kind: only a random handle that is useless without the other two.
 */
export async function createChallenge(context: RequestContext): Promise<CreatedChallenge> {
  const limit = await rateLimitRepo.consume(`qr-create:${context.clientKey}`, 10, 300, 120);
  if (!limit.allowed) throw new AuthError('rate_limited', { retryAfter: limit.retryAfter });

  const token = generateToken(32);
  const pollSecret = generateToken(32);
  const expiresAt = new Date(Date.now() + config.qr.ttlSeconds * 1000);

  const challenge = await qrRepo.create({
    tokenHash: hashToken(token),
    pollSecretHash: hashToken(pollSecret),
    deviceBindingHash: hashToken(context.deviceId),
    expiresAt,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  await auditRepo.record({
    event: AuditEvent.qrCreated,
    ip: context.ip,
    userAgent: context.userAgent,
    targetType: 'qr_challenge',
    targetId: challenge.id,
    metadata: { ttlSeconds: config.qr.ttlSeconds },
  });

  return {
    challengeId: challenge.id,
    token,
    pollSecret,
    expiresAt: expiresAt.toISOString(),
    url: `${config.appUrl}/approve#t=${token}`,
  };
}

export interface ChallengePreview {
  status: QrStatus;
  expiresAt: string;
  secondsRemaining: number;
}

/** What the scanning phone is allowed to know before it authenticates. */
export async function inspectChallenge(token: string, context: RequestContext): Promise<ChallengePreview> {
  const limit = await rateLimitRepo.consume(`qr-scan:${context.clientKey}`, 30, 300, 120);
  if (!limit.allowed) throw new AuthError('rate_limited', { retryAfter: limit.retryAfter });

  const challenge = await qrRepo.findByTokenHashForScan(hashToken(token));
  if (!challenge) throw new AuthError('qr_invalid');

  const expired = challenge.status === 'expired' || challenge.expiresAt.getTime() <= Date.now();
  if (expired && challenge.status !== 'consumed') {
    await auditRepo.record({
      event: AuditEvent.qrExpired,
      severity: 'info',
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      targetType: 'qr_challenge',
      targetId: challenge.id,
      metadata: { stage: 'scan' },
    });
    throw new AuthError('qr_expired');
  }

  if (challenge.status !== 'pending') {
    // Already approved, consumed or revoked: never reusable.
    throw new AuthError('qr_invalid');
  }

  await auditRepo.record({
    event: AuditEvent.qrScanned,
    ip: context.ip,
    userAgent: context.userAgent,
    targetType: 'qr_challenge',
    targetId: challenge.id,
    metadata: { scanCount: challenge.scanCount },
  });

  return {
    status: challenge.status,
    expiresAt: challenge.expiresAt.toISOString(),
    secondsRemaining: Math.max(0, Math.round((challenge.expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export type ApprovalCredentials =
  | { method: 'pin'; pin: string }
  | { method: 'password'; email: string; password: string };

/**
 * The phone authenticates its own holder, then vouches for the waiting screen.
 * Credentials are verified in full — the QR grants nothing on its own.
 */
export async function approveChallenge(
  token: string,
  credentials: ApprovalCredentials,
  context: RequestContext,
): Promise<{ challengeId: string; employeeId: string }> {
  const limit = await rateLimitRepo.consume(`qr-approve:${context.clientKey}`, 10, 300, 300);
  if (!limit.allowed) throw new AuthError('rate_limited', { retryAfter: limit.retryAfter });

  const tokenHash = hashToken(token);

  const employeeId =
    credentials.method === 'pin'
      ? (await verifyPinCredentials(credentials.pin, context)).employeeId
      : (await verifyPasswordCredentials(credentials.email, credentials.password, context)).employeeId;

  const approved = await qrRepo.approve(
    tokenHash,
    employeeId,
    credentials.method,
    APPROVAL_GRACE_SECONDS,
    context.ip,
    context.userAgent,
  );

  if (!approved) {
    // Expired, revoked, already approved, or simply unknown — all one answer.
    await auditRepo.record({
      event: AuditEvent.qrRejected,
      severity: 'warning',
      success: false,
      employeeId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: 'not_pending_or_expired' },
    });
    throw new AuthError('qr_expired');
  }

  await auditRepo.record({
    event: AuditEvent.qrApproved,
    severity: 'warning',
    employeeId,
    ip: context.ip,
    userAgent: context.userAgent,
    targetType: 'qr_challenge',
    targetId: approved.id,
    metadata: { via: credentials.method },
  });

  return { challengeId: approved.id, employeeId };
}

export interface ChallengeStatus {
  status: QrStatus;
  secondsRemaining: number;
}

/** Poll endpoint for the waiting screen. Requires poll secret + device cookie. */
export async function getChallengeStatus(
  challengeId: string,
  pollSecret: string,
  context: RequestContext,
): Promise<ChallengeStatus> {
  const challenge = await qrRepo.statusFor(challengeId, hashToken(pollSecret), hashToken(context.deviceId));
  if (!challenge) throw new AuthError('qr_invalid');

  return {
    status: challenge.status,
    secondsRemaining: Math.max(0, Math.round((challenge.expiresAt.getTime() - Date.now()) / 1000)),
  };
}

/**
 * Redeems an approved challenge exactly once. The `approved → consumed`
 * transition happens in a single conditional UPDATE, so two racing requests
 * cannot both walk away with a session.
 */
export async function consumeChallenge(
  challengeId: string,
  pollSecret: string,
  context: RequestContext,
): Promise<LoginResult> {
  const consumed = await qrRepo.consume(challengeId, hashToken(pollSecret), hashToken(context.deviceId));

  if (!consumed || !consumed.employeeId) {
    await auditRepo.record({
      event: AuditEvent.qrRejected,
      severity: 'warning',
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      targetType: 'qr_challenge',
      targetId: challengeId,
      metadata: { reason: 'not_approved_or_already_consumed' },
    });
    throw new AuthError('qr_expired');
  }

  const result = await finishLogin(consumed.employeeId, 'qr', context);
  await qrRepo.attachSession(consumed.id, result.session.id);

  await auditRepo.record({
    event: AuditEvent.qrConsumed,
    employeeId: consumed.employeeId,
    sessionId: result.session.id,
    ip: context.ip,
    userAgent: context.userAgent,
    targetType: 'qr_challenge',
    targetId: consumed.id,
    metadata: {},
  });

  return result;
}

export async function revokeChallenge(
  challengeId: string,
  pollSecret: string,
  context: RequestContext,
  reason = 'user_cancelled',
): Promise<void> {
  const revoked = await qrRepo.revoke(challengeId, hashToken(pollSecret), hashToken(context.deviceId), reason);
  if (!revoked) throw new AuthError('qr_invalid');

  await auditRepo.record({
    event: AuditEvent.qrRevoked,
    severity: 'info',
    ip: context.ip,
    userAgent: context.userAgent,
    targetType: 'qr_challenge',
    targetId: challengeId,
    metadata: { reason },
  });
}
