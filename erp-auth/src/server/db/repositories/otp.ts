import 'server-only';

import { sql, type Db } from '@/server/db/client';

export interface OtpRequestRow {
  id: string;
  employeeId: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verifiedAt: Date | null;
  consumedAt: Date | null;
}

export interface CreateOtpInput {
  employeeId: string;
  codeHash: string;
  expiresAt: Date;
  maxAttempts: number;
  ip: string | null;
  userAgent: string | null;
}

export async function create(input: CreateOtpInput, db: Db = sql): Promise<string> {
  // A fresh code invalidates every earlier outstanding one for that employee.
  await db`
    update erp_auth.otp_requests
    set consumed_at = now()
    where employee_id = ${input.employeeId} and consumed_at is null
  `;

  const rows = await db<{ id: string }[]>`
    insert into erp_auth.otp_requests
      (employee_id, code_hash, expires_at, max_attempts, request_ip, request_user_agent)
    values
      (${input.employeeId}, ${input.codeHash}, ${input.expiresAt}, ${input.maxAttempts},
       ${input.ip}::inet, ${input.userAgent})
    returning id
  `;
  return rows[0].id;
}

/**
 * Atomically claims one verification attempt against the newest live OTP for an
 * employee. Returning null means "no attempt was available" — expired, already
 * used, or the attempt budget is spent — and is deliberately indistinguishable
 * from a wrong code at the API boundary.
 */
export async function claimAttempt(employeeId: string, db: Db = sql): Promise<OtpRequestRow | null> {
  const rows = await db<OtpRequestRow[]>`
    update erp_auth.otp_requests o
    set attempts = o.attempts + 1
    where o.id = (
      select id from erp_auth.otp_requests
      where employee_id = ${employeeId}
        and consumed_at is null
        and verified_at is null
        and expires_at > now()
        and attempts < max_attempts
      order by created_at desc
      limit 1
      for update skip locked
    )
    returning o.id, o.employee_id, o.code_hash, o.expires_at, o.attempts, o.max_attempts,
              o.verified_at, o.consumed_at
  `;
  return rows[0] ?? null;
}

/** Marks a correct OTP as verified and attaches the single-use reset handle. */
export async function markVerified(
  id: string,
  resetTokenHash: string,
  resetExpiresAt: Date,
  db: Db = sql,
): Promise<boolean> {
  const rows = await db`
    update erp_auth.otp_requests
    set verified_at = now(),
        reset_token_hash = ${resetTokenHash},
        reset_expires_at = ${resetExpiresAt}
    where id = ${id} and verified_at is null and consumed_at is null
    returning id
  `;
  return rows.length > 0;
}

/**
 * Burns the reset handle. The update is the authorization check: a second call
 * with the same token matches no row, so a reset can never be replayed.
 */
export async function consumeResetToken(
  resetTokenHash: string,
  db: Db = sql,
): Promise<{ id: string; employeeId: string } | null> {
  const rows = await db<{ id: string; employeeId: string }[]>`
    update erp_auth.otp_requests
    set consumed_at = now()
    where reset_token_hash = ${resetTokenHash}
      and consumed_at is null
      and verified_at is not null
      and reset_expires_at > now()
    returning id, employee_id
  `;
  return rows[0] ?? null;
}

/** Invalidates every outstanding OTP for an employee (used after a reset). */
export async function invalidateAll(employeeId: string, db: Db = sql): Promise<number> {
  const rows = await db`
    update erp_auth.otp_requests
    set consumed_at = now()
    where employee_id = ${employeeId} and consumed_at is null
    returning id
  `;
  return rows.length;
}

/** True when the attempt budget of the newest OTP has been exhausted. */
export async function attemptsExhausted(employeeId: string, db: Db = sql): Promise<boolean> {
  const rows = await db<{ exhausted: boolean }[]>`
    select (attempts >= max_attempts) as exhausted
    from erp_auth.otp_requests
    where employee_id = ${employeeId} and consumed_at is null and verified_at is null
    order by created_at desc
    limit 1
  `;
  return rows[0]?.exhausted === true;
}
