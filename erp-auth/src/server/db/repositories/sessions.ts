import 'server-only';

import { sql, type Db } from '@/server/db/client';
import { EMPLOYEE_PUBLIC_COLUMNS, type AuthMethod, type Employee, type Session } from '@/server/db/types';

export interface CreateSessionInput {
  employeeId: string;
  tokenHash: string;
  method: AuthMethod;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  rotatedFrom?: string | null;
}

export async function create(input: CreateSessionInput, db: Db = sql): Promise<Session> {
  const rows = await db<Session[]>`
    insert into erp_auth.sessions
      (employee_id, token_hash, method, expires_at, absolute_expires_at, ip, user_agent, device_label, rotated_from)
    values
      (${input.employeeId}, ${input.tokenHash}, ${input.method}::erp_auth.auth_method,
       ${input.expiresAt}, ${input.absoluteExpiresAt}, ${input.ip}::inet, ${input.userAgent},
       ${input.deviceLabel}, ${input.rotatedFrom ?? null})
    returning id, employee_id, method, created_at, last_seen_at, expires_at,
              absolute_expires_at, revoked_at, revoked_reason, host(ip) as ip, user_agent, device_label
  `;
  return rows[0];
}

export interface ResolvedSession {
  session: Session;
  employee: Employee;
}

/**
 * Looks up a live session by token digest and slides the idle window forward in
 * the same round trip. Returns null for anything expired, revoked, or belonging
 * to an employee who is no longer active.
 */
export async function resolveAndTouch(
  tokenHash: string,
  idleSeconds: number,
  db: Db = sql,
): Promise<ResolvedSession | null> {
  const rows = await db<(Session & { employee: Employee })[]>`
    with live as (
      update erp_auth.sessions s
      set last_seen_at = now(),
          -- Slide the idle window, but never past the absolute ceiling.
          expires_at = least(now() + make_interval(secs => ${idleSeconds}), s.absolute_expires_at)
      where s.token_hash = ${tokenHash}
        and s.revoked_at is null
        and s.expires_at > now()
        and s.absolute_expires_at > now()
        and exists (
          select 1 from erp_auth.employees e
          where e.id = s.employee_id
            and e.status = 'active'
            and (e.locked_until is null or e.locked_until <= now())
        )
      returning s.*
    )
    select live.id, live.employee_id, live.method, live.created_at, live.last_seen_at,
           live.expires_at, live.absolute_expires_at, live.revoked_at, live.revoked_reason,
           host(live.ip) as ip, live.user_agent, live.device_label,
           (select to_jsonb(t) from (select ${db.unsafe(EMPLOYEE_PUBLIC_COLUMNS)}
                                     from erp_auth.employees where id = live.employee_id) t) as employee
    from live
  `;

  const row = rows[0];
  if (!row) return null;

  const { employee, ...session } = row;
  return { session: session as Session, employee: normalizeEmployee(employee) };
}

/** `to_jsonb` returns snake_case keys and ISO strings; bring them back in line. */
function normalizeEmployee(raw: unknown): Employee {
  const row = raw as Record<string, unknown>;
  const date = (value: unknown): Date | null => (value ? new Date(value as string) : null);
  return {
    id: row.id as string,
    employeeCode: row.employee_code as string,
    fullName: row.full_name as string,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    jobTitle: (row.job_title as string | null) ?? null,
    status: row.status as Employee['status'],
    avatarUrl: (row.avatar_url as string | null) ?? null,
    isOwner: row.is_owner === true,
    mustChangePin: row.must_change_pin === true,
    hasPin: row.has_pin === true,
    hasPasswordLogin: row.has_password_login === true,
    isLocked: row.is_locked === true,
    lockedUntil: date(row.locked_until),
    lastLoginAt: date(row.last_login_at),
    lastLoginMethod: (row.last_login_method as Employee['lastLoginMethod']) ?? null,
    createdAt: date(row.created_at) as Date,
    updatedAt: date(row.updated_at) as Date,
  };
}

export async function revokeByTokenHash(tokenHash: string, reason: string, db: Db = sql): Promise<string | null> {
  const rows = await db<{ id: string }[]>`
    update erp_auth.sessions
    set revoked_at = now(), revoked_reason = ${reason}
    where token_hash = ${tokenHash} and revoked_at is null
    returning id
  `;
  return rows[0]?.id ?? null;
}

export async function revokeById(id: string, reason: string, db: Db = sql): Promise<boolean> {
  const rows = await db`
    update erp_auth.sessions
    set revoked_at = now(), revoked_reason = ${reason}
    where id = ${id} and revoked_at is null
    returning id
  `;
  return rows.length > 0;
}

/** Used after a credential reset: every other device is logged out. */
export async function revokeAllForEmployee(
  employeeId: string,
  reason: string,
  exceptSessionId: string | null = null,
  db: Db = sql,
): Promise<number> {
  const rows = await db`
    update erp_auth.sessions
    set revoked_at = now(), revoked_reason = ${reason}
    where employee_id = ${employeeId}
      and revoked_at is null
      and (${exceptSessionId}::uuid is null or id <> ${exceptSessionId}::uuid)
    returning id
  `;
  return rows.length;
}

export async function listForEmployee(employeeId: string, limit = 20, db: Db = sql): Promise<Session[]> {
  return db<Session[]>`
    select id, employee_id, method, created_at, last_seen_at, expires_at, absolute_expires_at,
           revoked_at, revoked_reason, host(ip) as ip, user_agent, device_label
    from erp_auth.sessions
    where employee_id = ${employeeId}
    order by created_at desc
    limit ${Math.min(Math.max(limit, 1), 100)}
  `;
}
