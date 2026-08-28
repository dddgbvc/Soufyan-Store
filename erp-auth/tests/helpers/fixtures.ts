import { randomInt } from 'node:crypto';

import { sql } from '@/server/db/client';
import { blindIndex, hashSecret } from '@/server/security/crypto';
import type { EmployeeStatus } from '@/server/db/types';
import type { RequestContext } from '@/server/security/requestContext';
import { isWeakPin } from '@/server/security/validation';

const createdEmployeeIds: string[] = [];
const usedPins = new Set<string>();

/** A PIN that passes the strength policy and is not already taken in this run. */
export function uniquePin(): string {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!isWeakPin(pin) && !usedPins.has(pin)) {
      usedPins.add(pin);
      return pin;
    }
  }
  throw new Error('Could not generate a unique strong PIN');
}

export interface TestEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  pin: string;
}

export interface CreateTestEmployeeOptions {
  permissions?: string[];
  status?: EmployeeStatus;
  isOwner?: boolean;
  pin?: string | null;
  mustChangePin?: boolean;
  email?: string;
  fullName?: string;
}

let counter = 0;

/** Creates a throwaway employee. Removed again by {@link cleanupFixtures}. */
export async function createTestEmployee(options: CreateTestEmployeeOptions = {}): Promise<TestEmployee> {
  counter += 1;
  const suffix = `${Date.now().toString(36)}${counter}`;
  const employeeCode = `T-${suffix}`.slice(0, 32);
  const email = options.email ?? `test-${suffix}@example.test`;
  const fullName = options.fullName ?? `موظف اختبار ${counter}`;
  const pin = options.pin === null ? null : (options.pin ?? uniquePin());

  const [row] = await sql<{ id: string }[]>`
    insert into erp_auth.employees
      (employee_code, full_name, email, status, is_owner, pin_hash, pin_lookup, pin_set_at, must_change_pin)
    values
      (${employeeCode}, ${fullName}, ${email},
       ${options.status ?? 'active'}::erp_auth.employee_status, ${options.isOwner ?? false},
       ${pin ? await hashSecret(pin, 'pin') : null},
       ${pin ? blindIndex(pin, 'pin') : null},
       ${pin ? new Date() : null},
       ${options.mustChangePin ?? false})
    returning id
  `;

  createdEmployeeIds.push(row.id);

  if (options.permissions?.length) {
    await sql`
      insert into erp_auth.employee_permissions (employee_id, permission_id)
      select ${row.id}, p.id from erp_auth.permissions p where p.key = any(${options.permissions}::text[])
    `;
  }

  return { id: row.id, employeeCode, fullName, email, pin: pin ?? '' };
}

/** A request context with a unique client key, so rate limits never bleed across tests. */
export function testContext(overrides: Partial<RequestContext> = {}): RequestContext {
  counter += 1;
  const unique = `ctx-${Date.now().toString(36)}-${counter}`;
  return {
    ip: '203.0.113.7',
    userAgent: 'vitest',
    origin: 'http://localhost:3000',
    deviceId: `device-${unique}`,
    clientKey: unique,
    ...overrides,
  };
}

export async function cleanupFixtures(): Promise<void> {
  if (createdEmployeeIds.length === 0) return;
  const ids = [...createdEmployeeIds];
  createdEmployeeIds.length = 0;
  // Owner guard: demote before delete so the trigger cannot block teardown.
  await sql`update erp_auth.employees set is_owner = false where id = any(${ids}::uuid[]) and is_owner`;
  await sql`delete from erp_auth.employees where id = any(${ids}::uuid[])`;
}

/** Moves a row's timestamps into the past to simulate the passage of time. */
export async function expireOtpFor(employeeId: string): Promise<void> {
  await sql`
    update erp_auth.otp_requests set expires_at = now() - interval '1 minute'
    where employee_id = ${employeeId} and consumed_at is null
  `;
}

export async function expireChallenge(challengeId: string): Promise<void> {
  await sql`
    update erp_auth.qr_login_challenges set expires_at = now() - interval '1 second'
    where id = ${challengeId}
  `;
}

export async function expireSession(sessionId: string): Promise<void> {
  await sql`
    update erp_auth.sessions set expires_at = now() - interval '1 second'
    where id = ${sessionId}
  `;
}

/** Builds a real AuthzContext by logging the employee in through the PIN path. */
export async function authContextFor(employee: TestEmployee): Promise<import('@/server/authz/guard').AuthzContext> {
  const { loginWithPin } = await import('@/server/auth/pin');
  const result = await loginWithPin(employee.pin, testContext());
  return {
    session: result.session,
    employee: result.employee,
    permissions: result.permissions,
    can: (key: string) => result.permissions.includes(key),
  };
}
