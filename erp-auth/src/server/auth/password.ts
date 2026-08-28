import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { config } from '@/server/config';
import { AuditEvent } from '@/server/audit/events';
import * as auditRepo from '@/server/db/repositories/audit';
import * as employeesRepo from '@/server/db/repositories/employees';
import * as rateLimitRepo from '@/server/db/repositories/rateLimit';
import { finishLogin, type LoginResult } from '@/server/auth/pin';
import { fingerprint } from '@/server/security/crypto';
import { AuthError } from '@/server/security/errors';
import type { RequestContext } from '@/server/security/requestContext';

/**
 * Passwords are Supabase Auth's job. This system never stores, hashes or sees a
 * password — it verifies through Supabase and then issues its own ERP session,
 * so there is exactly one session model in the application.
 */
function supabaseAuthClient() {
  if (!config.supabase.url || !config.supabase.anonKey) {
    throw new AuthError('unavailable');
  }
  return createClient(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Verifies an email + password pair and maps it onto an ERP employee. */
export async function verifyPasswordCredentials(
  email: string,
  password: string,
  context: RequestContext,
): Promise<{ employeeId: string }> {
  if (!config.supabase.passwordLoginEnabled) {
    throw new AuthError('unavailable');
  }

  const perClient = await rateLimitRepo.consume(`pwd:client:${context.clientKey}`, 10, 900, 300);
  const perEmail = await rateLimitRepo.consume(`pwd:email:${fingerprint(email.toLowerCase())}`, 10, 900, 300);

  if (!perClient.allowed || !perEmail.allowed) {
    await auditRepo.record({
      event: AuditEvent.loginBlocked,
      severity: 'warning',
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { method: 'password' },
    });
    throw new AuthError('rate_limited', { retryAfter: Math.max(perClient.retryAfter, perEmail.retryAfter) });
  }

  const supabase = supabaseAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    const known = await employeesRepo.findByEmail(email);
    if (known) {
      // Identity is known here, so a per-account lockout is meaningful.
      await employeesRepo.registerFailure(known.id, config.pin.maxAttemptsPerWindow, config.pin.lockoutSeconds);
    }
    await auditRepo.record({
      event: AuditEvent.loginPasswordFailure,
      severity: 'warning',
      success: false,
      employeeId: known?.id ?? null,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: 'supabase_rejected' },
    });
    throw new AuthError('invalid_credentials');
  }

  // The Supabase session is not needed: this system runs its own. Dropping the
  // reference here keeps the refresh token from lingering in memory.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});

  let employee = await employeesRepo.findByAuthUserId(data.user.id);

  if (!employee) {
    // First password login for an employee whose ERP record was created with an
    // email but not yet linked to an auth user: bind them now.
    const byEmail = await employeesRepo.findByEmail(email);
    if (byEmail) {
      employee = await employeesRepo.update(byEmail.id, { authUserId: data.user.id });
    }
  }

  if (!employee) {
    // A valid Supabase account with no ERP employee behind it is not a login.
    await auditRepo.record({
      event: AuditEvent.loginPasswordFailure,
      severity: 'critical',
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: 'no_employee_record' },
    });
    throw new AuthError('invalid_credentials');
  }

  if (employee.status !== 'active') {
    await auditRepo.record({
      event: AuditEvent.loginDisabled,
      severity: 'warning',
      success: false,
      employeeId: employee.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { status: employee.status },
    });
    throw new AuthError('account_disabled');
  }

  if (employee.isLocked) {
    const retryAfter = employee.lockedUntil
      ? Math.max(1, Math.ceil((employee.lockedUntil.getTime() - Date.now()) / 1000))
      : 60;
    throw new AuthError('account_locked', { retryAfter });
  }

  await rateLimitRepo.reset(`pwd:client:${context.clientKey}`);
  return { employeeId: employee.id };
}

export async function loginWithPassword(
  email: string,
  password: string,
  context: RequestContext,
): Promise<LoginResult> {
  const { employeeId } = await verifyPasswordCredentials(email, password, context);
  return finishLogin(employeeId, 'password', context);
}
