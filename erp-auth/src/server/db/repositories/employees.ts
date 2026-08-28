import 'server-only';

import { sql, type Db } from '@/server/db/client';
import { EMPLOYEE_PUBLIC_COLUMNS, type AuthMethod, type Employee, type EmployeeStatus } from '@/server/db/types';

/** Credential columns. Only the auth layer ever sees this shape. */
interface EmployeeCredentials {
  id: string;
  status: EmployeeStatus;
  pinHash: string | null;
  lockedUntil: Date | null;
  mustChangePin: boolean;
}

export async function findById(id: string, db: Db = sql): Promise<Employee | null> {
  const rows = await db<Employee[]>`
    select ${db.unsafe(EMPLOYEE_PUBLIC_COLUMNS)}
    from erp_auth.employees
    where id = ${id}
  `;
  return rows[0] ?? null;
}

export async function findByEmail(email: string, db: Db = sql): Promise<Employee | null> {
  const rows = await db<Employee[]>`
    select ${db.unsafe(EMPLOYEE_PUBLIC_COLUMNS)}
    from erp_auth.employees
    where lower(email) = lower(${email})
  `;
  return rows[0] ?? null;
}

export async function findByAuthUserId(authUserId: string, db: Db = sql): Promise<Employee | null> {
  const rows = await db<Employee[]>`
    select ${db.unsafe(EMPLOYEE_PUBLIC_COLUMNS)}
    from erp_auth.employees
    where auth_user_id = ${authUserId}
  `;
  return rows[0] ?? null;
}

/**
 * Resolves the employee whose PIN blind index matches. The digest still has to
 * be verified afterwards — the index alone is never treated as proof.
 */
export async function findCredentialsByPinLookup(
  pinLookup: string,
  db: Db = sql,
): Promise<EmployeeCredentials | null> {
  const rows = await db<EmployeeCredentials[]>`
    select id, status, pin_hash, locked_until, must_change_pin
    from erp_auth.employees
    where pin_lookup = ${pinLookup}
  `;
  return rows[0] ?? null;
}

export async function findCredentialsById(id: string, db: Db = sql): Promise<EmployeeCredentials | null> {
  const rows = await db<EmployeeCredentials[]>`
    select id, status, pin_hash, locked_until, must_change_pin
    from erp_auth.employees
    where id = ${id}
  `;
  return rows[0] ?? null;
}

export interface EmployeeListFilter {
  search?: string;
  status?: EmployeeStatus;
  limit?: number;
  offset?: number;
}

export async function list(filter: EmployeeListFilter = {}, db: Db = sql): Promise<Employee[]> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const search = filter.search?.trim() ? `%${filter.search.trim()}%` : null;

  return db<Employee[]>`
    select ${db.unsafe(EMPLOYEE_PUBLIC_COLUMNS)}
    from erp_auth.employees
    where (${search}::text is null
           or full_name ilike ${search}
           or employee_code ilike ${search}
           or email ilike ${search})
      and (${filter.status ?? null}::erp_auth.employee_status is null
           or status = ${filter.status ?? null}::erp_auth.employee_status)
    order by is_owner desc, full_name
    limit ${limit} offset ${offset}
  `;
}

export interface CreateEmployeeInput {
  employeeCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  status: EmployeeStatus;
  avatarUrl: string | null;
  pinHash: string | null;
  pinLookup: string | null;
  mustChangePin: boolean;
  authUserId: string | null;
  createdBy: string | null;
}

export async function create(input: CreateEmployeeInput, db: Db = sql): Promise<Employee> {
  const rows = await db<Employee[]>`
    insert into erp_auth.employees
      (employee_code, full_name, email, phone, job_title, status, avatar_url,
       pin_hash, pin_lookup, pin_set_at, must_change_pin, auth_user_id, created_by)
    values
      (${input.employeeCode}, ${input.fullName}, ${input.email}, ${input.phone}, ${input.jobTitle},
       ${input.status}::erp_auth.employee_status, ${input.avatarUrl},
       ${input.pinHash}, ${input.pinLookup}, ${input.pinHash ? new Date() : null},
       ${input.mustChangePin}, ${input.authUserId}, ${input.createdBy})
    returning ${db.unsafe(EMPLOYEE_PUBLIC_COLUMNS)}
  `;
  return rows[0];
}

export interface UpdateEmployeeInput {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  status?: EmployeeStatus;
  avatarUrl?: string | null;
  authUserId?: string | null;
}

