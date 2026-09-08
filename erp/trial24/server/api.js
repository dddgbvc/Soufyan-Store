/**
 * Trial24 — واجهة HTTP (REST)
 *
 * مصادقة مبسّطة للتشغيل الداخلي: ترويسة `X-User-Id`.
 * في الإنتاج استبدلها بجلسة/توكن من نظام ERP، وأبقِ فحص الصلاحيات كما هو —
 * فهو مطبَّق في طبقة الأعمال لا في الواجهة.
 */

import {
  AppError,
  badRequest,
  cleanText,
  clamp,
  forbidden,
  notFound,
  serverNow,
  uid,
} from './util.js';
import { PERMISSIONS, ROLE_LABELS, assertCan, can, permissionsOf } from './domain/permissions.js';
import { listAudit } from './domain/audit.js';
import {
  listNotifications,
  markAllRead,
  markCustomerMessageSent,
  markRead,
  unreadCount,
} from './domain/notifications.js';
import {
  DEVICE_STATUS,
  DEVICE_STATUS_LABELS,
  deviceHistory,
  deviceStats,
  getDevice,
} from './domain/devices.js';
import {
  TRIAL_STATUS_LABELS,
  approveExtension,
  cancelTrial,
  createTrial,
  dashboard,
  decorate,
  extendTrial,
  getTrial,
  listTrials,
  purchaseTrial,
  rejectExtension,
  returnTrial,
  validateExtension,
} from './domain/trials.js';
import { analytics } from './domain/analytics.js';

// ————————————————————————————————————————————————
// جدول المسارات
// ————————————————————————————————————————————————

const routes = [];
const route = (method, path, handler, { auth = true, mutates = false } = {}) =>
  routes.push({ method, path, handler, auth, mutates, segments: path.split('/').filter(Boolean) });

const GET = (path, handler, opts) => route('GET', path, handler, opts);
const POST = (path, handler, opts) => route('POST', path, handler, { ...opts, mutates: true });
const PUT = (path, handler, opts) => route('PUT', path, handler, { ...opts, mutates: true });

// ——— الوقت والجلسة ———

/** المرجع الزمني الوحيد للواجهة. تُستدعى دوريًا لمزامنة العدّاد. */
GET('/api/time', ({ now }) => ({ now }), { auth: false });

GET('/api/users', ({ db }) =>
  db.data.users
    .filter((u) => u.active !== false)
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      roleLabel: ROLE_LABELS[u.role] || u.role,
      title: u.title,
      permissions: permissionsOf(u),
    })),
  { auth: false }
);

GET('/api/session', ({ db, user }) => ({
  user: {
    id: user.id,
    name: user.name,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || user.role,
    title: user.title,
  },
  permissions: permissionsOf(user),
  unread: unreadCount(db, user.id),
}));

/** كل ما تحتاجه الواجهة عند الإقلاع في نداء واحد. */
GET('/api/bootstrap', ({ db, user, now }) => ({
  session: {
    user: { id: user.id, name: user.name, role: user.role, roleLabel: ROLE_LABELS[user.role], title: user.title },
    permissions: permissionsOf(user),
  },
  users: db.data.users.filter((u) => u.active !== false).map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role] || u.role,
    title: u.title,
  })),
  settings: db.settings,
  customers: db.data.customers,
  devices: db.data.devices,
  labels: { trialStatus: TRIAL_STATUS_LABELS, deviceStatus: DEVICE_STATUS_LABELS },
  dashboard: dashboard(db, now),
  unread: unreadCount(db, user.id),
  pendingExtensionRequests: db.data.extensionRequests.filter((r) => r.status === 'pending'),
}));

// ——— لوحة المعلومات والتجارب ———

GET('/api/dashboard', ({ db, now }) => dashboard(db, now));

GET('/api/trials', ({ db, query, now }) =>
  listTrials(db, { status: query.status, q: query.q, deviceId: query.deviceId, customerId: query.customerId }, now)
);

POST('/api/trials', ({ db, user, body, now }) => createTrial(db, user, body));

GET('/api/trials/:id', ({ db, params, user, now }) => {
  const trial = getTrial(db, params.id);
  const device = db.find('devices', trial.deviceId);
  const customer = db.find('customers', trial.customerId);
  return {
    trial: decorate(db, trial, now),
    device,
    customer,
    sale: trial.saleId ? db.find('sales', trial.saleId) : null,
    audit: listAudit(db, { trialId: trial.id, limit: 100 }),
    notifications: db.data.notifications
      .filter((n) => n.trialId === trial.id)
      .sort((a, b) => b.at - a.at),
    extensionRequests: db.data.extensionRequests.filter((r) => r.trialId === trial.id),
    extensionPolicy: validateExtension(db, trial, db.settings.defaultExtensionHours),
    canManage: {
      return: can(user, PERMISSIONS.TRIAL_RETURN),
      purchase: can(user, PERMISSIONS.TRIAL_COMPLETE),
      extend: can(user, PERMISSIONS.TRIAL_EXTEND),
      cancel: can(user, PERMISSIONS.TRIAL_CANCEL),
      override: can(user, PERMISSIONS.TRIAL_OVERRIDE),
    },
  };
});

