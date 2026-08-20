// ============================================================================
// يحوّل ما تعيده دوال قاعدة البيانات إلى مواصفة مستند واحدة
// يستهلكها مولّد PDF ومولّد Excel معاً.
//
// نوعان من المستندات:
//   • مستند مفرد   (فاتورة بيع، كشف حساب، فاتورة صيانة، فاتورة مسترجعات)
//   • تقرير قائمة  (المبيعات، الديون، النواقص، المصروفات، الصيانة، المسترجعات…)
// كلاهما ينتهي إلى نفس القالب البصري.
// ============================================================================

import type { Align, DocSpec, StoreInfo, SummaryLine, Tone } from "./pdf.ts";
import { amount, dateIQ, money, qty, safeFileName, signedAmount, timeIQ, toNumber } from "./format.ts";
import { clean } from "./rtl.ts";

export const STORE: StoreInfo = {
  name: "مكتب سفيان للموبايل",
  subtitle: "قسم المحاسبة والمالية",
  address: "صلاح الدين — سامراء — الحويش — الشارع الرئيسي",
  phones: ["07731644450", "07744485771"],
  internetPhone: "07729096991",
  footer: "مكتب سفيان للموبايل · نظام إدارة المحل",
};

export type SheetColumn = { label: string; width: number; type: "text" | "number" };

export type SheetSpec = {
  sheetName: string;
  title: string;
  info: { label: string; value: string }[];
  columns: SheetColumn[];
  rows: (string | number)[][];
  summary: { label: string; value: string | number; money?: boolean; strong?: boolean }[];
  status: string;
};

export type BuiltDocument = {
  pdf: DocSpec;
  sheet: SheetSpec;
  fileBase: string;
  caption: string;
};

// ------------------------------ قواميس الحالات ------------------------------

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "نقدي",
  DEBT: "آجل (دين)",
  CARD: "بطاقة",
  TRANSFER: "تحويل",
};

/** نسخة مختصرة تُستعمل في التقارير الضيّقة. */
const PAYMENT_SHORT: Record<string, string> = {
  CASH: "نقدي",
  DEBT: "دين",
  CARD: "بطاقة",
  TRANSFER: "تحويل",
};

const REFUND_LABELS: Record<string, string> = {
  CASH: "نقد",
  DEBT: "من الدين",
  EXCHANGE: "استبدال",
};

const REPAIR_STATUS: Record<string, string> = {
  intake: "استلام",
  diagnosing: "قيد الفحص",
  awaiting_parts: "بانتظار قطعة",
  ready: "جاهز للتسليم",
  delivered: "مُسلّم",
  unrepairable: "غير قابل للتصليح",
};

const REPAIR_TONE: Record<string, Tone> = {
  intake: "normal",
  diagnosing: "normal",
  awaiting_parts: "warn",
  ready: "warn",
  delivered: "good",
  unrepairable: "bad",
};

const SHORTAGE_STATUS: Record<string, string> = {
  urgent: "عاجل",
  warning: "تنبيه",
};

const label = (map: Record<string, string>, v: unknown, fallback = "—") =>
  map[String(v ?? "").toUpperCase()] ?? map[String(v ?? "").toLowerCase()] ?? clean(v) ?? fallback;

// ------------------------------ محرّك التقارير ------------------------------

/** نوع الخلية يحدّد كيف تُعرض في PDF وكيف تُخزّن في Excel. */
export type CellType = "text" | "money" | "signed" | "int" | "date" | "map";

export type ReportColumn = {
  label: string;
  width: number; // نسبة من عرض الجدول
  align?: Align;
  type?: CellType;
  map?: Record<string, string>;
  sheetWidth?: number;
  /** رقم العمود في السطر الخام، حين لا تقابل الأعمدة المعروضة المصدر واحداً بواحد. */
  source?: number;
  /** يعرض «—» بدل 0 في PDF (يبقى 0 رقماً في Excel). */
  dashWhenZero?: boolean;
  /** يشتقّ قيمة الخلية من السطر الخام كاملاً بدل أخذ عمود واحد. */
  derive?: (row: unknown[]) => string | number;
};

export type ReportInput = {
  documentTitle: string;
  reference: string;
  sheetName: string;
  fileBase: string;
  orientation?: "portrait" | "landscape";
  dense?: boolean;
  columns: ReportColumn[];
  rows: unknown[][];
  info: { label: string; value: string }[];
  summary: SummaryLine[];
  sheetSummary: SheetSpec["summary"];
  statusText: string;
  statusTone: Tone;
  actor: string;
  note?: string;
  caption: string;
  emptyNote: string;
};

function cellForPdf(column: ReportColumn, raw: unknown): string {
  if (column.dashWhenZero && !toNumber(raw)) return "—";
  switch (column.type) {
    case "money":
      return money(raw);
    case "signed":
      return signedAmount(raw);
    case "int":
      return qty(raw);
    case "date":
      return dateIQ(raw);
    case "map":
      return label(column.map ?? {}, raw);
    default: {
      const text = clean(raw);
      return text || "—";
    }
  }
}

function cellForSheet(column: ReportColumn, raw: unknown): string | number {
  switch (column.type) {
    case "money":
    case "signed":
      return Math.round(toNumber(raw));
    case "int":
      return Math.round(toNumber(raw));
    case "date":
      return dateIQ(raw);
    case "map":
      return label(column.map ?? {}, raw);
    default:
      return clean(raw);
  }
}

function isNumeric(column: ReportColumn): boolean {
  return column.type === "money" || column.type === "signed" || column.type === "int";
}

