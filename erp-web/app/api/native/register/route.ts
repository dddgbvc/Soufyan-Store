import {ServerError, fail, json, readJson, serviceRpc, sessionId, sha256Hex} from '../../../../lib/yaqoot/server';
export const dynamic = 'force-dynamic';

// تطبيق أندرويد: تسجيل رمز الجهاز للإشعارات (يتطلب جلسة موظف). القاعدة تحفظ بصمة الرمز فقط.
export async function POST(req: Request) {
  const sid = sessionId(req);
  if (!sid) return json({ok: false, reason: 'session_expired'}, 401);
  try {
    const body = await readJson(req);
    const token = typeof body.token === 'string' ? body.token : '';
    if (!/^[0-9a-f]{64}$/.test(token)) throw new ServerError('invalid_token', 400);
    const device = typeof body.device_name === 'string' ? body.device_name.slice(0, 60) : 'Android';
    return json(await serviceRpc('web_native_register', {p_session_id: sid, p_payload: {token_hash: await sha256Hex(token), device_name: device}}));
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request) {
  const token = req.headers.get('X-Yaqoot-Device') || '';
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ok: true});
  try { await serviceRpc('web_native_unregister', {p_token_hash: await sha256Hex(token)}); } catch {}
  return json({ok: true});
}
