// عميل SAS4 مباشر من الخادم، بالمسارات الموثّقة فقط في sas4connector-php الرسمي:
//   POST {admin}/login       ← {payload: AES({username,password})} → {token}
//   POST {admin}/index/user  ← {payload: AES(...)} مع Bearer token → قائمة المشتركين
// التشفير متوافق مع CryptoJS/OpenSSL: "Salted__" + salt(8) + AES-256-CBC، والمفتاح والـ IV بـ EVP_BytesToKey(MD5).
// بيانات دخول الموزع أسرار في Cloudflare Worker فقط (SAS4_USERNAME / SAS4_PASSWORD) ولا تُكتب في الكود أو قاعدة البيانات.
// لا توجد هنا أي عملية كتابة (تفعيل، تجديد، إنشاء مشترك): مساراتها غير موثّقة.
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {ServerError} from './server';

// مفتاح التشفير الثابت في واجهة SAS4 نفسها (منشور في الموصل الرسمي، وليس سرّاً خاصاً بحسابك).
const SAS_PASSPHRASE = 'abcdefghijuklmno0123456789012345';
const DEFAULT_HOST = 'reseller.nbtel.iq';

type SasEnv = {SAS4_HOST?: string; SAS4_USERNAME?: string; SAS4_PASSWORD?: string; SAS4_ACCOUNT_ID?: string};

export function sasConfig() {
  const e = env as unknown as SasEnv;
  const host = (e.SAS4_HOST || DEFAULT_HOST).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const username = (e.SAS4_USERNAME || '').trim();
  const password = e.SAS4_PASSWORD || '';
  return {host, username, password, accountId: (e.SAS4_ACCOUNT_ID || '').trim() || null, configured: !!(host && username && password)};
}

function evpKdf(pass: Buffer, salt: Buffer) {
  let out = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (out.length < 48) {
    prev = createHash('md5').update(Buffer.concat([prev, pass, salt])).digest();
    out = Buffer.concat([out, prev]);
  }
  return {key: out.subarray(0, 32), iv: out.subarray(32, 48)};
}

export function sasEncrypt(plain: string) {
  const salt = randomBytes(8);
  const {key, iv} = evpKdf(Buffer.from(SAS_PASSPHRASE), salt);
  const c = createCipheriv('aes-256-cbc', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([Buffer.from('Salted__'), salt, ct]).toString('base64');
}

export function sasDecrypt(b64: string) {
  const raw = Buffer.from(b64, 'base64');
  if (raw.subarray(0, 8).toString() !== 'Salted__') throw new Error('bad_format');
  const {key, iv} = evpKdf(Buffer.from(SAS_PASSPHRASE), raw.subarray(8, 16));
  const d = createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([d.update(raw.subarray(16)), d.final()]).toString('utf8');
}

// رمز الجلسة لدى SAS4 يبقى في ذاكرة الـ Worker فقط لدقائق، ولا يُحفظ أو يُرسل للتطبيق.
let cached: {token: string; at: number; key: string} | null = null;
const TOKEN_TTL = 10 * 60 * 1000;

async function call(route: string, body: unknown, token?: string) {
  const {host} = sasConfig();
  let res: Response;
  try {
    res = await fetch(`https://${host}/admin/api/index.php/api/${route}`, {
      method: 'POST',
      headers: {Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
      body: JSON.stringify({payload: sasEncrypt(JSON.stringify(body))}),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ServerError('sas_unreachable', 502, 'تعذر الوصول إلى خادم SAS4.');
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return {status: res.status, data};
}

async function login(force = false) {
  const cfg = sasConfig();
  if (!cfg.configured) throw new ServerError('sas_not_configured', 503, 'ربط SAS4 المباشر غير مفعّل على الخادم.');
  const key = `${cfg.host}|${cfg.username}`;
  if (!force && cached && cached.key === key && Date.now() - cached.at < TOKEN_TTL) return cached.token;
  const r = await call('login', {username: cfg.username, password: cfg.password});
  const token = (r.data as {token?: unknown} | null)?.token;
  if (r.status === 401 || r.status === 403 || r.status === 422 || (r.status < 300 && typeof token !== 'string')) {
    cached = null;
    throw new ServerError('sas_auth_failed', 502, 'رفض SAS4 بيانات دخول الموزع. راجع SAS4_USERNAME و SAS4_PASSWORD.');
  }
  if (r.status >= 300 || typeof token !== 'string' || !token) {
    throw new ServerError('sas_error', 502, `خطأ من SAS4 (${r.status}).`);
  }
  cached = {token, at: Date.now(), key};
  return token;
}

async function authed(route: string, body: unknown) {
  let token = await login();
  let r = await call(route, body, token);
  if (r.status === 401) {
    token = await login(true);
    r = await call(route, body, token);
  }
  if (r.status === 401 || r.status === 403) throw new ServerError('sas_forbidden', 502, 'حساب الموزع لا يملك صلاحية هذه القراءة في SAS4.');
  if (r.status >= 300) throw new ServerError('sas_error', 502, `خطأ من SAS4 (${r.status}).`);
  return r.data;
}

export async function sasCheck() {
  await login(true);
  return {ok: true};
}

const PICK = ['id', 'username', 'firstname', 'lastname', 'phone', 'mobile', 'expiration', 'enabled', 'balance', 'profile_id',
  'profile_name', 'parent_id', 'parent_username', 'created_at', 'last_online', 'online_status', 'status', 'notes'];

function slim(u: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const k of PICK) if (u[k] !== undefined && u[k] !== null) o[k] = u[k];
  const profile = u.profile as {name?: unknown} | undefined;
  if (o.profile_name === undefined && profile && typeof profile.name === 'string') o.profile_name = profile.name;
  if (o.phone === undefined && typeof u.mobile === 'string') o.phone = u.mobile;
  return o;
}

/** قائمة مشتركي SAS4. القائمة نفسها موثّقة (index/user)؛ مفاتيح البحث والصفحات تُرسل بشكل إضافي،
 *  وإن تجاهلها الخادم تبقى الفلترة محلياً على ما أعاده، فلا تُعرض نتيجة غير مطابقة. */
export async function sasUsers(q: string, page = 1) {
  const search = q.trim().slice(0, 60);
  const data = await authed('index/user', {page, count: 50, sortBy: 'username', direction: 'asc', search, columns: ['username', 'firstname', 'lastname', 'phone', 'expiration', 'balance']});
  const d = data as {data?: unknown; total?: unknown; last_page?: unknown} | unknown[] | null;
  const rows = (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []) as Record<string, unknown>[];
  const needle = search.toLowerCase();
  const users = rows.filter(r => r && typeof r === 'object').map(slim).filter(u => {
    if (!needle) return true;
    return ['username', 'firstname', 'lastname', 'phone'].some(k => String(u[k] ?? '').toLowerCase().includes(needle))
      || `${u.firstname ?? ''} ${u.lastname ?? ''}`.toLowerCase().includes(needle);
  });
  const total = !Array.isArray(d) && typeof d?.total === 'number' ? d.total : null;
  return {users, total, returned: rows.length};
}
