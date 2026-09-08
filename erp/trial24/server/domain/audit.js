/**
 * Trial24 — سجل التدقيق (Audit Trail)
 *
 * كل تغيّر في حالة تجربة أو جهاز يُسجَّل هنا:
 * من نفّذه، متى، على أي جهاز وأي عميل، الحالة القديمة والجديدة.
 * السجل للإضافة فقط (append-only) ولا يُعدَّل ولا يُحذف من الواجهة.
 */

import { uid, serverNow } from '../util.js';

export const AUDIT_ACTIONS = {
  CREATE: 'TRIAL_CREATE',
  RELEASE: 'DEVICE_RELEASE',
  REMINDER: 'REMINDER_SENT',
  EXPIRE: 'TRIAL_EXPIRE',
  RETURN: 'TRIAL_RETURN',
  PURCHASE: 'TRIAL_PURCHASE',
  EXTENSION: 'TRIAL_EXTENSION',
  EXTENSION_REQUEST: 'EXTENSION_REQUESTED',
  EXTENSION_REJECT: 'EXTENSION_REJECTED',
  CANCEL: 'TRIAL_CANCEL',
  OVERRIDE: 'POLICY_OVERRIDE',
  SETTINGS: 'SETTINGS_UPDATE',
};

export const AUDIT_LABELS = {
  TRIAL_CREATE: 'إنشاء تجربة',
  DEVICE_RELEASE: 'إخراج جهاز',
  REMINDER_SENT: 'تذكير',
  TRIAL_EXPIRE: 'انتهاء المدة',
  TRIAL_RETURN: 'إرجاع',
  TRIAL_PURCHASE: 'شراء',
  TRIAL_EXTENSION: 'تمديد',
  EXTENSION_REQUESTED: 'طلب تمديد',
  EXTENSION_REJECTED: 'رفض تمديد',
  TRIAL_CANCEL: 'إلغاء',
  POLICY_OVERRIDE: 'تجاوز سياسة',
  SETTINGS_UPDATE: 'تعديل الإعدادات',
};

/**
 * تسجيل حدث تدقيق.
 * @param {object} db
 * @param {object} entry
 * @param {string} entry.action        أحد AUDIT_ACTIONS
 * @param {object|null} entry.actor    المستخدم المنفّذ (أو null للنظام)
 * @param {string|null} entry.trialId
 * @param {string|null} entry.deviceId
 * @param {string|null} entry.customerId
 * @param {string|null} entry.oldStatus
 * @param {string|null} entry.newStatus
 * @param {object} [entry.meta]
 */
export function logAudit(db, entry) {
  const actor = entry.actor || null;
  const record = {
    id: uid('aud'),
    action: entry.action,
    actionLabel: AUDIT_LABELS[entry.action] || entry.action,
    at: entry.at || serverNow(),
    actorId: actor ? actor.id : 'system',
    actorName: actor ? actor.name : 'النظام',
    actorRole: actor ? actor.role : 'system',
    trialId: entry.trialId || null,
    trialCode: entry.trialCode || null,
    deviceId: entry.deviceId || null,
    deviceName: entry.deviceName || null,
    deviceImei: entry.deviceImei || null,
    customerId: entry.customerId || null,
    customerName: entry.customerName || null,
    entity: entry.entity || 'trial',
    oldStatus: entry.oldStatus ?? null,
    newStatus: entry.newStatus ?? null,
    deviceOldStatus: entry.deviceOldStatus ?? null,
    deviceNewStatus: entry.deviceNewStatus ?? null,
    reason: entry.reason || null,
    meta: entry.meta || {},
  };
  db.data.audit.push(record);
  return record;
}

/** قراءة السجل مع ترشيح اختياري. */
export function listAudit(db, { trialId, deviceId, customerId, action, limit = 200 } = {}) {
  let rows = db.data.audit;
  if (trialId) rows = rows.filter((r) => r.trialId === trialId);
  if (deviceId) rows = rows.filter((r) => r.deviceId === deviceId);
  if (customerId) rows = rows.filter((r) => r.customerId === customerId);
  if (action) rows = rows.filter((r) => r.action === action);
  return rows.slice().sort((a, b) => b.at - a.at).slice(0, limit);
}
