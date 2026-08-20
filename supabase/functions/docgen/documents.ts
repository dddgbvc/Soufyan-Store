// يحوّل ما تعيده دوال قاعدة البيانات (doc_invoice / doc_customer_statement)
// إلى مواصفة مستند واحدة يستهلكها مولّد PDF ومولّد Excel معاً.

import type { DocSpec, StoreInfo } from "./pdf.ts";
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

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "نقدي",
  DEBT: "آجل (دين)",
  CARD: "بطاقة",
  TRANSFER: "تحويل",
};

// --------------------------------- فاتورة ---------------------------------

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

  const number = clean(inv.number) || "—";
  const customer = clean(inv.customer_name) || "زبون سريع";
  const actor = clean(data?.meta?.actor ?? inv.actor) || "النظام";

  const info = [
    { label: "الزبون", value: customer },
    { label: "الهاتف", value: clean(inv.customer_phone) || "—" },
    { label: "نوع الدفع", value: PAYMENT_LABELS[String(inv.payment_type ?? "").toUpperCase()] ?? clean(inv.payment_type) ?? "—" },
    { label: "التاريخ", value: dateIQ(inv.created_at) },
    { label: "الوقت", value: timeIQ(inv.created_time ?? inv.created_at) },
    { label: "البائع", value: clean(inv.actor) || actor },
  ];
  if (clean(inv.province)) info.push({ label: "المحافظة", value: clean(inv.province) });
  // أجور التوصيل تُسجَّل خارج total_amount في قاعدة البيانات، لذلك تُعرض
  // كمعلومة مستقلة بدل إقحامها في المجاميع وإرباك الحساب.
  if (delivery > 0) info.push({ label: "أجور التوصيل", value: amount(delivery) });

  const rows = items.map((x) => [
    clean(x.name),
    qty(x.qty),
    money(x.unit_price),
    toNumber(x.discount) ? money(x.discount) : "—",
    money(x.total),
  ]);

  const summary: DocSpec["summary"] = [
    { label: "مجموع المواد", value: amount(itemsSubtotal) },
  ];
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

  const pdf: DocSpec = {
    documentTitle: "فاتورة بيع",
    reference: `رقم ${number}`,
    info,
    columns: [
      { label: "المنتج", width: 0.40, align: "right" },
      { label: "الكمية", width: 0.10, align: "center" },
      { label: "سعر الوحدة", width: 0.17, align: "right" },
      { label: "الخصم", width: 0.14, align: "right" },
      { label: "المجموع", width: 0.19, align: "right" },
    ],
    rows,
    summary,
    statusText: remaining > 0 ? `المتبقي ${amount(remaining)}` : "مدفوعة بالكامل",
    statusTone: remaining > 0 ? "bad" : "good",
    actor,
    note: items.length ? undefined : "لا توجد مواد مسجّلة على هذه الفاتورة.",
  };

  const sheet: SheetSpec = {
    sheetName: "فاتورة",
    title: `فاتورة بيع رقم ${number}`,
    info,
    columns: [
      { label: "المنتج", width: 34, type: "text" },
      { label: "الكمية", width: 10, type: "number" },
      { label: "سعر الوحدة", width: 16, type: "number" },
      { label: "الخصم", width: 14, type: "number" },
      { label: "المجموع", width: 18, type: "number" },
    ],
    rows: items.map((x) => [
      clean(x.name),
      Math.round(toNumber(x.qty)),
      Math.round(toNumber(x.unit_price)),
      Math.round(toNumber(x.discount)),
      Math.round(toNumber(x.total)),
    ]),
    summary: [
      { label: "مجموع المواد", value: Math.round(itemsSubtotal), money: true },
      ...(Math.round(adjustment) !== 0
        ? [{
          label: adjustment < 0 ? "خصم على الفاتورة" : "إضافة على الفاتورة",
          value: Math.round(adjustment),
          money: true,
        }]
        : []),
      ...(delivery > 0 ? [{ label: "أجور التوصيل (منفصلة)", value: Math.round(delivery), money: true }] : []),
      { label: "الإجمالي الكلي", value: Math.round(total), money: true, strong: true },
      { label: "المدفوع", value: Math.round(paid), money: true },
      { label: "المتبقي", value: Math.round(Math.max(0, remaining)), money: true },
    ],
    status: remaining > 0 ? `المتبقي ${money(remaining)} د.ع` : "مدفوعة بالكامل",
  };

  return {
    pdf,
    sheet,
    fileBase: safeFileName(`فاتورة_${number}`),
    caption:
      `🧾 <b>فاتورة بيع</b> — ${escapeHtml(number)}\n` +
      `الزبون: ${escapeHtml(customer)}\n` +
      `الإجمالي: ${money(total)} د.ع` +
      (remaining > 0 ? `\nالمتبقي: ${money(remaining)} د.ع` : "\n✅ مدفوعة بالكامل"),
  };
}

