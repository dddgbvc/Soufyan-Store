// طبقة الخادم: كل اتصال بـ Supabase يمر من هنا فقط.
// مفتاح service_role لا يغادر الخادم، والمتصفح يحمل كوكيز httpOnly فقط:
//   yq_store  = سرّ عشوائي لتفعيل المتصفح بحساب المحل (قاعدة البيانات تحفظ بصمته sha256 فقط)
//   yq_sess   = رقم جلسة الموظف بعد إدخال PIN (تنتهي بعد 30 دقيقة خمول أو 12 ساعة)
import {env} from 'cloudflare:workers';

export const STORE_COOKIE = 'yq_store';
export const SESSION_COOKIE = 'yq_sess';
const STORE_MAX_AGE = 60 * 60 * 24 * 180;
const SESSION_MAX_AGE = 60 * 60 * 12;

type Env = {SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string; SUPABASE_SERVICE_ROLE_KEY?: string};

function config() {
  const e = env as unknown as Env;
  const url = (e.SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = e.SUPABASE_ANON_KEY || '';
  const service = e.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anon || !service) throw new ServerError('not_configured', 503);
  return {url, anon, service};
}

export class ServerError extends Error {
  constructor(public code: string, public status = 400, public detail?: string) {
    super(code);
  }
}

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, {status, headers: {'Cache-Control': 'no-store', ...headers}});

export function fail(err: unknown) {
  if (err instanceof ServerError) return json({ok: false, reason: err.code, message: err.detail}, err.status);
  return json({ok: false, reason: 'server_error'}, 500);
}

export function sameOrigin(req: Request) {
  const origin = req.headers.get('Origin');
  return !origin || origin === new URL(req.url).origin;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get('Content-Type')?.includes('application/json')) throw new ServerError('invalid_content_type', 415);
  const text = await req.text();
  if (text.length > 4000) throw new ServerError('body_too_large', 413);
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new ServerError('invalid_json', 400);
  }
}

// ---------------------------------------------------------------- cookies
export function readCookie(req: Request, name: string) {
  const raw = req.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function cookie(req: Request, name: string, value: string, maxAge: number) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
export const storeCookie = (req: Request, secret: string) => cookie(req, STORE_COOKIE, secret, STORE_MAX_AGE);
export const sessionCookie = (req: Request, id: string) => cookie(req, SESSION_COOKIE, id, SESSION_MAX_AGE);
export const clearCookie = (req: Request, name: string) => cookie(req, name, '', 0);

// ---------------------------------------------------------------- crypto
export function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function storeSecretHash(req: Request) {
  const secret = readCookie(req, STORE_COOKIE);
  if (!secret || !/^[0-9a-f]{64}$/.test(secret)) return null;
  return sha256Hex(secret);
}

export function sessionId(req: Request) {
  const id = readCookie(req, SESSION_COOKIE);
  return id && /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

export function clientIp(req: Request) {
  return req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || '';
}

export function userAgent(req: Request) {
  return (req.headers.get('User-Agent') || '').slice(0, 400);
}

export function deviceLabel(ua: string) {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'جهاز';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'متصفح';
  return `ويب • ${browser} على ${os}`;
}

// ---------------------------------------------------------------- Supabase
async function rpcCall(fn: string, args: Record<string, unknown>, bearer: string, apikey: string) {
  const {url} = config();
  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      // مفاتيح Supabase الجديدة (sb_secret_/sb_publishable_) تُرسل في apikey فقط، ليست JWT.
      headers: {
        apikey,
        ...(bearer.startsWith('sb_') ? {} : {Authorization: `Bearer ${bearer}`}),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ServerError('upstream_unreachable', 502);
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const err = (body || {}) as {code?: string; message?: string};
    // 28000 = الجلسة انتهت أو الجهاز لم يعد مربوطاً، 42501 = صلاحية غير كافية
    if (err.code === '28000') throw new ServerError('session_expired', 401, err.message);
    if (err.code === '42501') throw new ServerError('forbidden', 403, err.message);
    if (err.code === 'PGRST202') throw new ServerError('migration_missing', 503);
    throw new ServerError('upstream_error', 502, err.message);
  }
  return body;
}

/** استدعاء دالة بصلاحية الخادم (service_role). */
export function serviceRpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>) {
  const {service} = config();
  return rpcCall(fn, args, service, service) as Promise<T>;
}

/** استدعاء دالة بهوية مستخدم Auth (حساب المحل). */
export function userRpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>, accessToken: string) {
  const {anon} = config();
  return rpcCall(fn, args, accessToken, anon) as Promise<T>;
}

/** التحقق من بريد وكلمة مرور حساب المحل عبر Supabase Auth. */
export async function passwordSignIn(email: string, password: string) {
  const {url, anon} = config();
  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {apikey: anon, 'Content-Type': 'application/json'},
      body: JSON.stringify({email, password}),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ServerError('upstream_unreachable', 502);
  }
  const body = (await res.json().catch(() => ({}))) as {access_token?: string; error_code?: string; error?: string};
  if (res.status === 429) throw new ServerError('rate_limited', 429);
  if (!res.ok || !body.access_token) {
    if (body.error_code === 'email_not_confirmed') throw new ServerError('email_not_confirmed', 401);
    throw new ServerError('bad_credentials', 401);
  }
  return body.access_token;
}

/** إنهاء رمز Auth فور استعماله؛ لا نحتفظ برموز حساب المحل في الخادم أو المتصفح. */
export async function signOutToken(accessToken: string) {
  const {url, anon} = config();
  try {
    await fetch(`${url}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: {apikey: anon, Authorization: `Bearer ${accessToken}`},
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // الرمز قصير العمر أصلاً؛ فشل الإلغاء لا يمنع إكمال التفعيل.
  }
}

// ---------------------------------------------------------------- session
export type Employee = {id: string; name: string; role: string; department: string | null; avatar_url: string | null};
export type Status =
  | {state: 'unpaired'}
  | {state: 'locked'; store_name: string}
  | {state: 'active'; store_name: string; employee: Employee; permissions: string[]; session_id: string};

export async function readStatus(req: Request): Promise<Status> {
  const hash = await storeSecretHash(req);
  if (!hash) return {state: 'unpaired'};
  const r = await serviceRpc<{ok: boolean; store_name?: string; session?: {session_id: string; employee: Employee; permissions: string[]} | null}>(
    'web_store_status',
    {p_secret_hash: hash, p_session_id: sessionId(req)},
  );
  if (!r.ok || !r.store_name) return {state: 'unpaired'};
  if (!r.session) return {state: 'locked', store_name: r.store_name};
  return {state: 'active', store_name: r.store_name, ...r.session};
}
