import {SESSION_COOKIE, ServerError, clearCookie, fail, json, serviceRpc, sessionId} from '../../../lib/yaqoot/server';
export const dynamic = 'force-dynamic';

// كل مورد يمر عبر دالة web_*_list الموجودة في قاعدة البيانات.
// الدالة نفسها تفحص الجلسة والصلاحية (web_guard → intent_guard)، فلا يُعتمد على الواجهة لإخفاء البيانات.
const RESOURCES: Record<string, {fn: string; params: string[]}> = {
  invoices: {fn: 'web_invoices_list', params: ['q', 'limit', 'before', 'debt_only']},
  customers: {fn: 'web_customers_list', params: ['q', 'limit', 'offset', 'debtors_only']},
  products: {fn: 'web_products_list', params: ['q', 'limit', 'offset', 'low_only']},
  repairs: {fn: 'web_repairs_list', params: ['q', 'limit', 'status', 'mine']},
  returns: {fn: 'web_returns_list', params: ['q', 'limit']},
  shortages: {fn: 'web_shortages_list', params: []},
  expenses: {fn: 'web_expenses_list', params: ['limit', 'before']},
  shipping: {fn: 'web_shipping_orders_list', params: ['limit', 'status']},
  employees: {fn: 'web_employees_list', params: []},
  sessions: {fn: 'web_sessions_list', params: []},
  dashboard: {fn: 'web_dashboard', params: []},
  statement: {fn: 'web_customer_statement', params: ['id']},
  invoice: {fn: 'web_invoice_get', params: ['id']},
  repair: {fn: 'web_repair_get', params: ['id']},
  vault: {fn: 'web_vault', params: ['limit']},
  security: {fn: 'web_security_events', params: ['limit']},
  inbox: {fn: 'web_notify_inbox', params: ['limit', 'before', 'kind', 'unread_only']},
  notify_admin: {fn: 'web_notify_admin', params: []},
  isp: {fn: 'web_isp_overview', params: ['q', 'status', 'limit']},
};
const BOOL = new Set(['debt_only', 'debtors_only', 'low_only', 'mine', 'unread_only']);
const INT = new Set(['limit', 'offset', 'before']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const resource = RESOURCES[url.searchParams.get('r') || ''];
  if (!resource) return json({ok: false, reason: 'unknown_resource'}, 404);
  const sid = sessionId(req);
  if (!sid) return json({ok: false, reason: 'session_expired'}, 401);

  const params: Record<string, unknown> = {};
  for (const key of resource.params) {
    const raw = url.searchParams.get(key);
    if (raw === null || raw === '') continue;
    if (BOOL.has(key)) params[key] = raw === '1' || raw === 'true';
    else if (key === 'id') {
      if (UUID.test(raw)) params.id = raw;
    } else if (key === 'before' && resource.fn !== 'web_notify_inbox') {
      params.before = raw.slice(0, 40);
    } else if (INT.has(key)) {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 0) params[key] = n;
    } else params[key] = raw.slice(0, 100);
  }

  try {
    const data = await serviceRpc(resource.fn, {p_session_id: sid, p_params: params});
    return json(data);
  } catch (err) {
    if (err instanceof ServerError && err.code === 'session_expired') {
      return json({ok: false, reason: 'session_expired'}, 401, {'Set-Cookie': clearCookie(req, SESSION_COOKIE)});
    }
    return fail(err);
  }
}
