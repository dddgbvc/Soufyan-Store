import {SESSION_COOKIE, clearCookie, fail, json, readStatus} from '../../../../lib/yaqoot/server';
export const dynamic = 'force-dynamic';

// حالة المتصفح: غير مفعّل / مقفول (ينتظر PIN) / جلسة موظف نشطة.
export async function GET(req: Request) {
  try {
    const status = await readStatus(req);
    const headers: HeadersInit = status.state === 'active' ? {} : {'Set-Cookie': clearCookie(req, SESSION_COOKIE)};
    return json({ok: true, ...status}, 200, headers);
  } catch (err) {
    return fail(err);
  }
}