POST('/api/trials/:id/return', ({ db, user, params, body }) => returnTrial(db, user, params.id, body));
POST('/api/trials/:id/purchase', ({ db, user, params, body }) => purchaseTrial(db, user, params.id, body));
POST('/api/trials/:id/extend', ({ db, user, params, body }) => extendTrial(db, user, params.id, body));
POST('/api/trials/:id/cancel', ({ db, user, params, body }) => cancelTrial(db, user, params.id, body));

// ——— طلبات التمديد ———

GET('/api/extension-requests', ({ db, query }) => {
  const rows = db.data.extensionRequests.slice().sort((a, b) => b.requestedAt - a.requestedAt);
  return query.status ? rows.filter((r) => r.status === query.status) : rows;
});
POST('/api/extension-requests/:id/approve', ({ db, user, params, body }) =>
  approveExtension(db, user, params.id, body)
);
POST('/api/extension-requests/:id/reject', ({ db, user, params, body }) =>
  rejectExtension(db, user, params.id, body)
);

// ——— الأجهزة ———

GET('/api/devices', ({ db, query }) => {
  let rows = db.data.devices.slice();
  if (query.status && query.status !== 'all') rows = rows.filter((d) => d.status === query.status);
  if (query.q) {
    const needle = query.q.toLowerCase();
    rows = rows.filter((d) =>
      [d.brand, d.model, d.imei, d.serial, d.color].join(' ').toLowerCase().includes(needle)
    );
  }
  return rows.map((d) => ({ ...d, stats: deviceStats(db, d.id) }));
});

GET('/api/devices/:id', ({ db, params }) => {
  const device = getDevice(db, params.id);
  return {
    device,
    stats: deviceStats(db, device.id),
    history: deviceHistory(db, device.id),
    audit: listAudit(db, { deviceId: device.id, limit: 60 }),
    currentTrial: device.currentTrialId ? db.find('trials', device.currentTrialId) : null,
  };
});

// ——— العملاء ———

GET('/api/customers', ({ db }) =>
  db.data.customers.map((c) => ({
    ...c,
    openTrialId:
      db.data.trials.find((t) => t.customerId === c.id && ['active', 'expired'].includes(t.status))?.id || null,
    trialsCount: db.data.trials.filter((t) => t.customerId === c.id).length,
  }))
);

POST('/api/customers', ({ db, user, body, now }) => {
  assertCan(user, PERMISSIONS.TRIAL_CREATE);
  const name = cleanText(body.name, { max: 80 });
  const phone = cleanText(body.phone, { max: 20 });
  if (!name) throw badRequest('NAME_REQUIRED', 'اسم العميل مطلوب.');
  if (!/^0?7\d{9}$/.test(phone.replace(/\s/g, ''))) {
    throw badRequest('PHONE_INVALID', 'رقم الهاتف غير صالح (المتوقع: 07XXXXXXXXX).');
  }
  const duplicate = db.data.customers.find((c) => c.phone.replace(/\s/g, '') === phone.replace(/\s/g, ''));
  if (duplicate) throw badRequest('CUSTOMER_EXISTS', 'يوجد عميل مسجّل بنفس الرقم.', { customerId: duplicate.id });

  const customer = {
    id: uid('cus'),
    name,
    phone,
    city: cleanText(body.city, { max: 40 }),
    idType: cleanText(body.idType, { max: 40 }) || 'بطاقة موحدة',
    idNumber: cleanText(body.idNumber, { max: 40 }),
    trusted: false,
    blocked: false,
    blockReason: null,
    notes: cleanText(body.notes, { max: 300 }),
    createdAt: now,
    createdBy: user.id,
  };
  db.insert('customers', customer);
  return customer;
});

// ——— التحليلات والتدقيق ———

GET('/api/analytics', ({ db, user, query, now }) => {
  assertCan(user, PERMISSIONS.ANALYTICS_VIEW);
  const days = query.days ? clamp(Number(query.days) || 30, 1, 365) : null;
  return analytics(db, { days }, now);
});

GET('/api/audit', ({ db, user, query }) => {
  assertCan(user, PERMISSIONS.AUDIT_VIEW);
  return listAudit(db, {
    trialId: query.trialId,
    deviceId: query.deviceId,
    customerId: query.customerId,
    action: query.action,
    limit: clamp(Number(query.limit) || 200, 1, 1000),
  });
});

// ——— الإشعارات ———

GET('/api/notifications', ({ db, user, query }) => ({
  items: listNotifications(db, user.id, {
    limit: clamp(Number(query.limit) || 60, 1, 200),
    unreadOnly: query.unread === '1',
  }),
  unread: unreadCount(db, user.id),
}));

POST('/api/notifications/read-all', ({ db, user }) => ({ marked: markAllRead(db, user.id) }));

POST('/api/notifications/:id/read', ({ db, user, params }) => {
  const n = markRead(db, params.id, user.id);
  if (!n) throw notFound('NOTIFICATION_NOT_FOUND', 'الإشعار غير موجود.');
  return { id: n.id, unread: unreadCount(db, user.id) };
});

