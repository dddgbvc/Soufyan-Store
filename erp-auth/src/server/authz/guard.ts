import 'server-only';

import { AuditEvent } from '@/server/audit/events';
import { requireSession, type AuthenticatedSession } from '@/server/auth/session';
import * as auditRepo from '@/server/db/repositories/audit';
import * as permissionsRepo from '@/server/db/repositories/permissions';
import type { Employee, Session } from '@/server/db/types';
import { AuthError } from '@/server/security/errors';
import { getRequestContext } from '@/server/security/requestContext';

export interface AuthzContext {
  session: Session;
  employee: Employee;
  permissions: string[];
  can(key: string): boolean;
}

/**
 * Resolves the caller and loads their effective permissions.
 *
 * An employee who still has to change their PIN is treated as authenticated but
 * not yet authorized: they can only reach the change-PIN endpoints.
 */
export async function requireAuth(options: { allowPendingPinChange?: boolean } = {}): Promise<AuthzContext> {
  const authenticated: AuthenticatedSession = await requireSession();
  const permissions = await permissionsRepo.keysForEmployee(authenticated.employee.id);

  if (authenticated.employee.mustChangePin && !options.allowPendingPinChange) {
    throw new AuthError('forbidden', { details: { reason: 'pin_change_required' } });
  }

  return {
    session: authenticated.session,
    employee: authenticated.employee,
    permissions,
    can: (key: string) => permissions.includes(key),
  };
}

/**
 * Server-side authorization. This — not the hidden navigation item — is what
 * actually protects a capability, and it re-checks against the database rather
 * than trusting the permission list already loaded into memory.
 */
export async function requirePermission(key: string): Promise<AuthzContext> {
  const context = await requireAuth();

  const allowed = await permissionsRepo.hasPermission(context.employee.id, key);
  if (!allowed) {
    const request = await getRequestContext();
    await auditRepo.record({
      event: AuditEvent.authzDenied,
      severity: 'warning',
      success: false,
      employeeId: context.employee.id,
      sessionId: context.session.id,
      ip: request.ip,
      userAgent: request.userAgent,
      metadata: { required: key },
    });
    throw new AuthError('forbidden');
  }

  return context;
}

/** Passes when the caller holds at least one of the listed capabilities. */
export async function requireAnyPermission(keys: string[]): Promise<AuthzContext> {
  const context = await requireAuth();

  for (const key of keys) {
    if (await permissionsRepo.hasPermission(context.employee.id, key)) {
      return context;
    }
  }

  const request = await getRequestContext();
  await auditRepo.record({
    event: AuditEvent.authzDenied,
    severity: 'warning',
    success: false,
    employeeId: context.employee.id,
    sessionId: context.session.id,
    ip: request.ip,
    userAgent: request.userAgent,
    metadata: { requiredAnyOf: keys },
  });
  throw new AuthError('forbidden');
}
