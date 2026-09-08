/**
 * Trial24 — عميل REST
 * كل نداء يحمل هوية المستخدم الحالي، والخادم هو من يقرر الصلاحية.
 */

const STORAGE_KEY = 'trial24.userId';

export const session = {
  userId: localStorage.getItem(STORAGE_KEY) || 'usr_manager',
  set(id) {
    this.userId = id;
    localStorage.setItem(STORAGE_KEY, id);
  },
};

/** خطأ قادم من الخادم يحمل رمزًا ورسالة عربية جاهزة للعرض. */
export class ApiError extends Error {
  constructor(code, message, details, status) {
    super(message || 'تعذّر تنفيذ الطلب.');
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

/** آخر وقت خادم وصل مع أي استجابة — يغذّي مزامنة الساعة. */
export const lastServerTime = { value: 0, at: 0 };

async function request(method, path, { body, query } = {}) {
  const url = new URL(path, location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': session.userId,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('NETWORK', 'تعذّر الاتصال بخادم النظام. تحقّق من تشغيل الخدمة.', null, 0);
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError('BAD_RESPONSE', 'استجابة غير مفهومة من الخادم.', null, res.status);
  }

  if (payload.serverTime) {
    lastServerTime.value = payload.serverTime;
    lastServerTime.at = performance.now();
  }

  if (!res.ok || payload.ok === false) {
    const err = payload.error || {};
    throw new ApiError(err.code || 'ERROR', err.message, err.details, res.status);
  }
  return payload.data;
}

export const api = {
  time: () => request('GET', '/api/time'),
  users: () => request('GET', '/api/users'),
  bootstrap: () => request('GET', '/api/bootstrap'),
  dashboard: () => request('GET', '/api/dashboard'),

  trials: (query) => request('GET', '/api/trials', { query }),
  trial: (id) => request('GET', `/api/trials/${encodeURIComponent(id)}`),
  createTrial: (body) => request('POST', '/api/trials', { body }),
  returnTrial: (id, body) => request('POST', `/api/trials/${encodeURIComponent(id)}/return`, { body }),
  purchaseTrial: (id, body) => request('POST', `/api/trials/${encodeURIComponent(id)}/purchase`, { body }),
  extendTrial: (id, body) => request('POST', `/api/trials/${encodeURIComponent(id)}/extend`, { body }),
  cancelTrial: (id, body) => request('POST', `/api/trials/${encodeURIComponent(id)}/cancel`, { body }),

  extensionRequests: (query) => request('GET', '/api/extension-requests', { query }),
  approveExtension: (id, body) => request('POST', `/api/extension-requests/${encodeURIComponent(id)}/approve`, { body }),
  rejectExtension: (id, body) => request('POST', `/api/extension-requests/${encodeURIComponent(id)}/reject`, { body }),

  devices: (query) => request('GET', '/api/devices', { query }),
  device: (id) => request('GET', `/api/devices/${encodeURIComponent(id)}`),

  customers: () => request('GET', '/api/customers'),
  createCustomer: (body) => request('POST', '/api/customers', { body }),

  analytics: (query) => request('GET', '/api/analytics', { query }),
  audit: (query) => request('GET', '/api/audit', { query }),

  notifications: (query) => request('GET', '/api/notifications', { query }),
  readNotification: (id) => request('POST', `/api/notifications/${encodeURIComponent(id)}/read`),
  readAllNotifications: () => request('POST', '/api/notifications/read-all'),
  markCustomerSent: (id) => request('POST', `/api/notifications/${encodeURIComponent(id)}/customer-sent`),

  settings: () => request('GET', '/api/settings'),
  saveSettings: (body) => request('PUT', '/api/settings', { body }),
};