POST('/api/notifications/:id/customer-sent', ({ db, user, params }) => {
  const n = markCustomerMessageSent(db, params.id, user);
  if (!n) throw notFound('NOTIFICATION_NOT_FOUND', 'الإشعار غير موجود أو لا يحتوي رسالة عميل.');
  return n;
});

// ——— الإعدادات ———

GET('/api/settings', ({ db }) => db.settings);

PUT('/api/settings', ({ db, user, body }) => {
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);
  const s = db.settings;
  const numericFields = {
    defaultDurationHours: [1, 168],
    defaultExtensionHours: [1, 168],
    maxExtensions: [0, 10],
    maxExtensionHours: [1, 168],
    maxTotalDurationHours: [1, 720],
    reminderBeforeMinutes: [5, 1440],
    endingSoonMinutes: [10, 2880],
    criticalMinutes: [5, 1440],
    minDepositIQD: [0, 100000000],
    defaultWarrantyMonths: [0, 60],
    analyticsMinSample: [1, 50],
  };

  const before = structuredClone(s);
  for (const [field, [min, max]] of Object.entries(numericFields)) {
    if (body[field] !== undefined) {
      const value = Number(body[field]);
      if (!Number.isFinite(value)) throw badRequest('INVALID_SETTING', `قيمة غير صالحة للحقل ${field}.`);
      s[field] = clamp(value, min, max);
    }
  }
  for (const flag of ['requireManagerApprovalForExtension', 'depositRequired']) {
    if (body[flag] !== undefined) s[flag] = Boolean(body[flag]);
  }
  if (body.termsText !== undefined) {
    const lines = Array.isArray(body.termsText) ? body.termsText : String(body.termsText).split('\n');
    s.termsText = lines.map((l) => cleanText(l, { max: 300 })).filter(Boolean);
    // أي تعديل على الشروط يرفع رقم النسخة حتى تُوثّق الموافقات لاحقًا بنسختها
    const match = /^v(\d+)\.(\d+)$/.exec(s.termsVersion || 'v1.0');
    s.termsVersion = match ? `v${match[1]}.${Number(match[2]) + 1}` : 'v1.1';
  }

  if (s.defaultDurationHours > s.maxTotalDurationHours) {
    throw badRequest('INVALID_SETTING', 'المدة الافتراضية أكبر من الحد الأقصى للمدة الكلية.');
  }
  if (s.criticalMinutes > s.endingSoonMinutes) {
    throw badRequest('INVALID_SETTING', 'عتبة «حرِجة» يجب أن تكون أصغر من عتبة «تقترب من النهاية».');
  }

  const changed = Object.keys(s).filter(
    (k) => JSON.stringify(s[k]) !== JSON.stringify(before[k])
  );
  db.data.audit.push({
    id: uid('aud'),
    action: 'SETTINGS_UPDATE',
    actionLabel: 'تعديل الإعدادات',
    at: serverNow(),
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    trialId: null,
    trialCode: null,
    deviceId: null,
    deviceName: null,
    deviceImei: null,
    customerId: null,
    customerName: null,
    entity: 'settings',
    oldStatus: null,
    newStatus: null,
    reason: null,
    meta: { changed, before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, s[k]])) },
  });

  return s;
});

// ————————————————————————————————————————————————
// المُوجّه
// ————————————————————————————————————————————————

function matchRoute(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method) continue;
    if (r.segments.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.segments.length; i += 1) {
      const seg = r.segments[i];
      if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
      else if (seg !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

/**
 * تنفيذ نداء API.
 * @returns {{status:number, body:object}}
 */
export function handleApi(db, { method, pathname, query, body, headers }) {
  const now = serverNow();
  const match = matchRoute(method, pathname);
  if (!match) {
    return { status: 404, body: { ok: false, error: { code: 'NOT_FOUND', message: 'مسار غير معروف.' }, serverTime: now } };
  }

  const { route: r, params } = match;
  let user = null;
  if (r.auth) {
    const userId = headers['x-user-id'];
    user = userId ? db.find('users', userId) : null;
    if (!user || user.active === false) {
      return {
        status: 401,
        body: { ok: false, error: { code: 'UNAUTHENTICATED', message: 'الجلسة غير صالحة — أعد اختيار المستخدم.' }, serverTime: now },
      };
    }
  }

  const ctx = { db, user, params, query, body: body || {}, now, headers };

  try {
    const run = () => r.handler(ctx);
    const data = r.mutates ? db.mutate(run) : run();
    return { status: 200, body: { ok: true, data, serverTime: serverNow() } };
  } catch (err) {
    if (err instanceof AppError) {
      return {
        status: err.status,
        body: {
          ok: false,
          error: { code: err.code, message: err.message, details: err.details },
          serverTime: serverNow(),
        },
      };
    }
    console.error('[trial24] خطأ غير متوقع:', err);
    return {
      status: 500,
      body: { ok: false, error: { code: 'INTERNAL', message: 'خطأ داخلي في الخادم.' }, serverTime: serverNow() },
    };
  }
}

export { routes };
