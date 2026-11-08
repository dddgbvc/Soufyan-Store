import {fail, json, readJson, serviceRpc, sha256Hex} from '../../../../lib/yaqoot/server';
export const dynamic = 'force-dynamic';

// تطبيق أندرويد: استطلاع الخلفية عن إشعارات الموظف الجديدة بالرمز السري للجهاز (بدون جلسة PIN).
export async function POST(req: Request) {
  const token = req.headers.get('X-Yaqoot-Device') || '';
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ok: false, reason: 'unregistered'}, 401);
  try {
    const body = await readJson(req).catch(() => ({} as Record<string, unknown>));
    const since = Number(body.since);
    return json(await serviceRpc('web_native_poll', {p_token_hash: await sha256Hex(token), p_since: Number.isFinite(since) && since > 0 ? Math.floor(since) : 0}));
  } catch (err) {
    return fail(err);
  }
}
