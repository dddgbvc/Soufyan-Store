// عميل SAS4 مباشر من الخادم (واجهة الإدارة /admin/api/index.php/api/).
// المرجع: توثيق «SAS4 for developers» الرسمي من Snono Systems (documenter.getpostman.com/view/11765341/U16byA2y)
// والموصل الرسمي sas4connector-php. أرقام المسارات أدناه هي أرقامها في ذلك التوثيق.
// التشفير متوافق مع CryptoJS/OpenSSL: "Salted__" + salt(8) + AES-256-CBC، والمفتاح والـ IV بـ EVP_BytesToKey(MD5).
// بيانات دخول الموزع أسرار في Cloudflare Worker فقط (SAS4_USERNAME / SAS4_PASSWORD) ولا تُكتب في الكود أو قاعدة البيانات.
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {ServerError} from './server';

// مفتاح التشفير الثابت في بروتوكول SAS4 نفسه (منشور في التوثيق الرسمي، وليس سرّاً خاصاً بحسابك).
const SAS_PASSPHRASE = 'abcdefghijuklmno0123456789012345';
const DEFAULT_HOST = 'reseller.nbtel.iq';

type SasEnv = {SAS4_HOST?: string; SAS4_USERNAME?: string; SAS4_PASSWORD?: string; SAS4_ACCOUNT_ID?: string};
type Obj = Record<string, unknown>;

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

// ---------------------------------------------------------------- النقل

/** خطأ اتصال أثناء عملية كتابة: لا نعرف إن نفّذها SAS4 أم لا. */
export class SasUncertain extends Error {}

let cached: {token: string; at: number; key: string} | null = null;
const TOKEN_TTL = 10 * 60 * 1000;

