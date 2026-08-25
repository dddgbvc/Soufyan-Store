import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import ExcelJS from "https://esm.sh/exceljs@4.4.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================
// pdf-lib embeds fonts via fontkit, which performs REAL OpenType
// GSUB shaping (proper letter joining) automatically when you
// draw plain Unicode Arabic text — no manual glyph substitution
// needed. The one thing it does NOT do is bidi reordering, so we
// only need to reverse WORD order for correct RTL visual layout.
// ============================================================
function visualLine(raw: string): string {
  return raw.split(" ").reverse().join(" ");
}

async function hmac(key: BufferSource, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MAX_INITDATA_AGE_SECONDS = 86_400;

async function verifyInitData(initData: string, botToken: string): Promise<any | null> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const checkString = [...params.entries()].sort(([a],[b]) => a<b?-1:a>b?1:0).map(([k,v]) => `${k}=${v}`).join("\n");
    const secret = await hmac(new TextEncoder().encode("WebAppData"), botToken);
    const sig = await hmac(new Uint8Array(secret), checkString);
    if (toHex(sig) !== hash) return null;
    // بدون هذا الفحص يبقى أي initData مسرّب صالحاً للأبد.
    const age = Date.now() / 1000 - Number(params.get("auth_date") ?? 0);
    if (!(age >= 0 && age <= MAX_INITDATA_AGE_SECONDS)) return null;
    const user = JSON.parse(params.get("user") ?? "null");
    return user?.id ? user : null;
  } catch { return null; }
}
async function getCfg() {
  const { data, error } = await db.rpc("tg_config");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

// Old Android stock browser UA — no WOFF support, no EOT, so Google
// Fonts falls back to a plain static TTF. subset=arabic ensures we get
// the Arabic glyph coverage rather than the default Latin-only subset.
const OLD_UA = "Mozilla/5.0 (Linux; U; Android 2.3.5; en-us; HTC Vision Build/GRI40) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1";
let FONT_R: Uint8Array | null = null;
let FONT_B: Uint8Array | null = null;

async function fetchGoogleFontTTF(family: string, weight: number): Promise<Uint8Array> {
  const cssRes = await fetch(`https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:${weight}&subset=arabic`, {
    headers: { "User-Agent": OLD_UA },
  });
  const css = await cssRes.text();
  const m = css.match(/url\((https:[^)]+)\)/);
  if (!m) throw new Error("no font url in google fonts css: " + css.slice(0,300));
  const ttfRes = await fetch(m[1], { headers: { "User-Agent": OLD_UA } });
  if (!ttfRes.ok) throw new Error("ttf fetch failed: " + ttfRes.status);
  return new Uint8Array(await ttfRes.arrayBuffer());
}
async function getArabicFont(bold = false): Promise<Uint8Array> {
  if (bold && FONT_B) return FONT_B;
  if (!bold && FONT_R) return FONT_R;
  const bytes = await fetchGoogleFontTTF("Cairo", bold ? 700 : 400);
  if (bold) FONT_B = bytes; else FONT_R = bytes;
  return bytes;
}

function fmtNum(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString("en-US");
}

