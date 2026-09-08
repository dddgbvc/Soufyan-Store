/**
 * Trial24 — الإشعارات والأحداث
 *
 * كل حدث يُسجَّل داخل النظام ويُوجَّه لجمهور محدد (مدير / موظفون مخوّلون / عميل).
 * إشعارات العميل تُولَّد كرسالة جاهزة + رابط واتساب (قناة المتجر الفعلية)،
 * ويُعلَّم إرسالها يدويًا من الواجهة — بلا خدمات خارجية أو مفاتيح API.
 */

import { uid, serverNow } from '../util.js';
import { managers, notifiableStaff } from './permissions.js';

export const EVENTS = {
  TRIAL_STARTED: 'TRIAL_STARTED',
  TRIAL_ENDING_SOON: 'TRIAL_ENDING_SOON',
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
  TRIAL_RETURNED: 'TRIAL_RETURNED',
  TRIAL_PURCHASED: 'TRIAL_PURCHASED',
  TRIAL_EXTENDED: 'TRIAL_EXTENDED',
  TRIAL_EXTENSION_REQUESTED: 'TRIAL_EXTENSION_REQUESTED',
  TRIAL_CANCELLED: 'TRIAL_CANCELLED',
};

export const EVENT_LABELS = {
  TRIAL_STARTED: 'بدء تجربة',
  TRIAL_ENDING_SOON: 'التجربة تقارب الانتهاء',
  TRIAL_EXPIRED: 'انتهت مدة التجربة',
  TRIAL_RETURNED: 'إرجاع جهاز',
  TRIAL_PURCHASED: 'تحوّلت إلى بيع',
  TRIAL_EXTENDED: 'تمديد تجربة',
  TRIAL_EXTENSION_REQUESTED: 'طلب تمديد بانتظار موافقة المدير',
  TRIAL_CANCELLED: 'إلغاء تجربة',
};

export const SEVERITY = { INFO: 'info', WARNING: 'warning', CRITICAL: 'critical', SUCCESS: 'success' };

/** جمهور الإشعار: قائمة معرّفات مستخدمين + (اختياريًا) العميل. */
export function audienceFor(db, kind) {
  const users = db.data.users;
  switch (kind) {
    case 'managers':
      return managers(users).map((u) => u.id);
    case 'staff':
      return notifiableStaff(users).map((u) => u.id);
    default:
      return [];
  }
}

/**
 * إنشاء إشعار.
 * @param {object} db
 * @param {object} input
 * @param {string} input.event       أحد EVENTS
 * @param {string} input.title
 * @param {string} input.body
 * @param {string[]} input.userIds   المستخدمون المستهدفون
 * @param {object|null} input.customer  العميل (إن كان مستهدفًا)
 * @param {string} [input.customerMessage] نص الرسالة الموجهة للعميل
 */
export function notify(db, input) {
  const record = {
    id: uid('ntf'),
    event: input.event,
    eventLabel: EVENT_LABELS[input.event] || input.event,
    severity: input.severity || SEVERITY.INFO,
    title: input.title,
    body: input.body,
    at: input.at || serverNow(),
    userIds: input.userIds || [],
    trialId: input.trialId || null,
    trialCode: input.trialCode || null,
    deviceId: input.deviceId || null,
    customerId: input.customer ? input.customer.id : null,
    readBy: [],
    data: input.data || {},
    customerChannel: null,
  };

  if (input.customer && input.customerMessage) {
    const phone = String(input.customer.phone || '').replace(/[^\d]/g, '');
    const international = phone.startsWith('0') ? `964${phone.slice(1)}` : phone;
    record.customerChannel = {
      customerId: input.customer.id,
      customerName: input.customer.name,
      phone: input.customer.phone,
      message: input.customerMessage,
      whatsappUrl: international
        ? `https://wa.me/${international}?text=${encodeURIComponent(input.customerMessage)}`
        : null,
      sentAt: null,
      sentBy: null,
    };
  }

  db.data.notifications.push(record);
  return record;
}

/** إشعار موجّه للمدير + الموظفين المخوّلين + العميل معًا. */
export function notifyAll(db, { toManagers = false, toStaff = false, customer = null, ...rest }) {
  const ids = new Set();
  if (toManagers) audienceFor(db, 'managers').forEach((id) => ids.add(id));
  if (toStaff) audienceFor(db, 'staff').forEach((id) => ids.add(id));
  return notify(db, { ...rest, customer, userIds: [...ids] });
}

export function listNotifications(db, userId, { limit = 60, unreadOnly = false } = {}) {
  return db.data.notifications
    .filter((n) => n.userIds.includes(userId))
    .filter((n) => (unreadOnly ? !n.readBy.includes(userId) : true))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((n) => ({ ...n, read: n.readBy.includes(userId) }));
}

export function unreadCount(db, userId) {
  return db.data.notifications.filter(
    (n) => n.userIds.includes(userId) && !n.readBy.includes(userId)
  ).length;
}

export function markRead(db, notificationId, userId) {
  const n = db.data.notifications.find((x) => x.id === notificationId);
  if (!n) return null;
  if (!n.readBy.includes(userId)) n.readBy.push(userId);
  return n;
}

export function markAllRead(db, userId) {
  let count = 0;
  for (const n of db.data.notifications) {
    if (n.userIds.includes(userId) && !n.readBy.includes(userId)) {
      n.readBy.push(userId);
      count += 1;
    }
  }
  return count;
}

/** تعليم رسالة العميل كمُرسَلة (بعد فتح رابط واتساب من الواجهة). */
export function markCustomerMessageSent(db, notificationId, user) {
  const n = db.data.notifications.find((x) => x.id === notificationId);
  if (!n || !n.customerChannel) return null;
  n.customerChannel.sentAt = serverNow();
  n.customerChannel.sentBy = user ? user.id : 'system';
  return n;
}