export function buildReport(input: ReportInput): BuiltDocument {
  // الأعمدة المشتقّة لا تستهلك خانة من السطر الخام، فلا يجوز استعمال ترتيب
  // العمود كمؤشّر على المصدر — وإلا انزاحت كل الأعمدة التي بعده.
  let next = 0;
  const sourceIndex = input.columns.map((c) => {
    if (c.derive) return -1;
    if (typeof c.source === "number") {
      next = c.source + 1;
      return c.source;
    }
    return next++;
  });

  const value = (column: ReportColumn, row: unknown[], index: number) =>
    column.derive ? column.derive(row) : row[sourceIndex[index]];

  const pdf: DocSpec = {
    documentTitle: input.documentTitle,
    reference: input.reference,
    info: input.info,
    orientation: input.orientation,
    dense: input.dense,
    columns: input.columns.map((c) => ({ label: c.label, width: c.width, align: c.align })),
    rows: input.rows.map((row) => input.columns.map((c, i) => cellForPdf(c, value(c, row, i)))),
    summary: input.summary,
    statusText: input.statusText,
    statusTone: input.statusTone,
    actor: input.actor,
    note: input.rows.length ? input.note : input.emptyNote,
  };

  const sheet: SheetSpec = {
    sheetName: input.sheetName,
    title: `${input.documentTitle} — ${input.reference}`,
    info: input.info,
    columns: input.columns.map((c) => ({
      label: c.label,
      width: c.sheetWidth ?? Math.max(10, Math.round(c.width * 110)),
      type: isNumeric(c) ? "number" : "text",
    })),
    rows: input.rows.map((row) => input.columns.map((c, i) => cellForSheet(c, value(c, row, i)))),
    summary: input.sheetSummary,
    status: input.statusText,
  };

  return { pdf, sheet, fileBase: safeFileName(input.fileBase), caption: input.caption };
}

/** بيانات مشتركة تظهر في رأس كل تقرير. */
function reportMeta(data: any, rowCount: number): { label: string; value: string }[] {
  const meta = data?.meta ?? {};
  const info = [
    { label: "تاريخ الإصدار", value: dateIQ(meta.generated_at) },
    { label: "وقت الإصدار", value: timeIQ(meta.generated_time) },
    { label: "عدد السطور", value: String(rowCount) },
  ];
  if (clean(meta.query)) info.push({ label: "البحث", value: clean(meta.query) });
  return info;
}

const rowsOf = (data: any): unknown[][] => (Array.isArray(data?.rows) ? data.rows : []);
const actorOf = (data: any): string => clean(data?.meta?.actor) || "النظام";

// =========================================================================
//                              مستندات مفردة
// =========================================================================

// --------------------------------- فاتورة بيع ---------------------------------

export function buildInvoice(data: any): BuiltDocument {
  const inv = data?.invoice ?? {};
  const items: any[] = Array.isArray(data?.items) ? data.items : [];

  const total = toNumber(inv.total);
  const paid = toNumber(inv.paid);
  const delivery = toNumber(inv.delivery);
  const remaining = total - paid;

  const itemsSubtotal = items.reduce((s, x) => s + toNumber(x.total), 0);
  // فرق بين مجموع المواد وإجمالي الفاتورة (خصم أو تسوية على مستوى الفاتورة).
  const adjustment = total - itemsSubtotal;

  // عمود الـ IMEI يظهر فقط إذا كان في الفاتورة جهاز يحمل رقماً تسلسلياً،
  // حتى لا يضيّع عرض الجدول على فواتير الإكسسوارات.
  const hasSerials = items.some((x) => clean(x.serials));

  const number = clean(inv.number) || "—";
  const customer = clean(inv.customer_name) || "زبون سريع";
  const actor = clean(data?.meta?.actor ?? inv.actor) || "النظام";

  const info = [
    { label: "الزبون", value: customer },
    { label: "الهاتف", value: clean(inv.customer_phone) || "—" },
    { label: "نوع الدفع", value: label(PAYMENT_LABELS, inv.payment_type) },
    { label: "التاريخ", value: dateIQ(inv.created_at) },
    { label: "الوقت", value: timeIQ(inv.created_time ?? inv.created_at) },
    { label: "البائع", value: clean(inv.actor) || actor },
  ];
  if (clean(inv.province)) info.push({ label: "المحافظة", value: clean(inv.province) });
  // أجور التوصيل تُسجَّل خارج total_amount في قاعدة البيانات، لذلك تُعرض
  // كمعلومة مستقلة بدل إقحامها في المجاميع وإرباك الحساب.
  if (delivery > 0) info.push({ label: "أجور التوصيل", value: amount(delivery) });

  const columns: ReportColumn[] = hasSerials
    ? [
      { label: "المنتج", width: 0.29, align: "right" },
      { label: "IMEI / السيريال", width: 0.21, align: "center", sheetWidth: 24 },
      { label: "الكمية", width: 0.08, align: "center", type: "int" },
      { label: "سعر الوحدة", width: 0.15, align: "right", type: "money" },
      { label: "الخصم", width: 0.11, align: "right", type: "money", dashWhenZero: true },
      { label: "المجموع", width: 0.16, align: "right", type: "money" },
    ]
    : [
      { label: "المنتج", width: 0.40, align: "right", sheetWidth: 34 },
      { label: "الكمية", width: 0.10, align: "center", type: "int" },
      { label: "سعر الوحدة", width: 0.17, align: "right", type: "money" },
      { label: "الخصم", width: 0.14, align: "right", type: "money", dashWhenZero: true },
      { label: "المجموع", width: 0.19, align: "right", type: "money" },
    ];

  const rows: unknown[][] = items.map((x) =>
    hasSerials
      ? [clean(x.name), clean(x.serials) || "—", x.qty, x.unit_price, x.discount, x.total]
      : [clean(x.name), x.qty, x.unit_price, x.discount, x.total]
  );

  const summary: SummaryLine[] = [{ label: "مجموع المواد", value: amount(itemsSubtotal) }];
  if (Math.round(adjustment) !== 0) {
    summary.push({
      label: adjustment < 0 ? "خصم على الفاتورة" : "إضافة على الفاتورة",
      value: amount(adjustment),
      tone: adjustment < 0 ? "good" : "warn",
    });
  }
  summary.push({ label: "الإجمالي الكلي", value: amount(total), strong: true });
  summary.push({ label: "المدفوع", value: amount(paid), tone: "good" });
  summary.push({
    label: "المتبقي",
    value: amount(Math.max(0, remaining)),
    tone: remaining > 0 ? "bad" : "good",
  });

  return buildReport({
    documentTitle: "فاتورة بيع",
    reference: `رقم ${number}`,
    sheetName: "فاتورة",
    fileBase: `فاتورة_${number}`,
    columns,
    rows,
    info,
    summary,
    sheetSummary: [
      { label: "مجموع المواد", value: Math.round(itemsSubtotal), money: true },
      ...(Math.round(adjustment) !== 0
        ? [{
          label: adjustment < 0 ? "خصم على الفاتورة" : "إضافة على الفاتورة",
          value: Math.round(adjustment),
          money: true,
        }]
        : []),
      ...(delivery > 0
        ? [{ label: "أجور التوصيل (منفصلة)", value: Math.round(delivery), money: true }]
        : []),
      { label: "الإجمالي الكلي", value: Math.round(total), money: true, strong: true },
      { label: "المدفوع", value: Math.round(paid), money: true },
      { label: "المتبقي", value: Math.round(Math.max(0, remaining)), money: true },
    ],
    statusText: remaining > 0 ? `المتبقي ${amount(remaining)}` : "مدفوعة بالكامل",
    statusTone: remaining > 0 ? "bad" : "good",
    actor,
    note: clean(inv.notes) || undefined,
    emptyNote: "لا توجد مواد مسجّلة على هذه الفاتورة.",
    caption: `🧾 <b>فاتورة بيع</b> — ${escapeHtml(number)}\n` +
      `الزبون: ${escapeHtml(customer)}\n` +
      `الإجمالي: ${money(total)} د.ع` +
      (remaining > 0 ? `\nالمتبقي: ${money(remaining)} د.ع` : "\n✅ مدفوعة بالكامل"),
  });
}