async function buildStatementPdf(data: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regBytes, boldBytes] = await Promise.all([getArabicFont(false), getArabicFont(true)]);
  const font = await doc.embedFont(regBytes, { subset: true });
  const fontBold = await doc.embedFont(boldBytes, { subset: true });

  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const marginX = 42;
  let y = height - 50;

  const navy = rgb(0.09, 0.13, 0.24);
  const grayLine = rgb(0.85, 0.85, 0.85);
  const red = rgb(0.75, 0.2, 0.18);
  const green = rgb(0.06, 0.42, 0.31);
  const dim = rgb(0.4, 0.42, 0.46);

  function drawRTL(text: string, xRight: number, yPos: number, size: number, color = rgb(0,0,0), useFont = font) {
    const shaped = visualLine(text);
    const w = useFont.widthOfTextAtSize(shaped, size);
    page.drawText(shaped, { x: xRight - w, y: yPos, size, font: useFont, color });
    return w;
  }
  function drawLTR(text: string, xLeft: number, yPos: number, size: number, color = rgb(0,0,0)) {
    page.drawText(text, { x: xLeft, y: yPos, size, font, color });
  }

  drawRTL("مكتب سفيان للموبايل", width - marginX, y, 20, navy, fontBold);
  y -= 22;
  drawRTL("قسم المحاسبة والمالية", width - marginX, y, 10.5, dim);

  const now = new Date();
  const dateStr = now.toISOString().slice(0,10).split("-").reverse().join("/");
  const timeStr = now.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:true });
  drawRTL("تاريخ الكشف: ", marginX + 140, height - 50, 10, dim);
  drawLTR(dateStr, marginX, height - 50, 10, navy);
  drawRTL("الوقت: ", marginX + 90, height - 64, 10, dim);
  drawLTR(timeStr, marginX, height - 64, 10, dim);

  y -= 20;
  page.drawLine({ start:{x:marginX,y}, end:{x:width-marginX,y}, thickness:1, color:grayLine });
  y -= 8;

  const wmText = visualLine("كشف حساب مالي تفصيلي");
  const wmSize = 15;
  const wmW = font.widthOfTextAtSize(wmText, wmSize);
  page.drawText(wmText, { x: (width-wmW)/2, y: y-2, size: wmSize, font, color: rgb(0.85,0.85,0.85) });
  y -= 30;

  drawRTL("اسم الزبون: ", width - marginX, y, 11, dim);
  const custLabelW = font.widthOfTextAtSize(visualLine("اسم الزبون: "), 11);
  drawRTL(data.customer.name, width - marginX - custLabelW, y, 11, navy, fontBold);
  drawRTL("رقم الهاتف: ", marginX + 130, y, 11, dim);
  drawLTR(data.customer.phone || "—", marginX, y, 11, navy);
  y -= 24;

  const colDate = width - marginX;
  const colType = width - marginX - 90;
  const colDetails = width - marginX - 210;

  drawRTL("التاريخ", colDate, y, 10.5, navy, fontBold);
  drawRTL("النوع", colType, y, 10.5, navy, fontBold);
  drawRTL("التفاصيل", colDetails, y, 10.5, navy, fontBold);
  drawLTR("المبلغ", marginX, y, 10.5, navy);
  y -= 6;
  page.drawLine({ start:{x:marginX,y}, end:{x:width-marginX,y}, thickness:1.4, color: rgb(0.2,0.4,0.75) });
  y -= 18;

  for (const row of data.rows) {
    if (y < 90) break;
    const rd = new Date(row.at);
    const dstr = rd.toISOString().slice(0,10).split("-").join("/");
    drawLTR(dstr, colDate - font.widthOfTextAtSize(dstr, 10), y, 10, dim);
    drawRTL(row.kind, colType, y, 10, navy);
    drawRTL(row.details, colDetails, y, 10, dim);
    const amt = Number(row.amount);
    const amtColor = amt < 0 ? red : green;
    const amtStr = amt < 0 ? fmtNum(amt) + "-" : fmtNum(amt);
    drawLTR(amtStr, marginX, y, 10.5, amtColor);
    y -= 20;
  }

  y -= 6;
  page.drawLine({ start:{x:marginX,y}, end:{x:marginX+180,y}, thickness:1, color: rgb(0.15,0.15,0.15) });
  y -= 26;

  drawRTL("الرصيد المتبقي بذمة الزبون", width - marginX, y, 11, dim);
  y -= 26;
  const bal = Number(data.customer.balance);
  const balColor = bal > 0 ? navy : green;
  drawRTL(fmtNum(bal) + " IQD", width - marginX, y, 22, balColor, fontBold);
  y -= 22;
  if (bal > 0) drawRTL("مطلب لشركتنا", width - marginX, y, 10.5, red);
  else if (bal < 0) drawRTL("رصيد دائن للزبون", width - marginX, y, 10.5, green);

  drawRTL("تم التنفيذ من قبل: " + (data.actor || "النظام"), width - marginX, 46, 9, dim);
  const foot = visualLine("نظام مكتب سفيان — V1.0");
  const footW = font.widthOfTextAtSize(foot, 8.5);
  page.drawText(foot, { x:(width-footW)/2, y:30, size:8.5, font, color: rgb(0.75,0.75,0.75) });

  return await doc.save();
}