export async function update(id: string, input: UpdateEmployeeInput, db: Db = sql): Promise<Employee | null> {
  const rows = await db<Employee[]>`
    update erp_auth.employees
    set full_name    = coalesce(${input.fullName ?? null}, full_name),
        email        = case when ${input.email !== undefined} then ${input.email ?? null} else email end,
        phone        = case when ${input.phone !== undefined} then ${input.phone ?? null} else phone end,
        job_title    = case when ${input.jobTitle !== undefined} then ${input.jobTitle ?? null} else job_title end,
        avatar_url   = case when ${input.avatarUrl !== undefined} then ${input.avatarUrl ?? null} else avatar_url end,
        auth_user_id = case when ${input.authUserId !== undefined} then ${input.authUserId ?? null}::uuid else auth_user_id end,
        status       = coalesce(${input.status ?? null}::erp_auth.employee_status, status),
        -- Re-enabling an account always clears any standing lockout.
        locked_until = case
                         when ${input.status ?? null}::erp_auth.employee_status = 'active' then null
                         else locked_until
                       end,
        failed_attempts = case
                            when ${input.status ?? null}::erp_auth.employee_status = 'active' then 0
                            else failed_attempts
                          end
    where id = ${id}
    returning ${db.unsafe(EMPLOYEE_PUBLIC_COLUMNS)}
  `;
  return rows[0] ?? null;
}

/** Writes new PIN material. The plaintext PIN never reaches this layer. */
export async function setPin(
  id: string,
  pinHash: string,
  pinLookup: string,
  mustChangePin: boolean,
  db: Db = sql,
): Promise<boolean> {
  const rows = await db`
    update erp_auth.employees
    set pin_hash = ${pinHash},
        pin_lookup = ${pinLookup},
        pin_set_at = now(),
        must_change_pin = ${mustChangePin},
        failed_attempts = 0,
        locked_until = null
    where id = ${id}
    returning id
  `;
  return rows.length > 0;
}

export async function clearPin(id: string, db: Db = sql): Promise<boolean> {
  const rows = await db`
    update erp_auth.employees
    set pin_hash = null, pin_lookup = null, pin_set_at = null, must_change_pin = false
    where id = ${id}
    returning id
  `;
  return rows.length > 0;
}

/** True when the PIN is already taken by a different employee. */
export async function pinLookupTaken(pinLookup: string, exceptId: string | null, db: Db = sql): Promise<boolean> {
  const rows = await db`
    select 1 from erp_auth.employees
    where pin_lookup = ${pinLookup}
      and (${exceptId}::uuid is null or id <> ${exceptId}::uuid)
    limit 1
  `;
  return rows.length > 0;
}

export async function recordLogin(id: string, method: AuthMethod, db: Db = sql): Promise<void> {
  await db`
    update erp_auth.employees
    set last_login_at = now(),
        last_login_method = ${method}::erp_auth.auth_method,
        failed_attempts = 0,
        locked_until = null
    where id = ${id}
  `;
}

/**
 * Records a failed attempt for a KNOWN employee (password / OTP paths) and
 * applies a temporary lockout once the threshold is crossed.
 */
export async function registerFailure(
  id: string,
  maxAttempts: number,
  lockSeconds: number,
  db: Db = sql,
): Promise<{ failedAttempts: number; lockedUntil: Date | null }> {
  const rows = await db<{ failedAttempts: number; lockedUntil: Date | null }[]>`
    update erp_auth.employees
    set failed_attempts = failed_attempts + 1,
        locked_until = case
                         when failed_attempts + 1 >= ${maxAttempts}
                           then now() + make_interval(secs => ${lockSeconds})
                         else locked_until
                       end
    where id = ${id}
    returning failed_attempts, locked_until
  `;
  return rows[0] ?? { failedAttempts: 0, lockedUntil: null };
}

export async function setLock(id: string, until: Date | null, db: Db = sql): Promise<void> {
  await db`
    update erp_auth.employees
    set locked_until = ${until},
        failed_attempts = case when ${until} is null then 0 else failed_attempts end
    where id = ${id}
  `;
}

export async function remove(id: string, db: Db = sql): Promise<boolean> {
  const rows = await db`delete from erp_auth.employees where id = ${id} returning id`;
  return rows.length > 0;
}

/** Next free employee code in the EMP-0001 series. */
export async function nextEmployeeCode(db: Db = sql): Promise<string> {
  const rows = await db<{ next: number }[]>`
    select coalesce(max((substring(employee_code from '^EMP-([0-9]+)$'))::integer), 0) + 1 as next
    from erp_auth.employees
    where employee_code ~ '^EMP-[0-9]+$'
  `;
  return `EMP-${String(rows[0]?.next ?? 1).padStart(4, '0')}`;
}

export async function countActiveOwners(db: Db = sql): Promise<number> {
  const rows = await db<{ count: string }[]>`
    select count(*)::text as count from erp_auth.employees where is_owner and status = 'active'
  `;
  return Number.parseInt(rows[0]?.count ?? '0', 10);
}