// --------------------------------- كشف حساب ---------------------------------

export function buildStatement(data: any): BuiltDocument {
  const customer = data?.customer ?? {};
  const totals = data?.totals ?? {};

  // دفتر أستاذ: كل حركة سطر بمدين ودائن ورصيد متحرّك بعدها.
  // السطر الافتتاحي (إن وُجد) يتصدّر الجدول حتى يقفل الكشف على الرصيد المسجّل.
  const ledger: unknown[][] = Array.isArray(data?.rows) ? data.rows : [];
  const opening = toNumber(totals.opening);
  const rows = data?.opening_row ? [data.opening_row as unknown[], ...ledger] : ledger;

  const balance = toNumber(customer.balance);
  const debits = toNumber(totals.debits);
  const credits = toNumber(totals.credits);
  const limit = toNumber(customer.credit_limit);

  const name = clean(customer.name) || "—";

  const statusText = balance > 0
    ? `بذمّته ${amount(balance)}`
    : balance < 0
    ? `رصيد دائن ${amount(balance)}`
    : "الحساب مسدّد بالكامل";
  const tone: Tone = balance > 0 ? "bad" : balance < 0 ? "warn" : "good";

  const info = [
    { label: "الزبون", value: name },
    { label: "الهاتف", value: clean(customer.phone) || "—" },
    { label: "العنوان", value: clean(customer.address) || "—" },
    { label: "تاريخ الكشف", value: dateIQ(data?.meta?.generated_at) },
    { label: "وقت الكشف", value: timeIQ(data?.meta?.generated_time) },
    { label: "عدد الحركات", value: String(Math.round(toNumber(totals.count))) },
  ];
  if (limit > 0) info.push({ label: "سقف الدين", value: amount(limit) });

  const summary: SummaryLine[] = [];
  if (Math.round(opening) !== 0) {
    summary.push({ label: "رصيد افتتاحي", value: amount(opening) });
  }
  summary.push({ label: "إجمالي المدين (عليه)", value: amount(debits), tone: "bad" });
  summary.push({ label: "إجمالي الدائن (له)", value: amount(credits), tone: "good" });
  summary.push({ label: "الرصيد الحالي", value: amount(balance), strong: true, tone });

  return buildReport({
    documentTitle: "كشف حساب",
    reference: name,
    sheetName: "كشف حساب",
    fileBase: `كشف_حساب_${name}`,
    columns: [
      { label: "التاريخ", width: 0.12, align: "center", sheetWidth: 13 },
      { label: "البيان", width: 0.18, align: "right", sheetWidth: 18 },
      { label: "التفاصيل", width: 0.26, align: "right", sheetWidth: 30 },
      { label: "مدين", width: 0.15, align: "right", type: "money", dashWhenZero: true, sheetWidth: 15 },
      { label: "دائن", width: 0.15, align: "right", type: "money", dashWhenZero: true, sheetWidth: 15 },
      { label: "الرصيد", width: 0.14, align: "right", type: "signed", sheetWidth: 16 },
    ],
    rows,
    info,
    summary,
    sheetSummary: [
      ...(Math.round(opening) !== 0
        ? [{ label: "رصيد افتتاحي", value: Math.round(opening), money: true }]
        : []),
      { label: "إجمالي المدين (عليه)", value: Math.round(debits), money: true },
      { label: "إجمالي الدائن (له)", value: Math.round(credits), money: true },
      { label: "الرصيد الحالي", value: Math.round(balance), money: true, strong: true },
    ],
    statusText,
    statusTone: tone,
    actor: actorOf(data),
    note: totals.truncated
      ? `معروض ${rows.length} حركة من أصل ${Math.round(toNumber(totals.count))}.`
      : "«مدين» ما ترتّب على الزبون · «دائن» ما دفعه أو رجّعه أو سومح به · «الرصيد» ما بقي بذمّته بعد كل حركة.",
    emptyNote: "لا توجد حركات مسجّلة على هذا الحساب.",
    caption: `📄 <b>كشف حساب</b> — ${escapeHtml(name)}\n` +
      `عدد الحركات: ${Math.round(toNumber(totals.count))}\n` +
      `الرصيد: ${money(balance)} د.ع ${balance > 0 ? "(بذمّته)" : balance < 0 ? "(دائن)" : "(مسدّد)"}`,
  });
}

