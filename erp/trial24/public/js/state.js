/**
 * Trial24 — حالة التطبيق في الواجهة
 * مخزن بسيط: بيانات الإقلاع + المستخدم الحالي + مساعدات الصلاحيات.
 * الصلاحيات هنا للعرض فقط — القرار النهائي دائمًا على الخادم.
 */

import { api, session } from './api.js';

export const PERM = {
  CREATE: 'trial.create',
  RETURN: 'trial.return',
  COMPLETE: 'trial.complete',
  EXTEND: 'trial.extend',
  CANCEL: 'trial.cancel',
  OVERRIDE: 'trial.override',
  ANALYTICS: 'analytics.view',
  SETTINGS: 'settings.manage',
  AUDIT: 'audit.view',
};

export const store = {
  user: null,
  permissions: [],
  users: [],
  settings: null,
  customers: [],
  devices: [],
  labels: { trialStatus: {}, deviceStatus: {} },
  dashboard: null,
  unread: 0,
  pendingExtensionRequests: [],
  ready: false,
};

const subscribers = new Set();

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function emit() {
  for (const fn of subscribers) fn(store);
}

/** تحميل كل ما تحتاجه الواجهة في نداء واحد. */
export async function loadBootstrap() {
  const data = await api.bootstrap();
  store.user = data.session.user;
  store.permissions = data.session.permissions;
  store.users = data.users;
  store.settings = data.settings;
  store.customers = data.customers;
  store.devices = data.devices;
  store.labels = data.labels;
  store.dashboard = data.dashboard;
  store.unread = data.unread;
  store.pendingExtensionRequests = data.pendingExtensionRequests;
  store.ready = true;
  emit();
  return store;
}

/** تبديل المستخدم الحالي (محاكاة تسجيل الدخول داخل ERP). */
export async function switchUser(userId) {
  session.set(userId);
  await loadBootstrap();
  return store.user;
}

export const can = (perm) => store.permissions.includes(perm);
export const isManager = () => store.user?.role === 'manager';

export async function refreshUnread() {
  try {
    const data = await api.notifications({ limit: 1 });
    store.unread = data.unread;
    emit();
  } catch {
    /* تجاهل — المؤشر ثانوي */
  }
}

export function setUnread(count) {
  store.unread = count;
  emit();
}
