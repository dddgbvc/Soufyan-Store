import 'server-only';

/**
 * Canonical audit event names. Everything security-relevant funnels through
 * this list so the trail stays greppable and the database CHECK constraint
 * (`module.action`) is never violated by an ad-hoc string.
 */
export const AuditEvent = {
  loginPinSuccess: 'login.pin_success',
  loginPinFailure: 'login.pin_failure',
  loginPasswordSuccess: 'login.password_success',
  loginPasswordFailure: 'login.password_failure',
  loginQrSuccess: 'login.qr_success',
  loginBlocked: 'login.blocked',
  loginLocked: 'login.account_locked',
  loginDisabled: 'login.account_disabled',
  logout: 'session.logout',
  sessionRevoked: 'session.revoked',
  sessionExpired: 'session.expired',

  otpRequested: 'otp.requested',
  otpFailed: 'otp.failed',
  otpVerified: 'otp.verified',
  otpBlocked: 'otp.blocked',

  pinChanged: 'pin.changed',
  pinReset: 'pin.reset',
  pinAssigned: 'pin.assigned',

  qrCreated: 'qr.created',
  qrScanned: 'qr.scanned',
  qrApproved: 'qr.approved',
  qrConsumed: 'qr.consumed',
  qrExpired: 'qr.expired',
  qrRevoked: 'qr.revoked',
  qrRejected: 'qr.rejected',

  employeeCreated: 'employee.created',
  employeeUpdated: 'employee.updated',
  employeeDisabled: 'employee.disabled',
  employeeEnabled: 'employee.enabled',
  employeeDeleted: 'employee.deleted',
  permissionsChanged: 'employee.permissions_changed',

  authzDenied: 'authz.denied',
} as const;

export type AuditEventName = (typeof AuditEvent)[keyof typeof AuditEvent];