// -------------------------------- فاتورة صيانة --------------------------------

export function buildRepairInvoice(data: any): BuiltDocument {
  const r = data?.repair ?? {};
  const cost = toNumber(r.cost);
  const labour = toNumber(r.labour);
  const total = toNumber(r.total) || cost + labour;

  const ticket = clean(r.ticket_no) || "—";
  const customer = clean(r.customer_name) || "زبون";
  const status = String(r.status ?? "").toLowerCase();
  const statusText = REPAIR_STATUS[status] ?? clean(r.status) ?? "—";

  const info = [
    { label: "رقم التذكرة", value: ticket },
    { label: "الزبون", value: customer },
    { label: "الهاتف", value: clean(r.customer_phone) || "—" },
    { label: "الجهاز", value: clean(r.device) || "—" },
    { label: "IMEI", value: clean(r.imei) || "—" },
    { label: "الحالة", value: statusText },
    { label: "تاريخ الاستلام", value: dateIQ(r.created_at) },
    { label: "وقت الاستلام", value: timeIQ(r.created_time ?? r.created_at) },
  ];
  if (clean(r.lock_code)) info.push({ label: "رمز القفل", value: clean(r.lock_code) });
  if (clean(r.updated_at)) info.push({ label: "آخر تحديث", value: dateIQ(r.updated_at) });

  const notes = [clean(r.fault) ? `العطل المُبلّغ: ${clean(r.fault)}` : "", clean(r.notes)]
    .filter(Boolean).join(" · ");

  return buildReport({
    documentTitle: "فاتورة صيانة",
    reference: `تذكرة ${ticket}`,
    sheetName: "صيانة",
    fileBase: `صيانة_${ticket}`,
    columns: [
      { label: "البيان", width: 0.62, align: "right", sheetWidth: 40 },
      { label: "المبلغ", width: 0.38, align: "right", type: "money", sheetWidth: 20 },
    ],
    rows: [
      ["كلفة القطع والمواد", cost],
      ["أجور العمل والفحص", labour],
    ],
    info,
    summary: [
      { label: "كلفة القطع", value: amount(cost) },
      { label: "أجور العمل", value: amount(labour) },
      { label: "الإجمالي المطلوب", value: amount(total), strong: true },
    ],
    sheetSummary: [
      { label: "كلفة القطع", value: Math.round(cost), money: true },
      { label: "أجور العمل", value: Math.round(labour), money: true },
      { label: "الإجمالي المطلوب", value: Math.round(total), money: true, strong: true },
    ],
    statusText: total > 0 ? `${statusText} — ${amount(total)}` : statusText,
    statusTone: REPAIR_TONE[status] ?? "normal",
    actor: actorOf(data),
    note: notes || undefined,
    emptyNote: "لم تُسجَّل كلفة على هذه التذكرة بعد.",
    caption: `🔧 <b>فاتورة صيانة</b> — ${escapeHtml(ticket)}\n` +
      `الزبون: ${escapeHtml(customer)}\n` +
      `الجهاز: ${escapeHtml(clean(r.device) || "—")}\n` +
      `الحالة: ${escapeHtml(statusText)} · الإجمالي: ${money(total)} د.ع`,
  });
}

// ------------------------------ فاتورة مسترجعات ------------------------------

