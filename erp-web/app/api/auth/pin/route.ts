import {
  SESSION_COOKIE, ServerError, clearCookie, clientIp, fail, json, readJson, sameOrigin, serviceRpc,
  sessionCookie, sessionId, storeSecretHash, userAgent,
} from '../../../../lib/yaqoot/server';
export const dynamic = 'force-dynamic';

// الخطوة 2: الموظف يدخل رمزه PIN، والرمز يحدد من هو داخل نفس المحل.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  try {
    const hash = await storeSecretHash(req);
    if (!hash) throw new ServerError('unpaired', 401);
    const body = await readJson(req);
    const pin = typeof body.pin === 'string' ? body.pin : '';
    if (!/^\d{4,8}$/.test(pin)) throw new ServerError('invalid', 400);

    const r = await serviceRpc<{
      ok: boolean; reason?: string; retry_after?: number; session_id?: string;
      employee?: unknown; permissions?: string[]; store_name?: string;
    }>('web_store_pin_open', {p_secret_hash: hash, p_pin: pin, p_ip: clientIp(req), p_user_agent: userAgent(req)});

    if (!r.ok || !r.session_id) {
      const status = r.reason === 'unpaired' ? 401 : r.reason === 'locked' ? 429 : r.reason === 'disabled' ? 403 : 400;
      return json({ok: false, reason: r.reason || 'wrong', retry_after: r.retry_after}, status);
    }
    return json(
      {ok: true, state: 'active', session_id: r.session_id, employee: r.employee, permissions: r.permissions || [], store_name: r.store_name},
      200,
      {'Set-Cookie': sessionCookie(req, r.session_id)},
    );
  } catch (err) {
    return fail(err);
  }
}

// قفل الشاشة / تبديل الموظف: تُغلق جلسة الموظف ويبقى المتصفح مفعّلاً على المحل.
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  try {
    const hash = await storeSecretHash(req);
    const sid = sessionId(req);
    if (hash && sid) await serviceRpc('web_store_lock', {p_secret_hash: hash, p_session_id: sid});
  } catch {
    // حتى لو فشل الإغلاق في الخادم، الكوكي يُمسح والجلسة تنتهي تلقائياً بعد 30 دقيقة خمول.
  }
  return json({ok: true, state: 'locked'}, 200, {'Set-Cookie': clearCookie(req, SESSION_COOKIE)});
}