async function buildStatementXlsx(data: any): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "مكتب سفيان للموبايل";
  const ws = wb.addWorksheet("كشف حساب", { views: [{ rightToLeft: true }] });

  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = "مكتب سفيان للموبايل — كشف حساب مالي تفصيلي";
  ws.getCell("A1").font = { name: "Arial", size: 14, bold: true, color: { argb: "FF17223D" } };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:D2");
  ws.getCell("A2").value = `الزبون: ${data.customer.name}   |   الهاتف: ${data.customer.phone || "—"}   |   ${new Date().toLocaleString("ar-IQ")}`;
  ws.getCell("A2").font = { name: "Arial", size: 10, color: { argb: "FF5E6D66" } };
  ws.getCell("A2").alignment = { horizontal: "center" };

  ws.addRow([]);
  const headerRow = ws.addRow(["التاريخ", "النوع", "التفاصيل", "المبلغ (د.ع)"]);
  headerRow.eachCell((c: any) => {
    c.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E6B4E" } };
    c.alignment = { horizontal: "center" };
  });

  for (const row of data.rows) {
    const r = ws.addRow([
      new Date(row.at).toLocaleDateString("en-CA"),
      row.kind, row.details, Number(row.amount),
    ]);
    r.getCell(4).numFmt = '#,##0;[Red]-#,##0';
    r.eachCell((c: any) => { c.font = { name: "Arial", size: 10.5 }; c.alignment = { horizontal: "center" }; });
  }

  ws.addRow([]);
  const balRow = ws.addRow(["", "", "الرصيد المتبقي بذمة الزبون", Number(data.customer.balance)]);
  balRow.getCell(3).font = { name: "Arial", bold: true, size: 11 };
  balRow.getCell(4).font = { name: "Arial", bold: true, size: 13, color: { argb: "FF17223D" } };
  balRow.getCell(4).numFmt = '#,##0 "IQD"';

  ws.columns = [{ width: 14 }, { width: 16 }, { width: 30 }, { width: 16 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

async function tgDoc(token: string, chatId: string, bytes: Uint8Array, filename: string, mime: string, caption: string) {
  const fd = new FormData();
  fd.append("chat_id", chatId);
  fd.append("caption", caption);
  fd.append("parse_mode", "HTML");
  fd.append("document", new Blob([bytes], { type: mime }), filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: fd });
  const j = await res.json();
  if (!j.ok) throw new Error("sendDocument failed: " + JSON.stringify(j));
  return j;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("not found", { status: 404, headers: CORS });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  try {
    const cfg = await getCfg();

    // ------------------------------------------------------------------
    // المصادقة إلزامية دائماً.
    // كانت سابقاً داخل `if (body.initData)`، يعني من ما يدزّ initData أصلاً
    // يتخطى الفحص كله ويطلع كشف حساب أي زبون بمجرد معرفة معرّفه.
    // ------------------------------------------------------------------
    const user = await verifyInitData(String(body.initData ?? body.init_data ?? ""), cfg.bot_token);
    if (!user) {
      return Response.json({ ok:false, error:"unauthorized" }, { status:401, headers:CORS });
    }

    const { data: id } = await db.rpc("bot_identify", { p_telegram_id: user.id });
    if (!id?.can_read) {
      return Response.json({ ok:false, error:"forbidden" }, { status:403, headers:CORS });
    }
    const actorLabel = id.employee_name || id.label;

    let customerId = body.customer_id as string | undefined;
    if (!customerId && body.customer_query) {
      const { data: found } = await db.rpc("bot_find_customer", { p_query: body.customer_query });
      if (!found?.length) return Response.json({ ok:false, error:"customer not found" }, { headers:CORS });
      customerId = found[0].id;
    }

    if (!customerId) return Response.json({ ok:false, error:"customer_id required" }, { status:400, headers:CORS });

    const { data: statement, error } = await db.rpc("bot_customer_statement", { p_customer_id: customerId });
    if (error) throw new Error(error.message);
    if (!statement?.ok) return Response.json({ ok:false, error: statement?.error || "failed" }, { headers:CORS });

    statement.actor = actorLabel;

    const pdfBytes = await buildStatementPdf(statement);
    const xlsxBytes = await buildStatementXlsx(statement);

    if (body.deliver_to_chat) {
      // التسليم لمحادثة الطالب نفسه فقط — لا لأي chat_id يرسله العميل.
      const chatId = String(user.id);
      const fname = `كشف_حساب_${statement.customer.name}`.replace(/\s+/g,'_');
      const caption = `📄 كشف حساب — ${statement.customer.name}\nالرصيد: ${Math.round(Number(statement.customer.balance)).toLocaleString('en-US')} د.ع`;
      await tgDoc(cfg.bot_token, chatId, pdfBytes, fname+".pdf", "application/pdf", caption);
      await tgDoc(cfg.bot_token, chatId, xlsxBytes, fname+".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "📊 نفس الكشف بصيغة Excel");
      return Response.json({ ok:true, delivered:true }, { headers:CORS });
    }

    return Response.json({
      ok: true,
      customer: statement.customer,
      pdf_base64: btoa(String.fromCharCode(...pdfBytes)),
      xlsx_base64: btoa(String.fromCharCode(...xlsxBytes)),
    }, { headers: CORS });

  } catch (e) {
    console.error("statement error:", String(e));
    return Response.json({ ok:false, error:"صار خلل أثناء تجهيز الكشف." }, { status:500, headers:CORS });
  }
});