async function raw(method: 'GET' | 'POST' | 'PUT', route: string, body?: unknown, token?: string) {
  const {host} = sasConfig();
  const res = await fetch(`https://${host}/admin/api/index.php/api/${route}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    body: body !== undefined ? JSON.stringify({payload: sasEncrypt(JSON.stringify(body))}) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  let data: unknown = null;
  if (text.trim()) { try { data = JSON.parse(text); } catch { data = {raw: text.slice(0, 300)}; } }
  return {status: res.status, data};
}

async function login(force = false) {
  const cfg = sasConfig();
  if (!cfg.configured) throw new ServerError('sas_not_configured', 503, 'ربط SAS4 المباشر غير مفعّل على الخادم.');
  const key = `${cfg.host}|${cfg.username}`;
  if (!force && cached && cached.key === key && Date.now() - cached.at < TOKEN_TTL) return cached.token;
  let r;
  try { r = await raw('POST', 'login', {username: cfg.username, password: cfg.password}); }
  catch { throw new ServerError('sas_unreachable', 502, 'تعذر الوصول إلى خادم SAS4.'); }
  const token = (r.data as {token?: unknown} | null)?.token;
  if (typeof token !== 'string' || !token) {
    cached = null;
    if (r.status < 500) throw new ServerError('sas_auth_failed', 502, 'رفض SAS4 بيانات دخول الموزع. راجع SAS4_USERNAME و SAS4_PASSWORD.');
    throw new ServerError('sas_error', 502, `خطأ من SAS4 (${r.status}).`);
  }
  cached = {token, at: Date.now(), key};
  return token;
}

const RSP: Record<string, string> = {
  rsp_insufficient_balance: 'رصيد الموزع غير كافٍ.',
  rsp_not_enough_balance: 'رصيد الموزع غير كافٍ.',
  rsp_permission_denied: 'حساب الموزع لا يملك صلاحية هذه العملية في SAS4.',
  rsp_username_exists: 'اسم المستخدم مستعمل.',
  rsp_user_exists: 'اسم المستخدم مستعمل.',
  rsp_invalid_pin: 'رقم الكارت غير صحيح.',
};

/** رفض صريح من SAS4 داخل جسم الرد (قد يأتي مع HTTP 200). */
function rejection(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Obj;
  const st = d.status;
  const bad = st === false || st === -1 || st === '-1' || st === 0 || st === '0' || (typeof st === 'number' && st >= 400)
    || (typeof st === 'string' && /^[45]\d\d$/.test(st)) || d.success === false || d.error !== undefined || d.errors !== undefined;
  if (!bad) return null;
  const m = [d.message, d.msg, d.error].find(v => typeof v === 'string' && v) as string | undefined;
  if (m && RSP[m]) return RSP[m];
  if (m) return m.startsWith('rsp_') ? `رفض SAS4: ${m.slice(4).replace(/_/g, ' ')}` : m.slice(0, 200);
  const errs = d.errors && typeof d.errors === 'object' ? Object.values(d.errors as Obj).flat().filter(v => typeof v === 'string') : [];
  return errs.length ? String(errs[0]).slice(0, 200) : 'رفض SAS4 الطلب.';
}

/** قراءة: تعيد المحاولة مرة بعد انتهاء الرمز. */
async function read(method: 'GET' | 'POST', route: string, body?: unknown) {
  let token = await login();
  let r;
  try {
    r = await raw(method, route, body, token);
    if (r.status === 401) { token = await login(true); r = await raw(method, route, body, token); }
  } catch {
    throw new ServerError('sas_unreachable', 502, 'تعذر الوصول إلى خادم SAS4.');
  }
  if (r.status === 401 || r.status === 403) throw new ServerError('sas_forbidden', 502, 'حساب الموزع لا يملك صلاحية هذه القراءة في SAS4.');
  if (r.status === 404) throw new ServerError('sas_not_found', 404, 'غير موجود في SAS4.');
  if (r.status >= 300) throw new ServerError('sas_error', 502, `خطأ من SAS4 (${r.status}).`);
  const why = rejection(r.data);
  if (why) throw new ServerError('sas_rejected', 422, why);
  return r.data;
}

/** كتابة: لا إعادة إرسال تلقائية بعد بدء الطلب. انقطاع الاتصال = نتيجة غير مؤكدة. */
async function write(method: 'POST' | 'PUT', route: string, body: unknown) {
  const token = await login();
  let r;
  try { r = await raw(method, route, body, token); }
  catch { throw new SasUncertain('انقطع الاتصال بـ SAS4 أثناء العملية. لم تتأكد النتيجة: افتح المشترك وتحقق قبل إعادة المحاولة.'); }
  if (r.status === 401) {
    // الرمز انتهى قبل التنفيذ: SAS4 رفض الطلب دون تنفيذه، فإعادته بأمان مرة واحدة.
    const t2 = await login(true);
    try { r = await raw(method, route, body, t2); }
    catch { throw new SasUncertain('انقطع الاتصال بـ SAS4 أثناء العملية. لم تتأكد النتيجة: افتح المشترك وتحقق قبل إعادة المحاولة.'); }
  }
  if (r.status === 401 || r.status === 403) throw new ServerError('sas_forbidden', 422, 'حساب الموزع لا يملك صلاحية هذه العملية في SAS4.');
  if (r.status >= 500) throw new SasUncertain(`رد SAS4 بخطأ خادم (${r.status}). لم تتأكد النتيجة: تحقق من المشترك قبل إعادة المحاولة.`);
  if (r.status >= 300) throw new ServerError('sas_rejected', 422, rejection(r.data) || `رفض SAS4 الطلب (${r.status}).`);
  const why = rejection(r.data);
  if (why) throw new ServerError('sas_rejected', 422, why);
  return r.data;
}

const dataOf = (d: unknown) => (d && typeof d === 'object' && !Array.isArray(d) ? (d as Obj).data : undefined);

// ---------------------------------------------------------------- قراءة

export async function sasCheck() {
  await login(true);
  return {ok: true};
}

const PICK = ['id', 'username', 'firstname', 'lastname', 'phone', 'mobile', 'expiration', 'enabled', 'balance', 'profile_id',
  'profile_name', 'parent_id', 'parent_username', 'created_at', 'last_online', 'online_status', 'status', 'notes',
  'email', 'address', 'city', 'company', 'street', 'apartment', 'national_id', 'contract_id', 'auto_renew', 'mac_auth', 'static_ip',
  'simultaneous_sessions', 'last_ip_address', 'profileChange'];

function slim(u: Obj) {
  const o: Obj = {};
  for (const k of PICK) if (u[k] !== undefined && u[k] !== null) o[k] = u[k];
  const profile = (u.profile_details || u.profile) as {name?: unknown} | undefined;
  if (o.profile_name === undefined && profile && typeof profile.name === 'string') o.profile_name = profile.name;
  if (o.phone === undefined && typeof u.mobile === 'string') o.phone = u.mobile;
  return o;
}

/** #23/#24 قائمة المشتركين مع البحث. تُطابق النتائج محلياً أيضاً. */
export async function sasUsers(q: string, page = 1) {
  const search = q.trim().slice(0, 60);
  const data = await read('POST', 'index/user', {page, count: 50, sortBy: 'username', direction: 'asc', search,
    columns: ['username', 'firstname', 'lastname', 'phone', 'expiration', 'balance']});
  const d = data as {data?: unknown; total?: unknown} | unknown[] | null;
  const rows = (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []) as Obj[];
  const needle = search.toLowerCase();
  const users = rows.filter(r => r && typeof r === 'object').map(slim).filter(u => {
    if (!needle) return true;
    return ['username', 'firstname', 'lastname', 'phone'].some(k => String(u[k] ?? '').toLowerCase().includes(needle))
      || `${u.firstname ?? ''} ${u.lastname ?? ''}`.toLowerCase().includes(needle);
  });
  const total = !Array.isArray(d) && typeof d?.total === 'number' ? d.total : null;
  return {users, total, returned: rows.length};
}

/** #26 كل بيانات المشترك (خام، للاستعمال الداخلي في التعديل). */
async function rawUser(id: number) {
  const u = dataOf(await read('GET', `user/${id}`));
  if (!u || typeof u !== 'object' || String((u as Obj).id) !== String(id)) throw new ServerError('sas_not_found', 404, 'المشترك غير موجود في SAS4 أو لا يتبع حسابك.');
  return u as Obj;
}

export async function sasUser(id: number) {
  return slim(await rawUser(id));
}

/** #28 بيانات التفعيل: الباقة، سعر الوحدة، المبلغ المطلوب من رصيد الموزع، رصيد الموزع. */
export async function sasActivationData(id: number) {
  const d = dataOf(await read('GET', `user/activationData/${id}`));
  if (!d || typeof d !== 'object') throw new ServerError('sas_error', 502, 'بيانات التفعيل غير متاحة من SAS4.');
  return d as Obj;
}

/** #31 + #32 بيانات التمديد والباقات المسموح التمديد بها للباقة الحالية. */
export async function sasExtensions(id: number) {
  const info = dataOf(await read('GET', `user/extensionData/${id}`)) as Obj | undefined;
  const profileId = Number(info?.profile_id);
  if (!info || !Number.isInteger(profileId) || profileId < 1) throw new ServerError('sas_error', 502, 'بيانات التمديد غير متاحة من SAS4.');
  const list = dataOf(await read('GET', `allowedExtensions/${profileId}`));
  const options = (Array.isArray(list) ? list : []).filter((r): r is Obj => !!r && typeof r === 'object')
    .map(r => ({id: Number(r.id), name: String(r.name ?? '')})).filter(r => Number.isInteger(r.id) && r.id > 0 && r.name);
  return {info, options};
}

/** #66 الباقات المتاحة للموزع. */
export async function sasProfiles() {
  const list = dataOf(await read('GET', 'list/profile/0'));
  return (Array.isArray(list) ? list : []).filter((r): r is Obj => !!r && typeof r === 'object')
    .map(r => ({id: Number(r.id), name: String(r.name ?? '')})).filter(r => Number.isInteger(r.id) && r.id > 0 && r.name);
}

/** #45 سجل المشترك لدى SAS4. */
export async function sasHistory(id: number, page = 1) {
  const d = await read('POST', `index/UserHistory/${id}`, {page, count: 30, direction: 'desc', search: ''}) as {data?: unknown; total?: unknown} | null;
  const rows = (Array.isArray(d?.data) ? d.data : []) as Obj[];
  return rows.map(r => ({
    id: r.id, event: r.event, description: r.description, created_at: r.created_at,
    by: (r.manager_details as Obj | undefined)?.username ?? null,
  }));
}

/** #2 معلومات الحساب المتصل (رقمه لاستعماله كـ parent_id عند الإنشاء، ورصيده). */
export async function sasAuthInfo() {
  const d = await read('GET', 'auth') as {client?: Obj} | null;
  const c = d?.client || {};
  return {id: Number(c.id) || null, username: c.username ?? null, balance: c.balance ?? null};
}

// ---------------------------------------------------------------- عمليات

const money = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/** #29 تفعيل/تجديد. credit = من رصيد الموزع (يُتحقق أن المبلغ لم يتغير عما رآه الموظف)، card = كارت PIN. */
export async function sasRenew(p: {userId: number; method: 'credit' | 'card'; pin?: string; expectedAmount?: number; comments?: string; transactionId: string}) {
  const before = await rawUser(p.userId);
  if (p.method === 'credit') {
    const act = await sasActivationData(p.userId);
    const need = money(act.n_required_amount ?? act.required_amount);
    if (!Number.isFinite(need)) throw new ServerError('sas_error', 502, 'تعذر معرفة كلفة التجديد من SAS4.');
    if (p.expectedAmount === undefined || Math.abs(need - p.expectedAmount) > 0.001) {
      throw new ServerError('price_changed', 409, `كلفة التجديد في SAS4 أصبحت ${act.required_amount ?? need}. راجعها ثم أعد التأكيد.`);
    }
  }
  await write('POST', 'user/activate', {
    method: p.method, pin: p.method === 'card' ? p.pin || '' : '', user_id: String(p.userId),
    money_collected: true, comments: (p.comments || '').slice(0, 200), issue_invoice: false, transaction_id: p.transactionId,
  });
  const after = await rawUser(p.userId).catch(() => null);
  return {before_expiration: before.expiration ?? null, expiration: after?.expiration ?? null, profile_name: after?.profile_name ?? before.profile_name ?? null};
}

/** #33 تمديد بباقة تمديد مسموحة للباقة الحالية، من رصيد الموزع. */
export async function sasExtend(p: {userId: number; profileId: number; transactionId: string}) {
  const {options} = await sasExtensions(p.userId);
  if (!options.some(o => o.id === p.profileId)) throw new ServerError('invalid_input', 422, 'باقة التمديد غير مسموحة لهذا المشترك.');
  await write('POST', 'user/extend', {user_id: String(p.userId), profile_id: String(p.profileId), method: 'credit', transaction_id: p.transactionId});
  const after = await rawUser(p.userId).catch(() => null);
  return {expiration: after?.expiration ?? null};
}

/** #34 تغيير الباقة (للمشترك الفعّال يُطبَّق عند الانتهاء القادم حسب SAS4). */
export async function sasChangeProfile(p: {userId: number; profileId: number; transactionId: string}) {
  const profiles = await sasProfiles();
  if (!profiles.some(o => o.id === p.profileId)) throw new ServerError('invalid_input', 422, 'الباقة غير متاحة لحساب الموزع.');
  await write('POST', 'user/changeProfile', {user_id: String(p.userId), profile_id: String(p.profileId), method: 'credit', transaction_id: p.transactionId});
  const after = await rawUser(p.userId).catch(() => null);
  return {profile_id: after?.profile_id ?? null, profile_name: after?.profile_name ?? null, profileChange: after?.profileChange ?? null};
}

/** #27 إعادة تسمية اسم المستخدم. */
export async function sasRename(p: {userId: number; newUsername: string}) {
  await write('POST', `user/rename/${p.userId}`, {new_username: p.newUsername});
  return {username: p.newUsername};
}

// حقول نموذج المشترك في SAS4 التي يُعاد إرسالها كما هي عند التعديل حتى لا تُمسح (الحفظ في SAS4 يرسل النموذج كاملاً).
const FORM_FIELDS = ['profile_id', 'parent_id', 'enabled', 'expiration', 'firstname', 'lastname', 'phone', 'email', 'company',
  'address', 'city', 'street', 'apartment', 'contract_id', 'national_id', 'notes', 'site_id', 'group_id', 'auto_renew', 'mac_auth',
  'simultaneous_sessions', 'static_ip', 'mikrotik_winbox_group', 'mikrotik_framed_route', 'mikrotik_addresslist',
  'mikrotik_ipv6_prefix', 'user_type'];
export const EDITABLE = ['firstname', 'lastname', 'phone', 'email', 'address', 'city', 'notes', 'enabled'] as const;

/** تعديل بيانات المشترك: يقرأ النموذج الحالي ويغيّر الحقول المطلوبة فقط ثم يحفظ (PUT user/{id}). */
export async function sasEdit(p: {userId: number; changes: Partial<Record<(typeof EDITABLE)[number], string | number>>}) {
  const current = await rawUser(p.userId);
  const form: Obj = {};
  for (const k of FORM_FIELDS) if (k in current) form[k] = current[k];
  Object.assign(form, p.changes);
  await write('PUT', `user/${p.userId}`, form);
  return slim(await rawUser(p.userId).catch(() => ({...current, ...p.changes})));
}

/** #25 إنشاء مشترك جديد تحت حساب الموزع المتصل. */
export async function sasCreate(p: {username: string; password: string; profileId: number; firstname: string; lastname: string; phone: string}) {
  const profiles = await sasProfiles();
  if (!profiles.some(o => o.id === p.profileId)) throw new ServerError('invalid_input', 422, 'الباقة غير متاحة لحساب الموزع.');
  const me = await sasAuthInfo();
  if (!me.id) throw new ServerError('sas_error', 502, 'تعذر معرفة رقم حساب الموزع في SAS4.');
  const res = await write('POST', 'user', {
    username: p.username, password: p.password, confirm_password: p.password, profile_id: p.profileId,
    parent_id: me.id, firstname: p.firstname, lastname: p.lastname, phone: p.phone,
  });
  const id = (dataOf(res) as Obj | undefined)?.id ?? (res as Obj | null)?.id ?? null;
  return {id, username: p.username};
}
