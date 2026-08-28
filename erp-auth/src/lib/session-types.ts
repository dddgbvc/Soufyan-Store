/** Shapes shared between the API responses and the client. */

export interface EmployeeSummary {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  status: 'active' | 'disabled' | 'suspended';
  avatarUrl: string | null;
  isOwner: boolean;
  mustChangePin: boolean;
  hasPin: boolean;
  hasPasswordLogin: boolean;
  isLocked: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  lastLoginMethod: 'pin' | 'password' | 'qr' | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleSummary {
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  route: string | null;
  sortOrder: number;
  isAdmin: boolean;
}

export interface PermissionSummary {
  id: string;
  key: string;
  module: string;
  action: string;
  name: string;
  description: string | null;
  isDangerous: boolean;
  sortOrder: number;
}

/** Returned by every login route once a session has been issued. */
export interface LoginPayload {
  employee: EmployeeSummary;
  permissions: string[];
  modules: ModuleSummary[];
  mustChangePin: boolean;
}

export type SessionResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      employee: EmployeeSummary;
      permissions: string[];
      modules: ModuleSummary[];
      mustChangePin: boolean;
      session: { id: string; method: string; expiresAt: string; absoluteExpiresAt: string };
    };
