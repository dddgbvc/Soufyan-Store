import {SESSION_COOKIE, ServerError, clearCookie, fail, json, readJson, sameOrigin, serviceRpc, sessionId} from '../../../lib/yaqoot/server';
import {
  EDITABLE, SasUncertain, sasActivationData, sasChangeProfile, sasCheck, sasConfig, sasCreate, sasEdit, sasExtend, sasExtensions,
  sasHistory, sasProfiles, sasRename, sasRenew, sasUser, sasUsers,
} from '../../../lib/yaqoot/sas4';
export const dynamic = 'force-dynamic';

// ربط SAS4 المباشر.
// • القراءة: جلسة سارية + صلاحية subscribers.read على حساب الموزع (web_sas_direct_read).
// • العمليات: web_sas_op_begin يفحص الصلاحية ويمنع التكرار ويعطي transaction_id، ثم ينفّذ الخادم في SAS4،
//   ثم web_sas_op_finish يسجل النتيجة (success / failed / unknown). لا تُحفظ كلمات المرور.

const expired = (req: Request) => json({ok: false, reason: 'session_expired'}, 401, {'Set-Cookie': clearCookie(req, SESSION_COOKIE)});
const accountParam = (v: unknown) => sasConfig().accountId || (typeof v === 'string' && v ? v : null);

function userId(v: unknown) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new ServerError('invalid_input', 400, 'رقم المشترك لدى SAS4 غير صالح.');
  return n;
}

function text(v: unknown, max: number) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export async function GET(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  const sid = sessionId(req);
  if (!sid) return json({ok: false, reason: 'session_expired'}, 401);
  const url = new URL(req.url);
  const p = url.searchParams;
  const op = p.get('op') || 'status';
  try {
    const cfg = sasConfig();
    if (op === 'status') {
      await serviceRpc('web_sas_status', {p_session_id: sid, p_params: {}});
      return json({ok: true, direct: cfg.configured, host: cfg.configured ? cfg.host : null});
    }
    if (!cfg.configured) return json({ok: false, reason: 'sas_not_configured', message: 'ربط SAS4 المباشر غير مفعّل على الخادم.'}, 503);
    const acc = await serviceRpc<{account_id: string}>('web_sas_direct_read', {p_session_id: sid, p_params: {account_id: accountParam(p.get('account_id'))}});
    switch (op) {
      case 'check': return json(await sasCheck());
      case 'users': {
        const q = p.get('q') || '';
        if (q.trim().length < 2) return json({ok: false, reason: 'invalid_input', message: 'اكتب حرفين على الأقل.'}, 400);
        const page = Math.min(Math.max(Number(p.get('page')) || 1, 1), 50);
        return json({ok: true, ...(await sasUsers(q, page))});
      }
      case 'user': {
        const id = userId(p.get('id'));
        const [user, activation, ops] = await Promise.all([
          sasUser(id),
          sasActivationData(id).catch(() => null),
          serviceRpc<{ops?: unknown[]}>('web_sas_ops_list', {p_session_id: sid, p_params: {account_id: acc.account_id, sas_user_id: id}}).catch(() => ({ops: []})),
        ]);
        return json({ok: true, user, activation, ops: ops.ops || []});
      }
      case 'history': return json({ok: true, history: await sasHistory(userId(p.get('id')), Math.max(Number(p.get('page')) || 1, 1))});
      case 'extensions': return json({ok: true, ...(await sasExtensions(userId(p.get('id'))))});
      case 'profiles': return json({ok: true, profiles: await sasProfiles()});
      case 'ops': return json(await serviceRpc('web_sas_ops_list', {p_session_id: sid, p_params: {account_id: acc.account_id}}));
      default: return json({ok: false, reason: 'unknown_op'}, 400);
    }
  } catch (err) {
    if (err instanceof ServerError && err.code === 'session_expired') return expired(req);
    return fail(err);
  }
}

