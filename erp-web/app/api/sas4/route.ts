import {SESSION_COOKIE, ServerError, clearCookie, fail, json, sameOrigin, serviceRpc, sessionId} from '../../../lib/yaqoot/server';
import {sasCheck, sasConfig, sasUsers} from '../../../lib/yaqoot/sas4';
export const dynamic = 'force-dynamic';

// ربط SAS4 المباشر (قراءة فقط): الموظف يحتاج جلسة سارية وصلاحية قراءة المشتركين على حساب موزع.
// الصلاحية تُفحص في قاعدة البيانات بنفس web_sas_status قبل أي اتصال بـ SAS4.
type Account = {id: string; permissions?: string[]};

async function authorize(sid: string, accountId: string | null) {
  const s = await serviceRpc<{accounts?: Account[]}>('web_sas_status', {p_session_id: sid, p_params: {}});
  const cfg = sasConfig();
  const allowed = (s.accounts || []).filter(a => (a.permissions || []).some(p => p === '*' || p === 'subscribers.read'));
  const target = cfg.accountId ? allowed.find(a => a.id === cfg.accountId) : accountId ? allowed.find(a => a.id === accountId) : allowed[0];
  if (!target) throw new ServerError('forbidden', 403, 'لا تملك صلاحية قراءة مشتركي حساب الموزع.');
  return target;
}

export async function GET(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  const sid = sessionId(req);
  if (!sid) return json({ok: false, reason: 'session_expired'}, 401);
  const url = new URL(req.url);
  const op = url.searchParams.get('op') || 'status';
  try {
    const cfg = sasConfig();
    if (op === 'status') {
      await serviceRpc('web_sas_status', {p_session_id: sid, p_params: {}});
      return json({ok: true, direct: cfg.configured, host: cfg.configured ? cfg.host : null});
    }
    if (!cfg.configured) return json({ok: false, reason: 'sas_not_configured', message: 'ربط SAS4 المباشر غير مفعّل على الخادم.'}, 503);
    await authorize(sid, url.searchParams.get('account_id'));
    if (op === 'check') return json(await sasCheck());
    if (op === 'users') {
      const q = url.searchParams.get('q') || '';
      if (q.trim().length < 2) return json({ok: false, reason: 'invalid_input', message: 'اكتب حرفين على الأقل.'}, 400);
      const page = Math.min(Math.max(Number(url.searchParams.get('page')) || 1, 1), 50);
      return json({ok: true, ...(await sasUsers(q, page))});
    }
    return json({ok: false, reason: 'unknown_op'}, 400);
  } catch (err) {
    if (err instanceof ServerError && err.code === 'session_expired') {
      return json({ok: false, reason: 'session_expired'}, 401, {'Set-Cookie': clearCookie(req, SESSION_COOKIE)});
    }
    return fail(err);
  }
}
