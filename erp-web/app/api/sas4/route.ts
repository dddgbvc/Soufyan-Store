import {SESSION_COOKIE, ServerError, clearCookie, fail, json, readJson, sameOrigin, serviceRpc, sessionId} from '../../../lib/yaqoot/server';
import {
  DEFAULT_HOST, EDITABLE, SasUncertain, login, normalizeHost, sasActivationData, sasChangeProfile, sasCreate, sasEdit, sasExtend,
  sasExtensions, sasHistory, sasProfiles, sasRename, sasRenew, sasUser, sasUsers, vaultOpen, vaultSeal, type SasLogin,
} from '../../../lib/yaqoot/sas4';
export const dynamic = 'force-dynamic';

// ربط SAS4 المباشر بالأبراج. كل برج حساب موزع بدخول محفوظ دائماً (كلمة المرور مشفرة، لا ترجع للتطبيق).
// • القراءة: جلسة سارية + صلاحية على البرج (web_sas_tower_login).
// • العمليات: web_sas_op_begin (صلاحية + منع تكرار + transaction_id) ← SAS4 ← web_sas_op_finish.
// • إدارة الأبراج (إضافة، تعديل، حذف): المدير فقط، والدخول يُختبر في SAS4 قبل الحفظ.

const expired = (req: Request) => json({ok: false, reason: 'session_expired'}, 401, {'Set-Cookie': clearCookie(req, SESSION_COOKIE)});

type Sealed = {tower_id: string; host: string; username: string; password_enc: string};

function open(t: Sealed): SasLogin {
  return {towerId: t.tower_id, host: t.host, username: t.username, password: vaultOpen(t.password_enc)};
}

/** يسجّل نتيجة الدخول على البرج عند فشل المصادقة، حتى تظهر في قائمة الأبراج. */
async function guarded<T>(L: SasLogin, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ServerError && err.code === 'sas_auth_failed') {
      await serviceRpc('web_sas_tower_mark', {p_tower: L.towerId, p_ok: false, p_error: err.detail}).catch(() => null);
    }
    throw err;
  }
}

function userId(v: unknown) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new ServerError('invalid_input', 400, 'رقم المشترك لدى SAS4 غير صالح.');
  return n;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  const sid = sessionId(req);
  if (!sid) return json({ok: false, reason: 'session_expired'}, 401);
  const p = new URL(req.url).searchParams;
  const op = p.get('op') || 'status';
  try {
    if (op === 'status' || op === 'towers') {
      const r = await serviceRpc<{towers?: unknown[]; can_manage?: boolean}>('web_sas_towers', {p_session_id: sid, p_params: {}});
      return json({ok: true, direct: (r.towers || []).length > 0, towers: r.towers || [], can_manage: !!r.can_manage, default_host: DEFAULT_HOST});
    }
    const tower = p.get('tower') || '';
    const sealed = await serviceRpc<Sealed>('web_sas_tower_login', {p_session_id: sid, p_params: {tower_id: tower, perm: 'subscribers.read'}});
    const L = open(sealed);
    return await guarded(L, async () => {
      switch (op) {
        case 'check':
          await login(L, true);
          await serviceRpc('web_sas_tower_mark', {p_tower: L.towerId, p_ok: true, p_error: null}).catch(() => null);
          return json({ok: true});
        case 'users': {
          const q = p.get('q') || '';
          if (q.trim().length < 2) return json({ok: false, reason: 'invalid_input', message: 'اكتب حرفين على الأقل.'}, 400);
          const page = Math.min(Math.max(Number(p.get('page')) || 1, 1), 50);
          return json({ok: true, ...(await sasUsers(L, q, page))});
        }
        case 'user': {
          const id = userId(p.get('id'));
          const [user, activation, ops] = await Promise.all([
            sasUser(L, id),
            sasActivationData(L, id).catch(() => null),
            serviceRpc<{ops?: unknown[]}>('web_sas_ops_list', {p_session_id: sid, p_params: {tower_id: L.towerId, sas_user_id: id}}).catch(() => ({ops: []})),
          ]);
          return json({ok: true, user, activation, ops: ops.ops || []});
        }
        case 'history': return json({ok: true, history: await sasHistory(L, userId(p.get('id')), Math.max(Number(p.get('page')) || 1, 1))});
        case 'extensions': return json({ok: true, ...(await sasExtensions(L, userId(p.get('id'))))});
        case 'profiles': return json({ok: true, profiles: await sasProfiles(L)});
        case 'ops': return json(await serviceRpc('web_sas_ops_list', {p_session_id: sid, p_params: {tower_id: L.towerId}}));
        default: return json({ok: false, reason: 'unknown_op'}, 400);
      }
    });
  } catch (err) {
    if (err instanceof ServerError && err.code === 'session_expired') return expired(req);
    return fail(err);
  }
}

