import {SESSION_COOKIE, ServerError, clearCookie, fail, json, readCookie, serviceRpc, sessionId} from '../../../../lib/yaqoot/server';
export const dynamic = 'force-dynamic';

// الموردون والمشتريات عبر دوال قسم الشراء الموجودة (purchase_*).
// قسم الشراء يستعمل رمز جلسة خاصاً يُستخرج من جلسة الموظف (purchase_session_from_app_session)
// ويُحفظ في كوكي httpOnly حتى لا تُنشأ جلسة شراء جديدة مع كل طلب.
const PUR = 'yq_pur';

async function token(sid: string, req: Request, fresh: boolean): Promise<{token: string; renewed: boolean}> {
  const old = readCookie(req, PUR);
  if (!fresh && old && /^[0-9a-f]{64}$/.test(old)) return {token: old, renewed: false};
  const r = await serviceRpc<{ok: boolean; token?: string; reason?: string; message?: string}>('purchase_session_from_app_session', {p_session_id: sid});
  if (!r.ok || !r.token) throw new ServerError(r.reason === 'forbidden' ? 'forbidden' : 'purchase_unavailable', 403, r.message);
  return {token: r.token, renewed: true};
}

export async function GET(req: Request) {
  const sid = sessionId(req);
  if (!sid) return json({ok: false, reason: 'session_expired'}, 401);
  const u = new URL(req.url);
  const kind = u.searchParams.get('r') || 'purchases';
  const q = (u.searchParams.get('q') || '').slice(0, 80);
  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(u.searchParams.get('offset')) || 0);

  const call = (t: string) => {
    if (kind === 'suppliers') return serviceRpc('purchase_suppliers_list', {p_token: t, p_query: q, p_only_debt: u.searchParams.get('only_debt') === '1'});
    if (kind === 'supplier_payments') return serviceRpc('purchase_payments_list', {p_token: t, p_supplier_id: u.searchParams.get('supplier_id') || null, p_limit: limit});
    return serviceRpc('purchase_list', {p_token: t, p_query: q, p_from: null, p_to: null, p_status: u.searchParams.get('status') || null, p_limit: limit, p_offset: offset});
  };

  try {
    let t = await token(sid, req, false);
    let data: unknown;
    try {
      data = await call(t.token);
    } catch (e) {
      if (e instanceof ServerError && e.code === 'forbidden') throw e;
      t = await token(sid, req, true); // الرمز القديم انتهى أو أُلغي: نستبدله مرة واحدة
      data = await call(t.token);
    }
    const headers: HeadersInit = t.renewed
      ? {'Set-Cookie': `${PUR}=${t.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`}
      : {};
    return json(data, 200, headers);
  } catch (err) {
    if (err instanceof ServerError && err.code === 'session_expired') {
      return json({ok: false, reason: 'session_expired'}, 401, {'Set-Cookie': clearCookie(req, SESSION_COOKIE)});
    }
    return fail(err);
  }
}
