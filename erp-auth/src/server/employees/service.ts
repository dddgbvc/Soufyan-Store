import 'server-only';

import { AuditEvent } from '@/server/audit/events';
import { setPinFor } from '@/server/auth/pin';
import { revokeAllSessions } from '@/server/auth/session';
import type { AuthzContext } from '@/server/authz/guard';
import * as auditRepo from '@/server/db/repositories/audit';
import * as employeesRepo from '@/server/db/repositories/employees';
import * as permissionsRepo from '@/server/db/repositories/permissions';
import type { Employee, EmployeeStatus } from '@/server/db/types';
import { AuthError } from '@/server/security/errors';
import type { RequestContext } from '@/server/security/requestContext';

export interface EmployeeDetail {
  employee: Employee;
  permissions: string[];
}

/**
 * Only an owner may act on another owner. Without this, anybody holding
 * `employees.update` could disable the account that governs the whole system.
 */
function assertMayTouch(actor: AuthzContext, target: Employee): void {
  if (target.isOwner && !actor.employee.isOwner) {
    throw new AuthError('forbidden');
  }
}

export async function getEmployee(id: string): Promise<EmployeeDetail> {
  const employee = await employeesRepo.findById(id);
  if (!employee) throw new AuthError('not_found');
  const permissions = await permissionsRepo.explicitKeysForEmployee(id);
  return { employee, permissions };
}

export interface CreateEmployeeRequest {
  fullName: string;
  employeeCode?: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  status?: EmployeeStatus;
  /** Optional starting PIN. The employee is forced to replace it on first login. */
  initialPin?: string | null;
  permissions?: string[];
}

