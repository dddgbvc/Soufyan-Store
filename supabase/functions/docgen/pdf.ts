// ============================================================================
// محرّك بناء مستندات PDF عربية (فواتير وكشوف حساب)
// ----------------------------------------------------------------------------
// كل نص يمرّ عبر visualRuns() من rtl.ts: نقسّم السطر إلى مقاطع اتجاهية حسب
// UAX#9 ثم نرسم كل مقطع في موضعه. هكذا تبقى الأرقام والكلمات اللاتينية
// بترتيبها الصحيح، وتُشكَّل الحروف العربية وتُوصَل عبر GSUB في fontkit.
// ============================================================================

import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import { loadArabicFont, inspect } from "./font.ts";
import { clean, visualRuns } from "./rtl.ts";

// ------------------------------- الهوية البصرية -------------------------------

const NAVY = rgb(0.075, 0.114, 0.216);
const NAVY_SOFT = rgb(0.145, 0.196, 0.318);
const GOLD = rgb(0.788, 0.596, 0.247);
const GREEN = rgb(0.055, 0.42, 0.306);
const RED = rgb(0.702, 0.149, 0.118);
const INK = rgb(0.11, 0.12, 0.15);
const MUTED = rgb(0.42, 0.45, 0.51);
const BORDER = rgb(0.886, 0.898, 0.918);
const ZEBRA = rgb(0.969, 0.973, 0.98);
const CARD = rgb(0.976, 0.98, 0.988);
const WHITE = rgb(1, 1, 1);

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 40;

// ------------------------------- أنواع المستند -------------------------------

export type Align = "right" | "left" | "center";
export type Tone = "normal" | "good" | "bad" | "warn";

export type Column = {
  label: string;
  width: number; // نسبة من عرض الجدول (المجموع = 1)
  align?: Align;
};

export type SummaryLine = { label: string; value: string; strong?: boolean; tone?: Tone };

export type DocSpec = {
  documentTitle: string; // عنوان المستند: "فاتورة بيع" أو "كشف حساب"
  reference: string; // الرقم المرجعي (رقم الفاتورة / اسم الزبون)
  info: { label: string; value: string }[];
  columns: Column[];
  rows: string[][];
  summary: SummaryLine[];
  statusText: string;
  statusTone: Tone;
  actor: string;
  note?: string;
  /** التقارير العريضة (المبيعات مثلاً) تحتاج صفحة أفقية. */
  orientation?: "portrait" | "landscape";
};

export type StoreInfo = {
  name: string;
  subtitle: string;
  address: string;
  phones: string[];
  internetPhone?: string;
  footer: string;
};

// ------------------------------- أداة الرسم -------------------------------

type PaintOpts = {
  size?: number;
  bold?: boolean;
  color?: RGB;
  align?: Align;
  maxWidth?: number;
};

class Painter {
  constructor(
    private regular: PDFFont,
    private bold: PDFFont,
    private coverage: (cp: number) => boolean,
  ) {}

  font(bold?: boolean): PDFFont {
    return bold ? this.bold : this.regular;
  }