export function buildReturnInvoice(data: any): BuiltDocument {
  const ret = data?.return ?? {};
  const items: any[] = Array.isArray(data?.items) ? data.items : [];

  const total = toNumber(ret.total);
  const itemsTotal = items.reduce((s, x) => s + toNumber(x.total), 0);
  const pieces = items.reduce((s, x) => s + toNumber(x.qty), 0);

  const number = clean(ret.number) || "—";
  const customer = clean(ret.customer_name) || "زبون سريع";
  const method = label(REFUND_LABELS, ret.refund_method);

  const info = [
    { label: "رقم الاسترجاع", value: number },
    { label: "فاتورة البيع", value: clean(ret.invoice_number) || "—" },
    { label: "الزبون", value: customer },
    { label: "الهاتف", value: clean(ret.customer_phone) || "—" },
    { label: "طريقة الإرجاع", value: method },
    { label: "السبب", value: clean(ret.reason) || "—" },
    { label: "التاريخ", value: dateIQ(ret.created_at) },
    { label: "الوقت", value: timeIQ(ret.created_time ?? ret.created_at) },
  ];

  return buildReport({
    documentTitle: "فاتورة مسترجعات",
    reference: `رقم ${number}`,
    sheetName: "مسترجعات",
    fileBase: `مسترجعات_${number}`,
    columns: [
      { label: "المنتج", width: 0.28, align: "right", sheetWidth: 30 },
      { label: "IMEI / السيريال", width: 0.20, align: "center", sheetWidth: 24 },
      { label: "الكمية", width: 0.08, align: "center", type: "int" },
      { label: "سعر الوحدة", width: 0.15, align: "right", type: "money" },
      { label: "المجموع", width: 0.15, align: "right", type: "money" },
      { label: "حالة المادة", width: 0.14, align: "center", sheetWidth: 16 },
    ],
    rows: items.map((x) => [
      clean(x.name),
      clean(x.serials) || "—",
      x.qty,
      x.unit_price,
      x.total,
      clean(x.condition) || "—",
    ]),
    info,
    summary: [
      { label: "عدد المواد", value: String(items.length) },
      { label: "عدد القطع", value: String(Math.round(pieces)) },
      { label: "مجموع المواد", value: amount(itemsTotal) },
      { label: "إجمالي المسترجع", value: amount(total || itemsTotal), strong: true, tone: "warn" },
    ],
    sheetSummary: [
      { label: "عدد المواد", value: items.length },
      { label: "عدد القطع", value: Math.round(pieces) },
      { label: "مجموع المواد", value: Math.round(itemsTotal), money: true },
      { label: "إجمالي المسترجع", value: Math.round(total || itemsTotal), money: true, strong: true },
    ],
    statusText: `${method} — ${amount(total || itemsTotal)}`,
    statusTone: "warn",
    actor: actorOf(data),
    note: clean(ret.notes) || undefined,
    emptyNote: "لا توجد مواد مسجّلة على هذا الاسترجاع.",
    caption: `↩️ <b>فاتورة مسترجعات</b> — ${escapeHtml(number)}\n` +
      `الزبون: ${escapeHtml(customer)}\n` +
      `المبلغ: ${money(total || itemsTotal)} د.ع · ${escapeHtml(method)}`,
  });
}

// =========================================================================
//                              تقارير القوائم
// =========================================================================

// -------------------------------- المبيعات --------------------------------

export function buildSalesReport(data: any): BuiltDocument {
  const rows = rowsOf(data);
  const totals = data?.totals ?? {};
  const meta = data?.meta ?? {};

  const from = clean(meta.from);
  const to = clean(meta.to);
  const period = from && to ? (from === to ? `يوم ${from}` : `${from} — ${to}`) : "كل الفترات";
  const sales = toNumber(totals.sales);
  const lines = toNumber(totals.lines);
  const truncated = lines > rows.length;

  return buildReport({
    documentTitle: "تقرير المبيعات",
    reference: period,
    sheetName: "المبيعات",
    fileBase: `مبيعات_${from || "الكل"}_${to || ""}`,
    dense: true,
    columns: [
      { label: "التاريخ", width: 0.10, align: "center", type: "date", sheetWidth: 13 },
      { label: "الفاتورة", width: 0.10, align: "center", sheetWidth: 13 },
      { label: "الزبون", width: 0.12, align: "right", sheetWidth: 22 },
      { label: "المنتج", width: 0.19, align: "right", sheetWidth: 28 },
      { label: "IMEI", width: 0.16, align: "center", sheetWidth: 22 },
      { label: "الكمية", width: 0.08, align: "center", type: "int", sheetWidth: 9 },
      { label: "المجموع", width: 0.16, align: "right", type: "money", source: 7, sheetWidth: 16 },
      { label: "الدفع", width: 0.09, align: "center", type: "map", map: PAYMENT_SHORT, source: 8, sheetWidth: 12 },
    ],
    rows,
    info: [
      { label: "من تاريخ", value: from || "—" },
      { label: "إلى تاريخ", value: to || "—" },
      ...reportMeta(data, rows.length),
    ],
    summary: [
      { label: "عدد الفواتير", value: String(Math.round(toNumber(totals.invoices))) },
      { label: "عدد القطع المباعة", value: String(Math.round(toNumber(totals.items))) },
      { label: "إجمالي المبيعات", value: amount(sales), strong: true },
      { label: "المحصّل نقداً", value: amount(totals.cash), tone: "good" },
      { label: "مبيعات بالدين", value: amount(totals.debt), tone: "bad" },
    ],
    sheetSummary: [
      { label: "عدد الفواتير", value: Math.round(toNumber(totals.invoices)) },
      { label: "عدد القطع المباعة", value: Math.round(toNumber(totals.items)) },
      { label: "إجمالي المبيعات", value: Math.round(sales), money: true, strong: true },
      { label: "المحصّل نقداً", value: Math.round(toNumber(totals.cash)), money: true },
      { label: "مبيعات بالدين", value: Math.round(toNumber(totals.debt)), money: true },
    ],
    statusText: `إجمالي المبيعات ${amount(sales)}`,
    statusTone: "good",
    actor: actorOf(data),
    note: truncated
      ? `معروض ${rows.length} سطر من أصل ${Math.round(lines)} — المجاميع محسوبة على الكل.`
      : "عمود IMEI يظهر للأجهزة التي تحمل رقماً تسلسلياً فقط.",
    emptyNote: "ماكو مبيعات بهذه الفترة.",
    caption: `📈 <b>تقرير المبيعات</b> — ${escapeHtml(period)}\n` +
      `عدد الفواتير: ${Math.round(toNumber(totals.invoices))}\n` +
      `الإجمالي: ${money(sales)} د.ع`,
  });
}

// --------------------------------- الديون ---------------------------------

