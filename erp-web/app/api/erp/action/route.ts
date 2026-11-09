import {SESSION_COOKIE, ServerError, clearCookie, fail, json, readJson, sameOrigin, serviceRpc, sessionId} from '../../../../lib/yaqoot/server';
import {deliver} from '../../../../lib/push/auto';
import {pushStore} from '../../../../lib/push/server';
export const dynamic = 'force-dynamic';

// عمليات الكتابة. كل دالة تفحص الجلسة والصلاحية والقيود المالية بنفسها في قاعدة البيانات،
// وتستعمل client_id لمنع التكرار عند إعادة الإرسال.
const ACTIONS: Record<string, string> = {
  debt_add: 'web_debt_addition',
  debt_pay: 'web_debt_payment',
  customer_create: 'web_customer_create',
  expense_create: 'web_expense_create',
  vault_txn: 'web_vault_txn',
  repair_status: 'web_repair_set_status',
  notify_mark: 'web_notify_mark',
  notify_admin_set: 'web_notify_admin_set',
  notify_broadcast: 'web_notify_broadcast',
  whatsapp_send: 'web_whatsapp_send',
  whatsapp_consent: 'web_whatsapp_consent',
};

type Device = {id: string; endpoint: string; p256dh: string; auth: string};

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  const sid = sessionId(req);
  if (!sid) return json({ok: false, reason: 'session_expired'}, 401);
  try {
    const body = await readJson(req);
    const fn = ACTIONS[typeof body.action === 'string' ? body.action : ''];
    if (!fn) throw new ServerError('unknown_action', 404);
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const result = await serviceRpc<Record<string, any>>(fn, {p_session_id: sid, p_payload: payload});

    // الإشعار المخصص يُرسل فوراً لأجهزة المستلمين.
    if (body.action === 'notify_broadcast' && result?.item) {
      const item = result.item as {title: string; body: string; tag: string; url: string; devices: Device[]; recipients: number};
      const webDevices = (item.devices || []).filter(d => !d.endpoint.startsWith('native:'));
      const outcomes = await Promise.all(webDevices.map(d => deliver(d, {title: item.title, body: item.body, tag: item.tag, url: item.url})));
      await Promise.all(webDevices.filter((_, i) => outcomes[i] === 'expired').map(d => pushStore.removeExpired(d.id).catch(() => null)));
      return json({ok: true, recipients: item.recipients, pushed: outcomes.filter(o => o === 'accepted').length, devices: outcomes.length});
    }
    return json(result);
  } catch (err) {
    if (err instanceof ServerError && err.code === 'session_expired') {
      return json({ok: false, reason: 'session_expired'}, 401, {'Set-Cookie': clearCookie(req, SESSION_COOKIE)});
    }
    return fail(err);
  }
}