type Begin = {ok: boolean; duplicate: boolean; id: string; status: string; transaction_id: string; result?: unknown};

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  const sid = sessionId(req);
  if (!sid) return json({ok: false, reason: 'session_expired'}, 401);
  let begun: Begin | null = null;
  try {
    if (!sasConfig().configured) return json({ok: false, reason: 'sas_not_configured', message: 'ربط SAS4 المباشر غير مفعّل على الخادم.'}, 503);
    const b = await readJson(req);
    const op = text(b.op, 20);
    const ref = text(b.client_ref, 80);

    // التحقق من المدخلات قبل أي تسجيل أو اتصال.
    let sasUserId: number | null = null;
    let summary: Record<string, unknown> = {};
    let run: (tx: string) => Promise<unknown>;
    switch (op) {
      case 'renew': {
        sasUserId = userId(b.user_id);
        const method = b.method === 'card' ? 'card' : 'credit';
        const pin = text(b.pin, 64);
        if (method === 'card' && !pin) throw new ServerError('invalid_input', 400, 'أدخل رقم الكارت.');
        const expected = typeof b.expected_amount === 'number' ? b.expected_amount : undefined;
        if (method === 'credit' && expected === undefined) throw new ServerError('invalid_input', 400, 'حدّث كلفة التجديد أولاً.');
        const comments = text(b.comments, 200);
        summary = {method, expected_amount: expected ?? null, username: text(b.username, 80)};
        run = tx => sasRenew({userId: sasUserId!, method, pin, expectedAmount: expected, comments, transactionId: tx});
        break;
      }
      case 'extend': {
        sasUserId = userId(b.user_id);
        const profileId = userId(b.profile_id);
        summary = {profile_id: profileId, profile_name: text(b.profile_name, 80), username: text(b.username, 80)};
        run = tx => sasExtend({userId: sasUserId!, profileId, transactionId: tx});
        break;
      }
      case 'change_profile': {
        sasUserId = userId(b.user_id);
        const profileId = userId(b.profile_id);
        summary = {profile_id: profileId, profile_name: text(b.profile_name, 80), username: text(b.username, 80)};
        run = tx => sasChangeProfile({userId: sasUserId!, profileId, transactionId: tx});
        break;
      }
      case 'rename': {
        sasUserId = userId(b.user_id);
        const nu = text(b.new_username, 64);
        if (!/^[a-zA-Z0-9.@_:-]{3,64}$/.test(nu)) throw new ServerError('invalid_input', 400, 'اسم المستخدم الجديد غير صالح (حروف إنجليزية وأرقام و . @ _ - فقط).');
        summary = {from: text(b.username, 80), to: nu};
        run = () => sasRename({userId: sasUserId!, newUsername: nu});
        break;
      }
      case 'edit': {
        sasUserId = userId(b.user_id);
        const src = (b.changes && typeof b.changes === 'object' ? b.changes : {}) as Record<string, unknown>;
        const changes: Record<string, string | number> = {};
        for (const k of EDITABLE) {
          if (!(k in src)) continue;
          if (k === 'enabled') changes.enabled = src.enabled === true || src.enabled === 1 ? 1 : 0;
          else changes[k] = text(src[k], k === 'notes' ? 1000 : 120);
        }
        if (!Object.keys(changes).length) throw new ServerError('invalid_input', 400, 'لا توجد تغييرات.');
        summary = {fields: Object.keys(changes), username: text(b.username, 80), ...('enabled' in changes ? {enabled: changes.enabled} : {})};
        run = () => sasEdit({userId: sasUserId!, changes});
        break;
      }
      case 'create': {
        const username = text(b.username, 64);
        const password = typeof b.password === 'string' ? b.password : '';
        const profileId = userId(b.profile_id);
        if (!/^[a-zA-Z0-9.@_:-]{3,64}$/.test(username)) throw new ServerError('invalid_input', 400, 'اسم المستخدم غير صالح (حروف إنجليزية وأرقام و . @ _ - فقط).');
        if (password.length < 4 || password.length > 64) throw new ServerError('invalid_input', 400, 'كلمة المرور بين 4 و 64 حرفاً.');
        const firstname = text(b.firstname, 80), lastname = text(b.lastname, 80), phone = text(b.phone, 30);
        summary = {username, profile_id: profileId, profile_name: text(b.profile_name, 80), name: `${firstname} ${lastname}`.trim()};
        run = () => sasCreate({username, password, profileId, firstname, lastname, phone});
        break;
      }
      default:
        return json({ok: false, reason: 'unknown_op'}, 400);
    }

    begun = await serviceRpc<Begin>('web_sas_op_begin', {p_session_id: sid, p_payload: {
      op, client_ref: ref, account_id: accountParam(b.account_id), sas_user_id: sasUserId, summary, confirm_repeat: b.confirm_repeat === true,
    }});
    if (begun.duplicate) return json({ok: true, duplicate: true, result: begun.result ?? null});

    let result: unknown;
    try {
      result = await run(begun.transaction_id);
    } catch (err) {
      const uncertain = err instanceof SasUncertain;
      const msg = err instanceof ServerError ? err.detail || err.code : err instanceof Error ? err.message : 'خطأ';
      await serviceRpc('web_sas_op_finish', {p_id: begun.id, p_status: uncertain ? 'unknown' : 'failed', p_result: null, p_error: msg}).catch(() => null);
      if (uncertain) return json({ok: false, reason: 'sas_uncertain', message: msg}, 502);
      throw err;
    }
    await serviceRpc('web_sas_op_finish', {p_id: begun.id, p_status: 'success', p_result: result, p_error: null}).catch(() => null);
    return json({ok: true, duplicate: false, transaction_id: begun.transaction_id, result});
  } catch (err) {
    if (err instanceof ServerError && err.code === 'session_expired') return expired(req);
    return fail(err);
  }
}