export function buildDebtsReport(data: any): BuiltDocument {
  const rows = rowsOf(data);
  const balances = rows.map((r) => toNumber(r[2]));
  const total = balances.reduce((s, v) => s + v, 0);
  const biggest = balances.length ? Math.max(...balances) : 0;
  const average = balances.length ? total / balances.length : 0;
  const overLimit = rows.filter((r) => toNumber(r[3]) > 0 && toNumber(r[2]) > toNumber(r[3])).length;

  return buildReport({
    documentTitle: "تقرير الديون",
    reference: `${rows.length} زبون مدين`,
    sheetName: "الديون",
    fileBase: `الديون_${clean(data?.meta?.generated_at) || ""}`,
    columns: [
      { label: "الزبون", width: 0.30, align: "right", sheetWidth: 26 },
      { label: "الهاتف", width: 0.18, align: "center", sheetWidth: 16 },
      { label: "الدين الحالي", width: 0.20, align: "right", type: "money", sheetWidth: 18 },
      { label: "سقف الدين", width: 0.17, align: "right", type: "money", sheetWidth: 16 },
      {
        label: "الحالة",
        width: 0.15,
        align: "center",
        sheetWidth: 16,
        derive: (row) => {
          const limit = toNumber(row[3]);
          const balance = toNumber(row[2]);
          if (limit <= 0) return "بلا سقف";
          return balance > limit ? "تجاوز السقف" : "ضمن السقف";
        },
      },
    ],
    rows,
    info: reportMeta(data, rows.length),
    summary: [
      { label: "عدد المدينين", value: String(rows.length) },
      { label: "إجمالي الديون", value: amount(total), strong: true, tone: "bad" },
      { label: "أكبر دين", value: amount(biggest) },
      { label: "متوسط الدين", value: amount(average) },
      { label: "تجاوزوا سقف الدين", value: String(overLimit), tone: overLimit ? "warn" : "good" },
    ],
    sheetSummary: [
      { label: "عدد المدينين", value: rows.length },
      { label: "إجمالي الديون", value: Math.round(total), money: true, strong: true },
      { label: "أكبر دين", value: Math.round(biggest), money: true },
      { label: "متوسط الدين", value: Math.round(average), money: true },
      { label: "تجاوزوا سقف الدين", value: overLimit },
    ],
    statusText: `إجمالي الديون ${amount(total)}`,
    statusTone: "bad",
    actor: actorOf(data),
    note: overLimit ? `${overLimit} زبون تجاوز سقف الدين المسموح.` : undefined,
    emptyNote: "ماكو ديون على أحد — كل الحسابات مسدّدة.",
    caption: `💰 <b>تقرير الديون</b>\n` +
      `عدد المدينين: ${rows.length}\n` +
      `الإجمالي: ${money(total)} د.ع`,
  });
}

// -------------------------------- النواقص --------------------------------

export function buildShortagesReport(data: any): BuiltDocument {
  const rows = rowsOf(data);
  const outOfStock = rows.filter((r) => toNumber(r[2]) <= 0).length;
  const urgent = rows.filter((r) => String(r[4]).toLowerCase() === "urgent").length;
  const needed = rows.reduce((s, r) => s + Math.max(0, toNumber(r[3]) - toNumber(r[2])), 0);

  return buildReport({
    documentTitle: "تقرير النواقص",
    reference: `${rows.length} صنف يحتاج تجهيز`,
    sheetName: "النواقص",
    fileBase: `النواقص_${clean(data?.meta?.generated_at) || ""}`,
    columns: [
      { label: "المادة", width: 0.30, align: "right", sheetWidth: 30 },
      { label: "الصنف", width: 0.18, align: "right", sheetWidth: 20 },
      { label: "الكمية", width: 0.11, align: "center", type: "int", sheetWidth: 14 },
      { label: "حدّ التنبيه", width: 0.14, align: "center", type: "int", sheetWidth: 13 },
      {
        label: "المطلوب",
        width: 0.13,
        align: "center",
        sheetWidth: 14,
        derive: (row) => Math.max(0, Math.round(toNumber(row[3]) - toNumber(row[2]))),
      },
      { label: "الأولوية", width: 0.14, align: "center", type: "map", map: SHORTAGE_STATUS, sheetWidth: 13 },
    ],
    rows,
    info: reportMeta(data, rows.length),
    summary: [
      { label: "أصناف ناقصة", value: String(rows.length), strong: true, tone: "warn" },
      { label: "منتهية تماماً", value: String(outOfStock), tone: outOfStock ? "bad" : "good" },
      { label: "أولوية عاجلة", value: String(urgent) },
      { label: "مجموع القطع المطلوبة", value: String(Math.round(needed)) },
    ],
    sheetSummary: [
      { label: "أصناف ناقصة", value: rows.length, strong: true },
      { label: "منتهية تماماً", value: outOfStock },
      { label: "أولوية عاجلة", value: urgent },
      { label: "مجموع القطع المطلوبة", value: Math.round(needed) },
    ],
    statusText: `${rows.length} صنف يحتاج تجهيز`,
    statusTone: rows.length ? "warn" : "good",
    actor: actorOf(data),
    note: "«المطلوب» = حدّ التنبيه ناقص الكمية الحالية.",
    emptyNote: "ماكو نواقص — كل الأصناف فوق حدّ التنبيه.",
    caption: `📦 <b>تقرير النواقص</b>\n` +
      `أصناف ناقصة: ${rows.length}\n` +
      `منتهية تماماً: ${outOfStock}`,
  });
}

// ------------------------------- المصروفات -------------------------------

