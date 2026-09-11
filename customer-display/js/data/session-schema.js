/**
 * عقد بيانات جلسة البيع بين الكاشير وشاشة الزبون.
 *
 * أي واجهة خلفية (WebSocket / Supabase / أي شيء آخر) يكفي أن تُرسل كائنًا
 * بهذا الشكل — أو جزءًا منه — وستعرضه الشاشة كما هو دون تعديل في الواجهة.
 *
 * @typedef {'loading'|'idle'|'browsing'|'paying'|'paid'|'held'|'cancelled'|'error'} SessionStatus
 *
 * @typedef {object} LineItem
 * @property {string}  id          معرّف فريد للسطر (وليس للمنتج) — يُستخدم لتتبّع الحركة
 * @property {string}  name        اسم المنتج كما يُعرض للزبون
 * @property {string} [variant]    وصف قصير: السعة، اللون، الموديل…
 * @property {number}  qty         الكمية
 * @property {number}  unitPrice   سعر الوحدة قبل الخصم
 * @property {number} [lineDiscount] خصم على هذا السطر (بالمبلغ لا بالنسبة)
 * @property {string} [imageUrl]   صورة المنتج من قاعدة البيانات — اختيارية
 *
 * @typedef {object} Session
 * @property {number}        version
 * @property {SessionStatus} status
 * @property {LineItem[]}    items
 * @property {number}        discount     خصم على مستوى الفاتورة كاملة
 * @property {number|null}   taxRate      نسبة مئوية، أو null إذا كانت الضريبة غير مفعّلة
 * @property {number}        paid         المبلغ المدفوع
 * @property {string|null}   invoiceNumber
 * @property {string|null}   cashier
 * @property {string|null}   message      نص إضافي يظهر في شاشات الحالة
 * @property {number}        updatedAt
 */

export const SESSION_VERSION = 1;

/** @type {SessionStatus[]} */
export const SESSION_STATUSES = [
  'loading',
  'idle',
  'browsing',
  'paying',
  'paid',
  'held',
  'cancelled',
  'error',
];

/** جلسة فارغة — نقطة البداية وشاشة «بانتظار عملية جديدة». */
export function createEmptySession(overrides = {}) {
  return normalizeSession({
    version: SESSION_VERSION,
    status: 'idle',
    items: [],
    discount: 0,
    taxRate: null,
    paid: 0,
    invoiceNumber: null,
    cashier: null,
    message: null,
    updatedAt: Date.now(),
    ...overrides,
  });
}

const toNumber = (value, fallback = 0) => {
  const n = typeof value === 'string' ? Number(value.replace(/[^\d.-]/g, '')) : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

let autoLineId = 0;

/** يطبّع سطر منتج قادم من أي مصدر إلى الشكل الذي تتوقّعه الواجهة. */
export function normalizeLineItem(raw = {}) {
  const unitPrice = Math.max(0, toNumber(raw.unitPrice ?? raw.price ?? raw.unit_price));
  const qty = Math.max(0, toNumber(raw.qty ?? raw.quantity, 1));
  const lineDiscount = Math.max(0, toNumber(raw.lineDiscount ?? raw.discount ?? raw.line_discount));

  return {
    id: toText(raw.id ?? raw.lineId ?? raw.line_id) ?? `line-${++autoLineId}`,
    name: toText(raw.name ?? raw.title ?? raw.product_name) ?? 'منتج',
    variant: toText(raw.variant ?? raw.subtitle ?? raw.spec ?? raw.description),
    qty,
    unitPrice,
    // الخصم لا يتجاوز قيمة السطر أبدًا
    lineDiscount: Math.min(lineDiscount, unitPrice * qty),
    imageUrl: toText(raw.imageUrl ?? raw.image_url ?? raw.image ?? raw.thumbnail),
  };
}

/**
 * يطبّع أي حمولة قادمة من الشبكة إلى جلسة صالحة.
 * متسامح عمدًا: الحقول الناقصة تأخذ قيمًا افتراضية بدل أن تكسر الشاشة.
 * @returns {Session}
 */
export function normalizeSession(raw = {}) {
  const items = Array.isArray(raw.items) ? raw.items.map(normalizeLineItem) : [];
  const rawStatus = toText(raw.status);
  let status = SESSION_STATUSES.includes(/** @type {any} */ (rawStatus))
    ? /** @type {import('./session-schema.js').SessionStatus} */ (rawStatus)
    : 'idle';

  // لو وصلت أصناف والحالة ما زالت idle، فالزبون يتصفّح مشترياته فعليًا.
  if (status === 'idle' && items.length > 0) status = 'browsing';
  // ولو أُفرغت السلة ونحن في وضع التصفّح، نعود لشاشة الانتظار.
  if (status === 'browsing' && items.length === 0) status = 'idle';

  const taxRateRaw = raw.taxRate ?? raw.tax_rate;
  const taxRate =
    taxRateRaw === null || taxRateRaw === undefined || taxRateRaw === ''
      ? null
      : Math.max(0, toNumber(taxRateRaw));

  return {
    version: toNumber(raw.version, SESSION_VERSION),
    status,
    items,
    discount: Math.max(0, toNumber(raw.discount ?? raw.invoiceDiscount ?? raw.invoice_discount)),
    taxRate,
    paid: Math.max(0, toNumber(raw.paid ?? raw.paidAmount ?? raw.paid_amount)),
    invoiceNumber: toText(raw.invoiceNumber ?? raw.invoice_number ?? raw.invoice),
    cashier: toText(raw.cashier ?? raw.cashier_name),
    message: toText(raw.message ?? raw.note),
    updatedAt: toNumber(raw.updatedAt ?? raw.updated_at, Date.now()),
  };
}

/**
 * يدمج تحديثًا جزئيًا فوق جلسة قائمة.
 * `items` تُستبدل بالكامل عند وجودها (الكاشير هو مصدر الحقيقة للسلة).
 */
export function mergeSession(current, patch = {}) {
  if (!patch || typeof patch !== 'object') return current;
  const merged = { ...current, ...patch, updatedAt: Date.now() };
  if (!Object.hasOwn(patch, 'items')) merged.items = current.items;
  return normalizeSession(merged);
}