  /**
   * يحذف المحارف التي لا يملك الخط رسماً لها حتى لا تظهر مربّعات فارغة،
   * مع الإبقاء على محارف التحكّم ثنائية الاتجاه — فهي لا تُرسم أصلاً لكنها
   * ضرورية لحساب الاتجاه، ويتكفّل rtl.ts بحذفها بعد ذلك.
   */
  supported(text: string): string {
    let out = "";
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp === 0x20 || isBidiControl(cp) || this.coverage(cp)) out += ch;
    }
    return out;
  }

  width(text: string, size: number, bold?: boolean): number {
    const f = this.font(bold);
    let w = 0;
    for (const run of visualRuns(this.supported(text))) {
      w += f.widthOfTextAtSize(run.text, size);
    }
    return w;
  }

  /**
   * يرسم سطراً واحداً. المعنى الدقيق لـ x يعتمد على المحاذاة:
   * right ⇒ الحافة اليمنى، left ⇒ الحافة اليسرى، center ⇒ المنتصف.
   */
  line(page: PDFPage, raw: string, x: number, y: number, opts: PaintOpts = {}): number {
    const size = opts.size ?? 10;
    const f = this.font(opts.bold);
    const color = opts.color ?? INK;
    let text = this.supported(clean(raw));
    if (!text) return 0;

    if (opts.maxWidth) text = this.ellipsize(text, size, opts.maxWidth, opts.bold);

    const runs = visualRuns(text);
    const total = runs.reduce((s, r) => s + f.widthOfTextAtSize(r.text, size), 0);

    const align = opts.align ?? "right";
    let cursor = align === "right" ? x - total : align === "center" ? x - total / 2 : x;

    for (const run of runs) {
      page.drawText(run.text, { x: cursor, y, size, font: f, color });
      cursor += f.widthOfTextAtSize(run.text, size);
    }
    return total;
  }

  ellipsize(text: string, size: number, maxWidth: number, bold?: boolean): string {
    if (this.width(text, size, bold) <= maxWidth) return text;
    const chars = Array.from(text);
    let lo = 0;
    let hi = chars.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.width(chars.slice(0, mid).join("") + "…", size, bold) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return chars.slice(0, lo).join("").trimEnd() + "…";
  }

  wrap(raw: string, size: number, maxWidth: number, bold?: boolean, maxLines = 2): string[] {
    const text = this.supported(clean(raw));
    if (!text) return [];
    if (this.width(text, size, bold) <= maxWidth) return [text];

    const words = text.split(" ").filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? current + " " + word : word;
      if (this.width(candidate, size, bold) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
        if (lines.length === maxLines) break;
      }
    }
    if (lines.length < maxLines && current) lines.push(current);
    if (lines.length === maxLines) {
      const rest = lines[maxLines - 1];
      lines[maxLines - 1] = this.ellipsize(rest, size, maxWidth, bold);
    }
    return lines.slice(0, maxLines);
  }
}