type Begin = {ok: boolean; duplicate: boolean; id: string; status: string; transaction_id: string; result?: unknown; login?: Sealed};

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  const sid = sessionId(req);
  if (!sid) return json({ok: false, reason: 'session_expired'}, 401);
  try {
    const b = await readJson(req);
    const op = text(b.op, 20);

    // ---------------------------------------------------- إدارة الأبراج (المدير)
    if (op === 'tower_save') {
      const id = text(b.id, 40) || null;
      const name = text(b.name, 60);
      const password = typeof b.password === 'string' ? b.password : '';
      const username = text(b.username, 120);
      const host = normalizeHost(text(b.host, 120) || DEFAULT_HOST);
      if (!/^[a-z0-9.-]{3,120}(:\d{1,5})?$/.test(host)) throw new ServerError('invalid_input', 400, 'عنوان خادم SAS4 غير صالح.');
      let password_enc: string | null = null;
      if (password) {
        if (!username) throw new ServerError('invalid_input', 400, 'أدخل اسم المستخدم.');
        if (password.length > 200) throw new ServerError('invalid_input', 400, 'كلمة المرور طويلة جداً.');
        // التحقق من الدخول قبل الحفظ: لا يُحفظ برج ببيانات خاطئة.
        await login({towerId: 'new:' + (id || username), host, username, password}, true);
        password_enc = vaultSeal(password);
      } else if (!id) {
        throw new ServerError('invalid_input', 400, 'أدخل اسم المستخدم وكلمة المرور.');
      }
      const r = await serviceRpc<{id: string}>('web_sas_tower_save', {p_session_id: sid, p_payload: {
        id, name, ...(password_enc ? {host, username, password_enc} : {}),
        ...(b.reseller_account_id !== undefined ? {reseller_account_id: text(b.reseller_account_id, 40) || null} : {}),
      }});
      return json({ok: true, id: r.id});
    }
    if (op === 'tower_delete') {
      await serviceRpc('web_sas_tower_delete', {p_session_id: sid, p_payload: {id: text(b.id, 40)}});
      return json({ok: true});
    }

    // ---------------------------------------------------- عمليات المشتركين
    const ref = text(b.client_ref, 80);
    let sasUserId: number | null = null;
    let summary: Record<string, unknown> = {};
    let run: (L: SasLogin, tx: string) => Promise<unknown>;
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
        run = (L, tx) => sasRenew(L, {userId: sasUserId!, method, pin, expectedAmount: expected, comments, transactionId: tx});
        break;
      }
      case 'extend': {
        sasUserId = userId(b.user_id);
        const profileId = userId(b.profile_id);
        summary = {profile_id: profileId, profile_name: text(b.profile_name, 80), username: text(b.username, 80)};
        run = (L, tx) => sasExtend(L, {userId: sasUserId!, profileId, transactionId: tx});
        break;
      }
      case 'change_profile': {
        sasUserId = userId(b.user_id);
        const profileId = userId(b.profile_id);
        summary = {profile_id: profileId, profile_name: text(b.profile_name, 80), username: text(b.username, 80)};
        run = (L, tx) => sasChangeProfile(L, {userId: sasUserId!, profileId, transactionId: tx});
        break;
      }
      case 'rename': {
        sasUserId = userId(b.user_id);
        const nu = text(b.new_username, 64);
        if (!/^[a-zA-Z0-9.@_:-]{3,64}$/.test(nu)) throw new ServerError('invalid_input', 400, 'اسم المستخدم الجديد غير صالح (حروف إنجليزية وأرقام و . @ _ - فقط).');
        summary = {from: text(b.username, 80), to: nu};
        run = L => sasRename(L, {userId: sasUserId!, newUsername: nu});
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
        run = L => sasEdit(L, {userId: sasUserId!, changes});
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
        run = L => sasCreate(L, {username, password, profileId, firstname, lastname, phone});
        break;
      }
      default:
        return json({ok: false, reason: 'unknown_op'}, 400);
    }

    // حماية من العمل على مشترك آخر بنفس الرقم في برج مختلف: اسم المستخدم المتوقع يجب أن يطابق SAS4.
    const expectedUser = op === 'create' ? '' : text(b.username, 80);
    if (sasUserId && expectedUser) {
      const inner = run;
      run = async (L, tx) => {
        const u = await sasUser(L, sasUserId!);
        if (String(u.username ?? '').toLowerCase() !== expectedUser.toLowerCase()) {
          throw new ServerError('user_mismatch', 409, `المشترك رقم ${sasUserId} في هذا البرج هو «${u.username ?? '؟'}» وليس «${expectedUser}». اختر البرج الصحيح.`);
        }
        return inner(L, tx);
      };
    }

    const begun = await serviceRpc<Begin>('web_sas_op_begin', {p_session_id: sid, p_payload: {
      op, client_ref: ref, tower_id: text(b.tower_id, 40), sas_user_id: sasUserId, summary,
    }});
    if (begun.duplicate || !begun.login) return json({ok: true, duplicate: true, result: begun.result ?? null});

    let result: unknown;
    try {
      const L = open(begun.login);
      result = await guarded(L, () => run(L, begun.transaction_id));
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
