import 'server-only';

import { sql, type Db } from '@/server/db/client';
import type { AuthMethod, QrChallenge, QrStatus } from '@/server/db/types';

export interface CreateChallengeInput {
  tokenHash: string;
  pollSecretHash: string;
  deviceBindingHash: string;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
}

export async function create(input: CreateChallengeInput, db: Db = sql): Promise<QrChallenge> {
  const rows = await db<QrChallenge[]>`
    insert into erp_auth.qr_login_challenges
      (token_hash, poll_secret_hash, device_binding_hash, expires_at, created_ip, created_user_agent)
    values
      (${input.tokenHash}, ${input.pollSecretHash}, ${input.deviceBindingHash},
       ${input.expiresAt}, ${input.ip}::inet, ${input.userAgent})
    returning id, status, employee_id, approved_via, created_at, expires_at,
              approved_at, consumed_at, scan_count
  `;
  return rows[0];
}

/**
 * Reads a challenge by the token embedded in the QR image and counts the scan.
 * Expiry is evaluated here rather than trusted from the stored status, which a
 * background job may not have caught up with yet.
 */
export async function findByTokenHashForScan(tokenHash: string, db: Db = sql): Promise<QrChallenge | null> {
  const rows = await db<QrChallenge[]>`
    update erp_auth.qr_login_challenges
    set scan_count = scan_count + 1,
        status = case when status = 'pending' and expires_at <= now() then 'expired' else status end
    where token_hash = ${tokenHash}
    returning id, status, employee_id, approved_via, created_at, expires_at,
              approved_at, consumed_at, scan_count
  `;
  return rows[0] ?? null;
}

/**
 * Approves a pending, unexpired challenge in one atomic step. A second approval
 * (or an approval of an expired challenge) matches no row and returns null.
 *
 * Approval also extends the deadline by a short grace window so the waiting
 * device has time to collect its session before the challenge lapses.
 */
export async function approve(
  tokenHash: string,
  employeeId: string,
  via: AuthMethod,
  graceSeconds: number,
  ip: string | null,
  userAgent: string | null,
  db: Db = sql,
): Promise<QrChallenge | null> {
  const rows = await db<QrChallenge[]>`
    update erp_auth.qr_login_challenges
    set status = 'approved',
        employee_id = ${employeeId},
        approved_via = ${via}::erp_auth.auth_method,
        approved_at = now(),
        approved_ip = ${ip}::inet,
        approved_user_agent = ${userAgent},
        expires_at = greatest(expires_at, now() + make_interval(secs => ${graceSeconds}))
    where token_hash = ${tokenHash}
      and status = 'pending'
      and expires_at > now()
    returning id, status, employee_id, approved_via, created_at, expires_at,
              approved_at, consumed_at, scan_count
  `;
  return rows[0] ?? null;
}

/**
 * Single-use consumption. The state transition IS the mutual exclusion: only
 * the first caller to flip `approved` to `consumed` gets a row back.
 */
export async function consume(
  id: string,
  pollSecretHash: string,
  deviceBindingHash: string,
  db: Db = sql,
): Promise<QrChallenge | null> {
  const rows = await db<QrChallenge[]>`
    update erp_auth.qr_login_challenges
    set status = 'consumed', consumed_at = now()
    where id = ${id}
      and status = 'approved'
      and expires_at > now()
      and poll_secret_hash = ${pollSecretHash}
      and device_binding_hash = ${deviceBindingHash}
    returning id, status, employee_id, approved_via, created_at, expires_at,
              approved_at, consumed_at, scan_count
  `;
  return rows[0] ?? null;
}

export async function attachSession(id: string, sessionId: string, db: Db = sql): Promise<void> {
  await db`update erp_auth.qr_login_challenges set session_id = ${sessionId} where id = ${id}`;
}

/**
 * Status poll for the waiting device. Requires the poll secret AND the device
 * binding cookie, so a leaked challenge id alone tells an attacker nothing.
 */
export async function statusFor(
  id: string,
  pollSecretHash: string,
  deviceBindingHash: string,
  db: Db = sql,
): Promise<QrChallenge | null> {
  const rows = await db<QrChallenge[]>`
    update erp_auth.qr_login_challenges
    set status = case when status = 'pending' and expires_at <= now() then 'expired' else status end
    where id = ${id}
      and poll_secret_hash = ${pollSecretHash}
      and device_binding_hash = ${deviceBindingHash}
    returning id, status, employee_id, approved_via, created_at, expires_at,
              approved_at, consumed_at, scan_count
  `;
  return rows[0] ?? null;
}

export async function revoke(
  id: string,
  pollSecretHash: string,
  deviceBindingHash: string,
  reason: string,
  db: Db = sql,
): Promise<boolean> {
  const rows = await db`
    update erp_auth.qr_login_challenges
    set status = 'revoked', revoked_at = now(), revoked_reason = ${reason}
    where id = ${id}
      and status in ('pending', 'approved')
      and poll_secret_hash = ${pollSecretHash}
      and device_binding_hash = ${deviceBindingHash}
    returning id
  `;
  return rows.length > 0;
}

export async function expireStale(db: Db = sql): Promise<number> {
  const rows = await db`
    update erp_auth.qr_login_challenges
    set status = 'expired'
    where status = 'pending' and expires_at <= now()
    returning id
  `;
  return rows.length;
}

export type { QrStatus };
