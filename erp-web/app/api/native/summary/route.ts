import {fail, json, serviceRpc, sha256Hex} from '../../../../lib/yaqoot/server';
export const dynamic = 'force-dynamic';

// ودجت الهاتف وشاشة القفل والجزيرة الديناميكية: أرقام مختصرة بالرمز السري للجهاز (بدون جلسة PIN)،
// بنفس صلاحيات الموظف الذي فعّل إشعارات الجهاز.
export async function POST(req: Request) {
  const token = req.headers.get('X-Yaqoot-Device') || '';
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ok: false, reason: 'unregistered'}, 401);
  try {
    return json(await serviceRpc('web_native_summary', {p_token_hash: await sha256Hex(token)}));
  } catch (err) {
    return fail(err);
  }
}
