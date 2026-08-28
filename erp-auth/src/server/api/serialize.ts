import 'server-only';

import type { Employee, Module, Session } from '@/server/db/types';
import type { EmployeeSummary, ModuleSummary } from '@/lib/session-types';

/**
 * Converts server row types into the plain JSON shapes the client works with.
 *
 * Doing this explicitly (rather than leaning on structured cloning) keeps the
 * boundary honest: whatever is not listed here never reaches the browser.
 */
export function toEmployeeSummary(employee: Employee): EmployeeSummary {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    email: employee.email,
    phone: employee.phone,
    jobTitle: employee.jobTitle,
    status: employee.status,
    avatarUrl: employee.avatarUrl,
    isOwner: employee.isOwner,
    mustChangePin: employee.mustChangePin,
    hasPin: employee.hasPin,
    hasPasswordLogin: employee.hasPasswordLogin,
    isLocked: employee.isLocked,
    lockedUntil: employee.lockedUntil?.toISOString() ?? null,
    lastLoginAt: employee.lastLoginAt?.toISOString() ?? null,
    lastLoginMethod: employee.lastLoginMethod,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

export function toModuleSummary(module: Module): ModuleSummary {
  return {
    key: module.key,
    name: module.name,
    description: module.description,
    icon: module.icon,
    route: module.route,
    sortOrder: module.sortOrder,
    isAdmin: module.isAdmin,
  };
}

export interface SessionSummary {
  id: string;
  method: Session['method'];
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  ip: string | null;
  deviceLabel: string | null;
  /**
   * Whether the session can still be used. Decided here rather than in the
   * browser: the server owns the clock, and a client comparing timestamps
   * during render would be reading an impure value anyway.
   */
  isLive: boolean;
}

export function toSessionSummary(session: Session): SessionSummary {
  return {
    id: session.id,
    method: session.method,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    revokedAt: session.revokedAt?.toISOString() ?? null,
    revokedReason: session.revokedReason,
    ip: session.ip,
    deviceLabel: session.deviceLabel,
    isLive: session.revokedAt === null && session.expiresAt.getTime() > Date.now(),
  };
}
