/**
 * Trial24 — أدوات مساعدة عامة على الخادم
 * لا اعتماديات خارجية إطلاقًا.
 */

export const HOUR_MS = 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

/** خطأ أعمال معروف — يُترجم إلى استجابة HTTP منظمة. */
export class AppError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (code, msg, details) => new AppError(code, msg, 400, details);
export const forbidden = (code, msg, details) => new AppError(code, msg, 403, details);
export const notFound = (code, msg, details) => new AppError(code, msg, 404, details);
export const conflict = (code, msg, details) => new AppError(code, msg, 409, details);

/** وقت الخادم — المصدر الوحيد للحقيقة الزمنية في النظام كله. */
export const serverNow = () => Date.now();

/** مُولّد أرقام تسلسلية قابلة للقراءة: TRL-2026-0007 */
export function nextSequence(db, key, prefix) {
  const counters = db.data.counters || (db.data.counters = {});
  const year = new Date(serverNow()).getUTCFullYear();
  const bucket = `${key}:${year}`;
  counters[bucket] = (counters[bucket] || 0) + 1;
  return `${prefix}-${year}-${String(counters[bucket]).padStart(4, '0')}`;
}

/** مُعرّف داخلي عشوائي (لا يُعرض للمستخدم). */
export function uid(prefix = 'id') {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

/** مفتاح اليوم (YYYY-MM-DD) بحسب المنطقة الزمنية للمتجر — لحساب "تنتهي اليوم". */
export function dayKey(ms, timeZone = 'Asia/Baghdad') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch {
    // احتياط: إزاحة ثابتة +03:00 (بغداد) إن لم تتوفر بيانات المناطق الزمنية.
    const shifted = new Date(ms + 3 * HOUR_MS);
    return shifted.toISOString().slice(0, 10);
  }
}

/** تطبيع نص IMEI/Serial للمقارنة: أرقام لاتينية، بدون فراغات أو شرطات. */
export function normalizeSerial(value) {
  if (value == null) return '';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return String(value)
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/[\s\-_.]/g, '')
    .toUpperCase();
}

/** مقارنة IMEI/Serial بأمان (بدون تسريب توقيت — غير حساس أمنيًا لكنه منظم). */
export const serialMatches = (a, b) => {
  const na = normalizeSerial(a);
  const nb = normalizeSerial(b);
  return na.length > 0 && na === nb;
};

/** قصّ رقم إلى حدود دنيا/عليا. */
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** تحويل آمن إلى عدد صحيح موجب. */
export function toPositiveNumber(value, fieldName, { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest('INVALID_NUMBER', `القيمة غير صالحة: ${fieldName}`);
  if (n < 0 || (!allowZero && n === 0)) {
    throw badRequest('INVALID_NUMBER', `يجب أن تكون القيمة أكبر من صفر: ${fieldName}`);
  }
  return n;
}

/** تنظيف نص من المستخدم قبل التخزين. */
export function cleanText(value, { max = 500 } = {}) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** نسخة عميقة بسيطة (بيانات JSON فقط). */
export const deepClone = (value) => JSON.parse(JSON.stringify(value));

/** فرز تنازلي حسب حقل رقمي. */
export const byDesc = (key) => (a, b) => (b[key] || 0) - (a[key] || 0);

/** نسبة مئوية مقرّبة بخانة عشرية واحدة. */
export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
