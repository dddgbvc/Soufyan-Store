/**
 * Trial24 — الصلاحيات
 *
 * الصلاحيات تُفرض على الخادم في كل نقطة نهاية. إخفاء الأزرار في الواجهة
 * راحة بصرية فقط، وليس حماية.
 */

import { forbidden } from '../util.js';

export const PERMISSIONS = {
  TRIAL_CREATE: 'trial.create',
  TRIAL_RETURN: 'trial.return',
  TRIAL_COMPLETE: 'trial.complete', // تحويل التجربة إلى بيع
  TRIAL_EXTEND: 'trial.extend',
  TRIAL_CANCEL: 'trial.cancel',
  TRIAL_OVERRIDE: 'trial.override', // تجاوز حدود السياسة مع تسجيل السبب
  ANALYTICS_VIEW: 'analytics.view',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_VIEW: 'audit.view',
};

/** الأدوار الأساسية كما طُلبت في مواصفات النظام. */
export const ROLE_PERMISSIONS = {
  employee: [
    PERMISSIONS.TRIAL_CREATE,
    PERMISSIONS.TRIAL_RETURN,
    PERMISSIONS.TRIAL_COMPLETE,
  ],
  manager: [
    PERMISSIONS.TRIAL_CREATE,
    PERMISSIONS.TRIAL_RETURN,
    PERMISSIONS.TRIAL_COMPLETE,
    PERMISSIONS.TRIAL_EXTEND,
    PERMISSIONS.TRIAL_CANCEL,
    PERMISSIONS.TRIAL_OVERRIDE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
  ],
};

export const ROLE_LABELS = {
  employee: 'موظف',
  manager: 'مدير',
};

/** قائمة صلاحيات المستخدم (الدور + أي صلاحيات إضافية ممنوحة فرديًا). */
export function permissionsOf(user) {
  if (!user) return [];
  const base = ROLE_PERMISSIONS[user.role] || [];
  const extra = Array.isArray(user.extraPermissions) ? user.extraPermissions : [];
  return [...new Set([...base, ...extra])];
}

export function can(user, permission) {
  return permissionsOf(user).includes(permission);
}

/** يرمي 403 إن لم تتوفر الصلاحية. */
export function assertCan(user, permission) {
  if (!can(user, permission)) {
    throw forbidden(
      'PERMISSION_DENIED',
      `لا تملك صلاحية تنفيذ هذا الإجراء (${permission}).`,
      { required: permission, role: user?.role || null }
    );
  }
}

/** الموظفون المخوّلون باستلام إشعارات التجارب (مدراء + من يملك صلاحية الإرجاع). */
export function notifiableStaff(users) {
  return users.filter(
    (u) =>
      u.active !== false &&
      (u.role === 'manager' || can(u, PERMISSIONS.TRIAL_RETURN))
  );
}

export function managers(users) {
  return users.filter((u) => u.active !== false && u.role === 'manager');
}