export function buildExpensesReport(data: any): BuiltDocument {
  const rows = rowsOf(data);
  const amounts = rows.map((r) => toNumber(r[3]));
  const total = amounts.reduce((s, v) => s + v, 0);
  const biggest = amounts.length ? Math.max(...amounts) : 0;
  const average = amounts.length ? total / amounts.length : 0;

  return buildReport({
    documentTitle: "تقرير المصروفات",
    reference: `${rows.length} قيد`,
    sheetName: "المصروفات",
    fileBase: `المصروفات_${clean(data?.meta?.generated_at) || ""}`,
    columns: [
      { label: "التاريخ", width: 0.14, align: "center", type: "date", sheetWidth: 14 },
      { label: "الصنف", width: 0.18, align: "right", sheetWidth: 20 },
      { label: "التفاصيل", width: 0.36, align: "right", sheetWidth: 34 },
      { label: "المبلغ", width: 0.18, align: "right", type: "money", sheetWidth: 18 },
      { label: "سجّلها", width: 0.14, align: "right", sheetWidth: 16 },
    ],
    rows,
    info: reportMeta(data, rows.length),
    summary: [
      { label: "عدد القيود", value: String(rows.length) },
      { label: "إجمالي المصروفات", value: amount(total), strong: true, tone: "bad" },
      { label: "أكبر مصروف", value: amount(biggest) },
      { label: "متوسط القيد", value: amount(average) },
    ],
    sheetSummary: [
      { label: "عدد القيود", value: rows.length },
      { label: "إجمالي المصروفات", value: Math.round(total), money: true, strong: true },
      { label: "أكبر مصروف", value: Math.round(biggest), money: true },
      { label: "متوسط القيد", value: Math.round(average), money: true },
    ],
    statusText: `إجمالي المصروفات ${amount(total)}`,
    statusTone: "bad",
    actor: actorOf(data),
    emptyNote: "ماكو مصاريف مسجّلة.",
    caption: `🧾 <b>تقرير المصروفات</b>\n` +
      `عدد القيود: ${rows.length}\n` +
      `الإجمالي: ${money(total)} د.ع`,
  });
}

// ------------------------------- المسترجعات -------------------------------

export function buildReturnsReport(data: any): BuiltDocument {
  const rows = rowsOf(data);
  const totals = data?.totals ?? {};
  const total = toNumber(totals.amount);

  return buildReport({
    documentTitle: "تقرير المسترجعات",
    reference: `${rows.length} عملية استرجاع`,
    sheetName: "المسترجعات",
    fileBase: `المسترجعات_${clean(data?.meta?.generated_at) || ""}`,
    dense: true,
    columns: [
      { label: "التاريخ", width: 0.11, align: "center", type: "date", sheetWidth: 13 },
      { label: "رقم الاسترجاع", width: 0.13, align: "center", sheetWidth: 16 },
      { label: "فاتورة البيع", width: 0.11, align: "center", sheetWidth: 16 },
      { label: "الزبون", width: 0.14, align: "right", sheetWidth: 22 },
      { label: "المواد المسترجعة", width: 0.19, align: "right", sheetWidth: 32 },
      { label: "المبلغ", width: 0.13, align: "right", type: "money", sheetWidth: 16 },
      { label: "الإرجاع", width: 0.08, align: "center", type: "map", map: REFUND_LABELS, sheetWidth: 14 },
      { label: "السبب", width: 0.11, align: "right", sheetWidth: 18 },
    ],
    rows,
    info: reportMeta(data, rows.length),
    summary: [
      { label: "عدد المسترجعات", value: String(Math.round(toNumber(totals.count) || rows.length)) },
      { label: "إجمالي المبلغ", value: amount(total), strong: true, tone: "warn" },
      { label: "رجّعناه نقداً", value: amount(totals.cash) },
      { label: "نزل من الدين", value: amount(totals.debt) },
      { label: "استبدال ببضاعة", value: amount(totals.exchange) },
    ],
    sheetSummary: [
      { label: "عدد المسترجعات", value: Math.round(toNumber(totals.count) || rows.length) },
      { label: "إجمالي المبلغ", value: Math.round(total), money: true, strong: true },
      { label: "رجّعناه نقداً", value: Math.round(toNumber(totals.cash)), money: true },
      { label: "نزل من الدين", value: Math.round(toNumber(totals.debt)), money: true },
      { label: "استبدال ببضاعة", value: Math.round(toNumber(totals.exchange)), money: true },
    ],
    statusText: `إجمالي المسترجعات ${amount(total)}`,
    statusTone: "warn",
    actor: actorOf(data),
    emptyNote: "ماكو مسترجعات مسجّلة.",
    caption: `↩️ <b>تقرير المسترجعات</b>\n` +
      `عدد العمليات: ${rows.length}\n` +
      `الإجمالي: ${money(total)} د.ع`,
  });
}

// -------------------------------- الصيانة --------------------------------

export function buildRepairsReport(data: any): BuiltDocument {
  const rows = rowsOf(data);
  const open = rows.filter((r) => !["delivered", "unrepairable"].includes(String(r[5]).toLowerCase())).length;
  const delivered = rows.filter((r) => String(r[5]).toLowerCase() === "delivered").length;
  const total = rows.reduce((s, r) => s + toNumber(r[6]), 0);

  return buildReport({
    documentTitle: "تقرير الصيانة",
    reference: `${rows.length} تذكرة`,
    sheetName: "الصيانة",
    fileBase: `الصيانة_${clean(data?.meta?.generated_at) || ""}`,
    columns: [
      { label: "التذكرة", width: 0.10, align: "center", sheetWidth: 13 },
      { label: "الزبون", width: 0.18, align: "right", sheetWidth: 22 },
      { label: "الهاتف", width: 0.13, align: "center", sheetWidth: 15 },
      { label: "الجهاز", width: 0.16, align: "right", sheetWidth: 20 },
      { label: "العطل", width: 0.20, align: "right", sheetWidth: 26 },
      { label: "الحالة", width: 0.11, align: "center", type: "map", map: REPAIR_STATUS, sheetWidth: 16 },
      { label: "المبلغ", width: 0.12, align: "right", type: "money", sheetWidth: 16 },
    ],
    rows,
    info: reportMeta(data, rows.length),
    summary: [
      { label: "عدد التذاكر", value: String(rows.length) },
      { label: "قيد العمل", value: String(open), tone: open ? "warn" : "good" },
      { label: "مُسلّمة", value: String(delivered), tone: "good" },
      { label: "إجمالي الكلفة", value: amount(total), strong: true },
    ],
    sheetSummary: [
      { label: "عدد التذاكر", value: rows.length },
      { label: "قيد العمل", value: open },
      { label: "مُسلّمة", value: delivered },
      { label: "إجمالي الكلفة", value: Math.round(total), money: true, strong: true },
    ],
    statusText: `${open} تذكرة قيد العمل من أصل ${rows.length}`,
    statusTone: open ? "warn" : "good",
    actor: actorOf(data),
    emptyNote: "ماكو تذاكر صيانة.",
    caption: `🔧 <b>تقرير الصيانة</b>\n` +
      `عدد التذاكر: ${rows.length} · قيد العمل: ${open}\n` +
      `إجمالي الكلفة: ${money(total)} د.ع`,
  });
}