// ------------------------------- كشف حساب -------------------------------

export function buildStatement(data: any): BuiltDocument {
  const customer = data?.customer ?? {};
  const txs: any[] = Array.isArray(data?.transactions) ? data.transactions : [];

  const balance = toNumber(customer.balance);
  const debits = txs.filter((t) => toNumber(t.amount) > 0).reduce((s, t) => s + toNumber(t.amount), 0);
  const credits = txs.filter((t) => toNumber(t.amount) < 0).reduce((s, t) => s + Math.abs(toNumber(t.amount)), 0);

  const name = clean(customer.name) || "—";
  const actor = clean(data?.meta?.actor) || "النظام";

  const info = [
    { label: "الزبون", value: name },
    { label: "الهاتف", value: clean(customer.phone) || "—" },
    { label: "العنوان", value: clean(customer.address) || "—" },
    { label: "تاريخ الكشف", value: dateIQ(data?.meta?.generated_at) },
    { label: "وقت الكشف", value: timeIQ(data?.meta?.generated_time) },
    { label: "عدد الحركات", value: String(txs.length) },
  ];

  const rows = txs.map((t) => [
    dateIQ(t.dt ?? t.at ?? t.created_at),
    clean(t.kind),
    clean(t.details),
    signedAmount(t.amount),
  ]);

  const statusText = balance > 0
    ? `بذمّته ${amount(balance)}`
    : balance < 0
    ? `رصيد دائن ${amount(balance)}`
    : "الحساب مسدّد بالكامل";

  const pdf: DocSpec = {
    documentTitle: "كشف حساب",
    reference: name,
    info,
    columns: [
      { label: "التاريخ", width: 0.17, align: "center" },
      { label: "النوع", width: 0.20, align: "right" },
      { label: "التفاصيل", width: 0.41, align: "right" },
      { label: "المبلغ", width: 0.22, align: "right" },
    ],
    rows,
    summary: [
      { label: "إجمالي المترتّب (دين)", value: amount(debits), tone: "bad" },
      { label: "إجمالي التسديد والسماح", value: amount(credits), tone: "good" },
      {
        label: "الرصيد الحالي",
        value: amount(balance),
        strong: true,
        tone: balance > 0 ? "bad" : balance < 0 ? "warn" : "good",
      },
    ],
    statusText,
    statusTone: balance > 0 ? "bad" : balance < 0 ? "warn" : "good",
    actor,
    note: txs.length
      ? "المبالغ الموجبة مترتّبة على الزبون، والسالبة تسديدات أو سماح."
      : "لا توجد حركات مسجّلة على هذا الحساب.",
  };

  const sheet: SheetSpec = {
    sheetName: "كشف حساب",
    title: `كشف حساب — ${name}`,
    info,
    columns: [
      { label: "التاريخ", width: 14, type: "text" },
      { label: "النوع", width: 18, type: "text" },
      { label: "التفاصيل", width: 36, type: "text" },
      { label: "المبلغ", width: 18, type: "number" },
    ],
    rows: txs.map((t) => [
      dateIQ(t.dt ?? t.at ?? t.created_at),
      clean(t.kind),
      clean(t.details),
      Math.round(toNumber(t.amount)),
    ]),
    summary: [
      { label: "إجمالي المترتّب (دين)", value: Math.round(debits), money: true },
      { label: "إجمالي التسديد والسماح", value: Math.round(credits), money: true },
      { label: "الرصيد الحالي", value: Math.round(balance), money: true, strong: true },
    ],
    status: statusText,
  };

  return {
    pdf,
    sheet,
    fileBase: safeFileName(`كشف_حساب_${name}`),
    caption:
      `📄 <b>كشف حساب</b> — ${escapeHtml(name)}\n` +
      `عدد الحركات: ${txs.length}\n` +
      `الرصيد: ${money(balance)} د.ع ${balance > 0 ? "(بذمّته)" : balance < 0 ? "(دائن)" : "(مسدّد)"}`,
  };
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