function isBidiControl(cp: number): boolean {
  return cp === 0x200e || cp === 0x200f || cp === 0x061c ||
    (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
}

function toneColor(tone: Tone | undefined): RGB {
  if (tone === "good") return GREEN;
  if (tone === "bad") return RED;
  if (tone === "warn") return GOLD;
  return INK;
}

// ------------------------------- بناء المستند -------------------------------

const HEADER_H = 92;
const FOOTER_H = 52;
const ROW_H = 22;
const TABLE_HEAD_H = 26;

export async function buildDocumentPdf(spec: DocSpec, store: StoreInfo): Promise<Uint8Array> {
  const A4: [number, number] = spec.orientation === "landscape" ? A4_LANDSCAPE : A4_PORTRAIT;
  const CONTENT_W = A4[0] - MARGIN * 2;

  const [regularFont, boldFont] = await Promise.all([loadArabicFont(400), loadArabicFont(700)]);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit as any);
  const regular = await doc.embedFont(regularFont.bytes, { subset: true });
  const bold = await doc.embedFont(boldFont.bytes, { subset: true });

  const probe = inspect(regularFont.bytes);
  const paint = new Painter(regular, bold, (cp) => probe.hasGlyphForCodePoint(cp));

  doc.setTitle(`${spec.documentTitle} — ${spec.reference}`);
  doc.setAuthor(store.name);
  doc.setSubject(spec.documentTitle);
  doc.setProducer(store.name);
  doc.setCreator(store.footer);
  doc.setLanguage("ar-IQ");

  const pages: PDFPage[] = [];
  const right = A4[0] - MARGIN;
  const left = MARGIN;

  const newPage = (): PDFPage => {
    const page = doc.addPage(A4);
    pages.push(page);
    drawHeader(page);
    drawFooterFrame(page);
    return page;
  };

  function drawHeader(page: PDFPage) {
    page.drawRectangle({ x: 0, y: A4[1] - HEADER_H, width: A4[0], height: HEADER_H, color: NAVY });
    page.drawRectangle({ x: 0, y: A4[1] - HEADER_H - 3, width: A4[0], height: 3, color: GOLD });

    let y = A4[1] - 36;
    paint.line(page, store.name, right, y, { size: 18, bold: true, color: WHITE });
    y -= 17;
    paint.line(page, store.subtitle, right, y, { size: 9.5, color: rgb(0.78, 0.82, 0.89) });
    y -= 14;
    paint.line(page, store.address, right, y, { size: 8, color: rgb(0.66, 0.71, 0.8) });

    // الجهة اليسرى: نوع المستند ورقمه
    let ly = A4[1] - 36;
    paint.line(page, spec.documentTitle, left, ly, { size: 14, bold: true, color: GOLD, align: "left" });
    ly -= 16;
    paint.line(page, spec.reference, left, ly, { size: 10.5, color: WHITE, align: "left" });
    ly -= 14;
    const phones = store.phones.join("  /  ");
    paint.line(page, phones, left, ly, { size: 8, color: rgb(0.66, 0.71, 0.8), align: "left" });
  }

  function drawFooterFrame(page: PDFPage) {
    page.drawLine({
      start: { x: left, y: FOOTER_H },
      end: { x: right, y: FOOTER_H },
      thickness: 0.7,
      color: BORDER,
    });
    paint.line(page, store.footer, right, FOOTER_H - 15, { size: 7.5, color: MUTED });
    paint.line(page, `أنجز بواسطة: ${spec.actor || "النظام"}`, right, FOOTER_H - 26, {
      size: 7.5,
      color: MUTED,
    });
    if (store.internetPhone) {
      paint.line(page, `خدمة الإنترنت: ${store.internetPhone}`, left, FOOTER_H - 15, {
        size: 7.5,
        color: MUTED,
        align: "left",
      });
    }
  }

  let page = newPage();
  let y = A4[1] - HEADER_H - 24;

  // ----------------------------- بطاقة المعلومات -----------------------------
  if (spec.info.length) {
    // الصفحة الأفقية ضِعف العرض، فنوزّع المعلومات على ثلاثة أعمدة بدل عمودين
    // ونكسب سطرين إضافيين للجدول.
    const infoColumns = spec.orientation === "landscape" ? 3 : 2;
    const perColumn = Math.ceil(spec.info.length / infoColumns);
    const cardH = perColumn * 17 + 18;
    page.drawRectangle({
      x: left,
      y: y - cardH,
      width: CONTENT_W,
      height: cardH,
      color: CARD,
      borderColor: BORDER,
      borderWidth: 0.7,
    });
    page.drawRectangle({ x: right - 3, y: y - cardH, width: 3, height: cardH, color: NAVY_SOFT });

    const colWidth = (CONTENT_W - 26) / infoColumns;
    spec.info.forEach((item, i) => {
      const col = Math.floor(i / perColumn);
      const rowIndex = i - col * perColumn;
      const anchor = right - 14 - col * (colWidth + 2);
      const ty = y - 20 - rowIndex * 17;
      const labelW = paint.line(page, `${item.label}:`, anchor, ty, {
        size: 8.5,
        color: MUTED,
        bold: true,
      });
      paint.line(page, item.value || "—", anchor - labelW - 6, ty, {
        size: 9.5,
        color: INK,
        maxWidth: colWidth - labelW - 12,
      });
    });
    y -= cardH + 18;
  }

  // -------------------------------- الجدول --------------------------------
  const widths = normalizeWidths(spec.columns);
  // نملأ الصفحة حتى آخرها؛ صندوق المجاميع له حارس صفحة خاص به بعد الجدول،
  // فلا داعي لحجز مساحته على كل صفحة وترك فراغ في الوسط.
  const bottomLimit = FOOTER_H + 24;

  const drawTableHead = (): void => {
    page.drawRectangle({
      x: left,
      y: y - TABLE_HEAD_H,
      width: CONTENT_W,
      height: TABLE_HEAD_H,
      color: NAVY_SOFT,
    });
    let x = right;
    spec.columns.forEach((col, i) => {
      const w = widths[i] * CONTENT_W;
      paint.line(page, col.label, cellAnchor(x, w, col.align ?? "right"), y - TABLE_HEAD_H + 8.5, {
        size: 9,
        bold: true,
        color: WHITE,
        align: col.align ?? "right",
        maxWidth: w - 12,
      });
      x -= w;
    });
    y -= TABLE_HEAD_H;
  };

  drawTableHead();

  spec.rows.forEach((row, index) => {
    // ارتفاع السطر يعتمد على أطول خلية بعد اللف
    const wrapped = spec.columns.map((col, i) => {
      const w = widths[i] * CONTENT_W - 12;
      return paint.wrap(row[i] ?? "", 9, w, false, 2);
    });
    const lines = Math.max(1, ...wrapped.map((l) => l.length));
    const height = Math.max(ROW_H, lines * 12 + 9);

    if (y - height < bottomLimit) {
      page = newPage();
      y = A4[1] - HEADER_H - 24;
      drawTableHead();
    }

    if (index % 2 === 1) {
      page.drawRectangle({ x: left, y: y - height, width: CONTENT_W, height, color: ZEBRA });
    }
    page.drawLine({
      start: { x: left, y: y - height },
      end: { x: right, y: y - height },
      thickness: 0.5,
      color: BORDER,
    });

    let x = right;
    spec.columns.forEach((col, i) => {
      const w = widths[i] * CONTENT_W;
      const align = col.align ?? "right";
      wrapped[i].forEach((lineText, li) => {
        paint.line(page, lineText, cellAnchor(x, w, align), y - 15 - li * 12, {
          size: 9,
          color: INK,
          align,
        });
      });
      x -= w;
    });

    y -= height;
  });

  // ------------------------------ صندوق المجاميع ------------------------------
  y -= 22;
  const boxH = spec.summary.length * 18 + 16;
  if (y - boxH < FOOTER_H + 30) {
    page = newPage();
    y = A4[1] - HEADER_H - 30;
  }

  const boxW = spec.orientation === "landscape" ? 300 : 250;
  const boxX = left;
  page.drawRectangle({
    x: boxX,
    y: y - boxH,
    width: boxW,
    height: boxH,
    color: CARD,
    borderColor: BORDER,
    borderWidth: 0.7,
  });

  spec.summary.forEach((item, i) => {
    const ty = y - 18 - i * 18;
    const strong = !!item.strong;
    if (strong) {
      page.drawRectangle({
        x: boxX,
        y: ty - 5,
        width: boxW,
        height: 18,
        color: rgb(0.925, 0.937, 0.953),
      });
    }
    paint.line(page, item.label, boxX + boxW - 10, ty, {
      size: strong ? 10 : 9,
      bold: strong,
      color: strong ? INK : MUTED,
    });
    paint.line(page, item.value, boxX + 10, ty, {
      size: strong ? 11.5 : 9.5,
      bold: strong,
      color: toneColor(item.tone),
      align: "left",
    });
  });

  // شارة الحالة على اليمين
  const chipColor = toneColor(spec.statusTone);
  const chipTextW = paint.width(spec.statusText, 10.5, true);
  const chipW = Math.min(CONTENT_W - boxW - 20, chipTextW + 28);
  const chipX = right - chipW;
  page.drawRectangle({ x: chipX, y: y - 30, width: chipW, height: 26, color: chipColor });
  paint.line(page, spec.statusText, right - 14, y - 22, {
    size: 10.5,
    bold: true,
    color: WHITE,
    maxWidth: chipW - 20,
  });

  if (spec.note) {
    const noteWidth = CONTENT_W - boxW - 20;
    paint.wrap(spec.note, 8.5, noteWidth, false, 3).forEach((lineText, i) => {
      paint.line(page, lineText, right, y - 48 - i * 11, { size: 8.5, color: MUTED });
    });
  }

  // ------------------------------ ترقيم الصفحات ------------------------------
  pages.forEach((p, i) => {
    paint.line(p, `صفحة ${i + 1} من ${pages.length}`, A4[0] / 2, FOOTER_H - 15, {
      size: 7.5,
      color: MUTED,
      align: "center",
    });
  });

  return await doc.save();
}

function normalizeWidths(columns: Column[]): number[] {
  const total = columns.reduce((s, c) => s + (c.width || 0), 0) || 1;
  return columns.map((c) => (c.width || 0) / total);
}

/** يحوّل حافة الخلية اليمنى إلى نقطة الارتكاز المناسبة للمحاذاة. */
function cellAnchor(rightEdge: number, width: number, align: Align): number {
  if (align === "right") return rightEdge - 6;
  if (align === "left") return rightEdge - width + 6;
  return rightEdge - width / 2;
}
