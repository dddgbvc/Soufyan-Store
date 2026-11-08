import {
  SESSION_COOKIE, STORE_COOKIE, ServerError, clearCookie, deviceLabel, fail, json, passwordSignIn,
  randomSecret, readJson, sameOrigin, serviceRpc, sha256Hex, signOutToken, storeCookie, storeSecretHash,
  userAgent, userRpc,
} from '../../../../lib/yaqoot/server';
export const dynamic = 'force-dynamic';

// الخطوة 1: تسجيل الدخول بحساب المحل (بريد + كلمة مرور المالك) لتفعيل هذا المتصفح.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  try {
    const body = await readJson(req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || !password || password.length > 200) {
      throw new ServerError('invalid_input', 400);
    }

    const token = await passwordSignIn(email, password);
    const secret = randomSecret();
    const ua = userAgent(req);
    let result: {ok: boolean; reason?: string; store_name?: string};
    try {
      result = await userRpc('web_store_device_register', {
        p_secret_hash: await sha256Hex(secret),
        p_label: deviceLabel(ua),
        p_user_agent: ua,
      }, token);
    } finally {
      await signOutToken(token);
    }
    if (!result.ok) throw new ServerError(result.reason === 'not_owner' ? 'not_owner' : 'register_failed', 403);

    const headers = new Headers({'Cache-Control': 'no-store'});
    headers.append('Set-Cookie', storeCookie(req, secret));
    headers.append('Set-Cookie', clearCookie(req, SESSION_COOKIE));
    return Response.json({ok: true, state: 'locked', store_name: result.store_name}, {headers});
  } catch (err) {
    return fail(err);
  }
}

// الخروج من حساب المحل: يلغي تفعيل هذا المتصفح ويغلق جلساته.
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  const headers = new Headers({'Cache-Control': 'no-store'});
  headers.append('Set-Cookie', clearCookie(req, STORE_COOKIE));
  headers.append('Set-Cookie', clearCookie(req, SESSION_COOKIE));
  try {
    const hash = await storeSecretHash(req);
    if (hash) await serviceRpc('web_store_forget', {p_secret_hash: hash});
  } catch {
    // الكوكيز تُمسح على كل حال؛ السرّ بدونها لا قيمة له.
  }
  return Response.json({ok: true, state: 'unpaired'}, {headers});
}