// ------------------------------- التسديدات -------------------------------

export function buildPaymentsReport(data: any): BuiltDocument {
  const rows = rowsOf(data);
  const paid = rows.reduce((s, r) => s + toNumber(r[3]), 0);
  const waived = rows.reduce((s, r) => s + toNumber(r[4]), 0);

  return buildReport({
    documentTitle: "تقرير التسديدات",
    reference: `${rows.length} دفعة`,
    sheetName: "التسديدات",
    fileBase: `التسديدات_${clean(data?.meta?.generated_at) || ""}`,
    columns: [
      { label: "التاريخ", width: 0.12, align: "center", type: "date", sheetWidth: 14 },
      { label: "الزبون", width: 0.22, align: "right", sheetWidth: 24 },
      { label: "الدين السابق", width: 0.14, align: "right", type: "money", sheetWidth: 16 },
      { label: "المسدّد", width: 0.14, align: "right", type: "money", sheetWidth: 16 },
      { label: "السماح", width: 0.12, align: "right", type: "money", sheetWidth: 14 },
      { label: "المتبقي", width: 0.14, align: "right", type: "money", sheetWidth: 16 },
      { label: "سجّلها", width: 0.12, align: "right", sheetWidth: 16 },
    ],
    rows,
    info: reportMeta(data, rows.length),
    summary: [
      { label: "عدد الدفعات", value: String(rows.length) },
      { label: "إجمالي المسدّد", value: amount(paid), strong: true, tone: "good" },
      { label: "إجمالي السماح", value: amount(waived), tone: "warn" },
    ],
    sheetSummary: [
      { label: "عدد الدفعات", value: rows.length },
      { label: "إجمالي المسدّد", value: Math.round(paid), money: true, strong: true },
      { label: "إجمالي السماح", value: Math.round(waived), money: true },
    ],
    statusText: `إجمالي التحصيل ${amount(paid)}`,
    statusTone: "good",
    actor: actorOf(data),
    emptyNote: "ماكو تسديدات مسجّلة.",
    caption: `💵 <b>تقرير التسديدات</b>\n` +
      `عدد الدفعات: ${rows.length}\n` +
      `إجمالي المسدّد: ${money(paid)} د.ع`,
  });
}

// -------------------------------- المخزن --------------------------------

export function buildInventoryReport(data: any): BuiltDocument {
  const rows = rowsOf(data);
  const pieces = rows.reduce((s, r) => s + toNumber(r[3]), 0);
  const value = rows.reduce((s, r) => s + toNumber(r[3]) * toNumber(r[4]), 0);
  const empty = rows.filter((r) => toNumber(r[3]) <= 0).length;

  return buildReport({
    documentTitle: "تقرير المخزن",
    reference: `${rows.length} صنف`,
    sheetName: "المخزن",
    fileBase: `المخزن_${clean(data?.meta?.generated_at) || ""}`,
    columns: [
      { label: "المادة", width: 0.34, align: "right", sheetWidth: 32 },
      { label: "الصنف", width: 0.18, align: "right", sheetWidth: 20 },
      { label: "الباركود", width: 0.16, align: "center", sheetWidth: 18 },
      { label: "الكمية", width: 0.12, align: "center", type: "int", sheetWidth: 12 },
      { label: "سعر البيع", width: 0.20, align: "right", type: "money", sheetWidth: 18 },
    ],
    rows,
    info: reportMeta(data, rows.length),
    summary: [
      { label: "عدد الأصناف", value: String(rows.length) },
      { label: "مجموع القطع", value: String(Math.round(pieces)) },
      { label: "أصناف بكمية صفر", value: String(empty), tone: empty ? "warn" : "good" },
      { label: "قيمة المخزن بسعر البيع", value: amount(value), strong: true },
    ],
    sheetSummary: [
      { label: "عدد الأصناف", value: rows.length },
      { label: "مجموع القطع", value: Math.round(pieces) },
      { label: "أصناف بكمية صفر", value: empty },
      { label: "قيمة المخزن بسعر البيع", value: Math.round(value), money: true, strong: true },
    ],
    statusText: `قيمة المخزن ${amount(value)}`,
    statusTone: "normal",
    actor: actorOf(data),
    emptyNote: "ماكو مواد بالمخزن.",
    caption: `🏬 <b>تقرير المخزن</b>\n` +
      `عدد الأصناف: ${rows.length} · القطع: ${Math.round(pieces)}\n` +
      `القيمة بسعر البيع: ${money(value)} د.ع`,
  });
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
