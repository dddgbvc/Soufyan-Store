import 'server-only';

export type EmployeeStatus = 'active' | 'disabled' | 'suspended';
export type AuthMethod = 'pin' | 'password' | 'qr';
export type QrStatus = 'pending' | 'approved' | 'consumed' | 'expired' | 'revoked';
export type AuditSeverity = 'info' | 'warning' | 'critical';

/** Employee record WITHOUT credential material. This is what the app passes around. */
export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  status: EmployeeStatus;
  avatarUrl: string | null;
  isOwner: boolean;
  mustChangePin: boolean;
  hasPin: boolean;
  hasPasswordLogin: boolean;
  isLocked: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  lastLoginMethod: AuthMethod | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Module {
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  route: string | null;
  sortOrder: number;
  isAdmin: boolean;
}

export interface Permission {
  id: string;
  key: string;
  module: string;
  action: string;
  name: string;
  description: string | null;
  isDangerous: boolean;
  sortOrder: number;
}

export interface Session {
  id: string;
  employeeId: string;
  method: AuthMethod;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  ip: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
}

export interface QrChallenge {
  id: string;
  status: QrStatus;
  employeeId: string | null;
  approvedVia: AuthMethod | null;
  createdAt: Date;
  expiresAt: Date;
  approvedAt: Date | null;
  consumedAt: Date | null;
  scanCount: number;
}

export interface AuditEntry {
  id: string;
  event: string;
  severity: AuditSeverity;
  success: boolean;
  employeeId: string | null;
  actorEmployeeId: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/** Columns selected whenever an employee crosses a trust boundary. */
export const EMPLOYEE_PUBLIC_COLUMNS = `
  id, employee_code, full_name, email, phone, job_title, status, avatar_url,
  is_owner, must_change_pin,
  (pin_hash is not null) as has_pin,
  (auth_user_id is not null) as has_password_login,
  (locked_until is not null and locked_until > now()) as is_locked,
  locked_until, last_login_at, last_login_method, created_at, updated_at
`;
