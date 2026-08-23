// أدوات تنسيق موحّدة بين PDF و Excel.
// كل الأرقام تُكتب بالأرقام اللاتينية (0-9) لأنها الأوضح في الفواتير، ولأن
// خوارزمية UAX#9 تتعامل معها كمقطع مستقل ⇒ لا تنقلب داخل النص العربي.

import { isolateLTR } from "./rtl.ts";

export const CURRENCY = "د.ع";

export function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 1750000 ⇒ "1,750,000" */
export function money(v: unknown): string {
  return Math.round(Math.abs(toNumber(v))).toLocaleString("en-US");
}

/** يضيف العملة: "1,750,000 د.ع" */
export function amount(v: unknown): string {
  return `${money(v)} ${CURRENCY}`;
}

/**
 * مبلغ بإشارة. نغلّفه بعازل LTR حتى تبقى الإشارة ملتصقة بيسار الرقم
 * بدل أن تقفز إلى الطرف الآخر داخل الفقرة العربية.
 */
export function signedAmount(v: unknown): string {
  const n = toNumber(v);
  const sign = n < 0 ? "-" : "";
  return isolateLTR(`${sign}${money(n)}`);
}

export function qty(v: unknown): string {
  return String(Math.round(toNumber(v)));
}

const BAGHDAD = "Asia/Baghdad";

/** "2026/08/20" بتوقيت بغداد. يمرّر النص كما هو إذا كان منسّقاً مسبقاً. */
export function dateIQ(v: unknown): string {
  if (typeof v === "string" && /^\d{4}\/\d{2}\/\d{2}$/.test(v)) return v;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return String(v ?? "—");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BAGHDAD,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts.replaceAll("-", "/");
}

/**
 * "08:47 م" بتوقيت بغداد.
 * AM/PM بالعربية عمداً: «PM 08:47» هو الترتيب البصري الصحيح لـ AM/PM اللاتينية
 * داخل سطر عربي (خوارزمية BiDi)، لكنه يُربك القارئ. «ص/م» تقرأ طبيعياً.
 */
export function timeIQ(v: unknown): string {
  const mark = (h24: number) => (h24 < 12 ? "ص" : "م");
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{2}):(\d{2})\s?(AM|PM)$/i);
    if (m) return `${m[1]}:${m[2]} ${m[3].toUpperCase() === "AM" ? "ص" : "م"}`;
    if (/^\d{2}:\d{2}\s[صم]$/.test(v.trim())) return v.trim();
  }
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: BAGHDAD, ...opts }).format(d);
  const h24 = Number(fmt({ hour: "2-digit", hour12: false }).slice(0, 2)) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${fmt({ minute: "2-digit" }).padStart(2, "0")} ${mark(h24)}`;
}

/** اسم ملف آمن (تلغرام لا يحب المسافات والرموز في أسماء الملفات). */
export function safeFileName(base: string): string {
  return base
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 80) || "document";
}
