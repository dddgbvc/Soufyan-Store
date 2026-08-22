// ============================================================================
// بناء ملفات النسخة الاحتياطية — منطق خالص بلا اعتماد على Deno أو الشبكة،
// حتى ينكتبله اختبار ويشتغل بأي بيئة.
// ============================================================================

import {
  columnLabel,
  formatValue,
  GROUP_LABEL,
  GROUP_ORDER,
  isHidden,
  TABLES,
  tableLabel,
  type Group,
} from "./labels.ts";

export type Dump = Record<string, Record<string, unknown>[]>;
export type TableCount = { table: string; ar: string; n: number; group: Group };

/** ‏sufyan_backup_2026-08-23_01-20 ← يطلع "2026-08-23 الساعة 01:20" */
export function stampText(stamp: string, joiner = " الساعة "): string {
  return stamp.replace("_", joiner).replace(/(\d{2})-(\d{2})$/, "$1:$2");
}

const fmt = (n: number | string): string => {
  const x = Number(n);
  return isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(n);
};

function csvCell(v: string): string {
  let s = v ?? "";
  if (/[",\n\r]/.test(s)) s = '"' + s.replaceAll('"', '""') + '"';
  return s;
}

/** جداول مساعدة تحوّل المعرّفات (UUID) لأرقام وأسماء يفهمها الإنسان. */
export type Lookups = {
  invoiceNo: Map<string, string>;
  returnNo: Map<string, string>;
  category: Map<string, string>;
};

export function buildLookups(dump: Dump): Lookups {
  const pick = (table: string, key: string) => {
    const m = new Map<string, string>();
    for (const r of dump[table] ?? []) {
      const id = r["id"];
      const val = r[key];
      if (id != null && val != null) m.set(String(id), String(val));
    }
    return m;
  };
  return {
    invoiceNo: pick("invoices", "invoice_number"),
    returnNo: pick("returns", "return_number"),
    category: pick("categories", "name"),
  };
}

function resolveCell(col: string, raw: unknown, lk: Lookups): string {
  if (raw != null) {
    if (col === "invoice_id") return lk.invoiceNo.get(String(raw)) ?? String(raw);
    if (col === "return_id") return lk.returnNo.get(String(raw)) ?? String(raw);
    if (col === "category_id") return lk.category.get(String(raw)) ?? String(raw);
  }
  return formatValue(col, raw);
}

const BOM = "﻿";
const EMPTY = BOM + "(ماكو بيانات بهذا الملف)";

/** CSV بعناوين عربية، بلا الأعمدة التقنية، وبقيم مفهومة. */
export function toCsv(table: string, rows: Record<string, unknown>[], lk: Lookups): string {
  if (!rows || rows.length === 0) return EMPTY;

  // نجمع كل الأعمدة من كل الصفوف — بعض الصفوف يمكن تنقصها مفاتيح.
  const seen = new Set<string>();
  for (const r of rows) for (const c of Object.keys(r)) seen.add(c);
  const cols = [...seen].filter((c) => !isHidden(table, c));
  if (!cols.length) return EMPTY;

  const lines = [cols.map((c) => csvCell(columnLabel(table, c))).join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => csvCell(resolveCell(c, r[c], lk))).join(","));
  }
  return BOM + lines.join("\r\n");
}

/** سطر مختصر لكل مجموعة: "المبيعات: 35 فاتورة · 59 مادة" */
export function groupLines(counts: TableCount[]): string[] {
  const out: string[] = [];
  for (const g of GROUP_ORDER) {
    const items = counts.filter((c) => c.group === g && c.n > 0);
    if (!items.length) continue;
    if (g === "system") {
      out.push(`${GROUP_LABEL[g]}: ${items.length} ملف`);
      continue;
    }
    out.push(
      `${GROUP_LABEL[g]}: ` +
        items.map((i) => `${fmt(i.n)} ${TABLES[i.table]?.unit ?? "سجل"}`).join(" · "),
    );
  }
  return out;
}

/** ملف «اقرأني» جوّا الضغط: يشرح شنو وصل وشلون يُفتح وشنو يعني كل ملف. */
export function guideText(counts: TableCount[], stamp: string): string {
  const lines: string[] = [
    "دليل النسخة الاحتياطية — مكتب سفيان للموبايل",
    `تاريخ النسخة: ${stampText(stamp)} (بتوقيت بغداد)`,
    "",
    "▪ شنو هذا الملف؟",
    "نسخة كاملة من بيانات المحل، تنرسل تلقائياً كل يوم الساعة 11 بالليل.",
    "احفظها بمكان أمين — إذا صار خلل بالبرنامج أو ضاعت البيانات، منها ترجع كلشي.",
    "",
    "▪ شلون أفتحها؟",
    "فك الضغط، وبعدين افتح أي ملف ينتهي بـ .csv ببرنامج Excel أو Google Sheets.",
    "كل ملف جدول، وعناوين أعمدته بالعربي.",
    "",
    "▪ الملفات:",
  ];

  for (const g of GROUP_ORDER) {
    const items = counts.filter((c) => c.group === g);
    if (!items.length) continue;
    lines.push("", `── ${GROUP_LABEL[g]} ──`);
    for (const it of items) {
      const info = TABLES[it.table];
      lines.push(`• ${it.ar}.csv — ${fmt(it.n)} ${info?.unit ?? "سجل"}`);
      if (info?.note) lines.push(`  ${info.note}`);
    }
  }

  lines.push(
    "",
    "▪ ملاحظات مهمة:",
    "• كل المبالغ بالدينار العراقي، مكتوبة بلا فواصل حتى الإكسل يحسبها صح.",
    "• كل الأوقات محوّلة لتوقيت بغداد.",
    "• رموز الدخول (PIN) مشيلة من ملفات الإكسل للأمان.",
    "• ملف _full_backup.json نسخة تقنية كاملة بالأسماء الأصلية — لا تحذفه،",
    "  هو المستعمل للاستعادة إذا احتجت ترجّع البيانات.",
  );

  return lines.join("\r\n");
}

export type BuiltBackup = {
  files: Record<string, string>;
  counts: TableCount[];
  totalRows: number;
  tableCount: number;
};

/** يحوّل الـdump الخام لملفات جاهزة للضغط: CSV عربي لكل جدول + دليل + نسخة تقنية. */
export function buildFiles(dump: Dump, stamp: string): BuiltBackup {
  const lookups = buildLookups(dump);
  const files: Record<string, string> = {};
  const counts: TableCount[] = [];
  let totalRows = 0;

  for (const [table, rows] of Object.entries(dump)) {
    const n = rows?.length ?? 0;
    totalRows += n;
    counts.push({
      table,
      ar: tableLabel(table),
      n,
      group: TABLES[table]?.group ?? "system",
    });
    files[`${tableLabel(table)}.csv`] = toCsv(table, rows ?? [], lookups);
  }

  counts.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));

  files["اقرأني.txt"] = guideText(counts, stamp);
  files["_full_backup.json"] = JSON.stringify(dump, null, 2);

  return { files, counts, totalRows, tableCount: Object.keys(dump).length };
}