export async function createEmployee(
  input: CreateEmployeeRequest,
  actor: AuthzContext,
  context: RequestContext,
): Promise<EmployeeDetail> {
  const employeeCode = input.employeeCode?.trim() || (await employeesRepo.nextEmployeeCode());

  let employee: Employee;
  try {
    employee = await employeesRepo.create({
      employeeCode,
      fullName: input.fullName.trim(),
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      jobTitle: input.jobTitle?.trim() || null,
      status: input.status ?? 'active',
      avatarUrl: null,
      pinHash: null,
      pinLookup: null,
      mustChangePin: false,
      authUserId: null,
      createdBy: actor.employee.id,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AuthError('conflict');
    throw error;
  }

  if (input.initialPin) {
    // Written through the same policy-checked path as any other PIN change.
    await setPinFor(employee.id, input.initialPin, {
      context,
      actorId: actor.employee.id,
      mustChangePin: true,
      event: AuditEvent.pinAssigned,
    });
  }

  if (input.permissions?.length) {
    await permissionsRepo.replaceForEmployee(employee.id, input.permissions, actor.employee.id);
  }

  await auditRepo.record({
    event: AuditEvent.employeeCreated,
    severity: 'warning',
    employeeId: employee.id,
    actorEmployeeId: actor.employee.id,
    sessionId: actor.session.id,
    ip: context.ip,
    userAgent: context.userAgent,
    targetType: 'employee',
    targetId: employee.id,
    metadata: {
      employeeCode,
      withInitialPin: Boolean(input.initialPin),
      permissionCount: input.permissions?.length ?? 0,
    },
  });

  return getEmployee(employee.id);
}

export interface UpdateEmployeeRequest {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  status?: EmployeeStatus;
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeRequest,
  actor: AuthzContext,
  context: RequestContext,
): Promise<EmployeeDetail> {
  const existing = await employeesRepo.findById(id);
  if (!existing) throw new AuthError('not_found');
  assertMayTouch(actor, existing);

  if (input.status && input.status !== 'active' && existing.id === actor.employee.id) {
    // Disabling yourself would immediately end the session doing the disabling.
    throw new AuthError('forbidden', { details: { reason: 'cannot_disable_self' } });
  }

  let updated: Employee | null;
  try {
    updated = await employeesRepo.update(id, input);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AuthError('conflict');
    if (isRestrictViolation(error)) throw new AuthError('forbidden', { details: { reason: 'last_owner' } });
    throw error;
  }
  if (!updated) throw new AuthError('not_found');

  // A deactivated employee must lose every live session immediately.
  if (input.status && input.status !== 'active') {
    await revokeAllSessions(id, `status_${input.status}`);
  }

  await auditRepo.record({
    event:
      input.status === 'active' && existing.status !== 'active'
        ? AuditEvent.employeeEnabled
        : input.status && input.status !== 'active'
          ? AuditEvent.employeeDisabled
          : AuditEvent.employeeUpdated,
    severity: 'warning',
    employeeId: id,
    actorEmployeeId: actor.employee.id,
    sessionId: actor.session.id,
    ip: context.ip,
    userAgent: context.userAgent,
    targetType: 'employee',
    targetId: id,
    metadata: { fields: Object.keys(input), status: input.status ?? existing.status },
  });

  return getEmployee(id);
}

export async function deleteEmployee(id: string, actor: AuthzContext, context: RequestContext): Promise<void> {
  const existing = await employeesRepo.findById(id);
  if (!existing) throw new AuthError('not_found');
  assertMayTouch(actor, existing);

  if (existing.id === actor.employee.id) {
    throw new AuthError('forbidden', { details: { reason: 'cannot_delete_self' } });
  }

  try {
    const removed = await employeesRepo.remove(id);
    if (!removed) throw new AuthError('not_found');
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (isRestrictViolation(error)) throw new AuthError('forbidden', { details: { reason: 'last_owner' } });
    throw error;
  }

  await auditRepo.record({
    event: AuditEvent.employeeDeleted,
    severity: 'critical',
    actorEmployeeId: actor.employee.id,
    sessionId: actor.session.id,
    ip: context.ip,
    userAgent: context.userAgent,
    targetType: 'employee',
    targetId: id,
    metadata: { employeeCode: existing.employeeCode, fullName: existing.fullName },
  });
}

/**
 * Replaces an employee's grants. Editing your own permission set is refused
 * outright: that is the one path by which a limited admin could bootstrap
 * themselves to full control.
 */
export async function setPermissions(
  id: string,
  keys: string[],
  actor: AuthzContext,
  context: RequestContext,
): Promise<EmployeeDetail> {
  const existing = await employeesRepo.findById(id);
  if (!existing) throw new AuthError('not_found');
  assertMayTouch(actor, existing);

  if (id === actor.employee.id && !actor.employee.isOwner) {
    throw new AuthError('forbidden', { details: { reason: 'cannot_edit_own_permissions' } });
  }

  let diff: { added: string[]; removed: string[] };
  try {
    diff = await permissionsRepo.replaceForEmployee(id, keys, actor.employee.id);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unknown permission keys')) {
      throw new AuthError('invalid_request');
    }
    throw error;
  }

  await auditRepo.record({
    event: AuditEvent.permissionsChanged,
    severity: 'critical',
    employeeId: id,
    actorEmployeeId: actor.employee.id,
    sessionId: actor.session.id,
    ip: context.ip,
    userAgent: context.userAgent,
    targetType: 'employee',
    targetId: id,
    metadata: { added: diff.added, removed: diff.removed, total: keys.length },
  });

  return getEmployee(id);
}

/** Admin-assigned PIN. Always marked as "must change on first login". */
export async function assignPin(
  id: string,
  pin: string,
  actor: AuthzContext,
  context: RequestContext,
): Promise<void> {
  const existing = await employeesRepo.findById(id);
  if (!existing) throw new AuthError('not_found');
  assertMayTouch(actor, existing);

  await setPinFor(id, pin, {
    context,
    actorId: actor.employee.id,
    mustChangePin: true,
    event: AuditEvent.pinAssigned,
  });

  // The employee re-authenticates everywhere with the new credential.
  await revokeAllSessions(id, 'pin_assigned');
}

function pgErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === '23505';
}

function isRestrictViolation(error: unknown): boolean {
  const code = pgErrorCode(error);
  return code === '23001' || code === 'P0001';
}
