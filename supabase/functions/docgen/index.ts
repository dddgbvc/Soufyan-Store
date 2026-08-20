// ============================================================================
// docgen — توليد فواتير وكشوف حساب بصيغتَي PDF و Excel وإرسالها عبر تلغرام
// ----------------------------------------------------------------------------
// عقد الاستدعاء لم يتغيّر عن النسخة السابقة:
//   POST { kind: "invoice" | "statement", query, initData }            (من الـ Mini App)
//   POST { kind, query, telegram_id, chat_id } + x-cron-secret          (من البوت)
// وأُضيف مسار تشخيصي:
//   GET  /docgen/selftest  ⇒ يعيد PDF بنموذج ثابت للتأكّد من الخط والاتجاه.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildDocumentPdf } from "./pdf.ts";
import { buildSheet } from "./xlsx.ts";
import { buildInvoice, buildStatement, escapeHtml, STORE } from "./documents.ts";
import { loadArabicFont } from "./font.ts";
import { SAMPLE_INVOICE } from "./sample.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-cron-secret",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const PDF_MIME = "application/pdf";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ------------------------------ مصادقة تلغرام ------------------------------

async function hmac(key: BufferSource, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function verifyInitData(initData: string, botToken: string): Promise<any | null> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const checkString = [...params.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secret = await hmac(new TextEncoder().encode("WebAppData"), botToken);
    if (hex(await hmac(new Uint8Array(secret), checkString)) !== hash) return null;
    const age = Date.now() / 1000 - Number(params.get("auth_date") ?? 0);
    if (age < 0 || age > 86_400) return null;
    const user = JSON.parse(params.get("user") ?? "null");
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

async function config() {
  const { data, error } = await db.rpc("tg_config");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

async function sendDocument(
  token: string,
  chatId: string,
  bytes: Uint8Array,
  filename: string,
  mime: string,
  caption: string,
) {
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) {
    form.append("caption", caption.slice(0, 1024));
    form.append("parse_mode", "HTML");
  }
  form.append("document", new Blob([bytes], { type: mime }), filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!json.ok) throw new Error("sendDocument failed: " + JSON.stringify(json));
}

// --------------------------------- الخادم ---------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);

  // مسار تشخيصي: يرسم مستنداً بنموذج ثابت — لا يلمس أي بيانات حقيقية.
  if (req.method === "GET" && url.pathname.endsWith("/selftest")) {
    try {
      const built = buildInvoice(SAMPLE_INVOICE);
      if (url.searchParams.get("format") === "json") {
        const font = await loadArabicFont(400);
        const pdf = await buildDocumentPdf(built.pdf, STORE);
        return Response.json({
          ok: true,
          font: { family: font.family, weight: font.weight, bytes: font.bytes.length, format: "truetype" },
          pdf_bytes: pdf.length,
          engine: "pdf-lib + fontkit (GSUB shaping) + bidi-js (UAX#9)",
        }, { headers: CORS });
      }
      const pdf = await buildDocumentPdf(built.pdf, STORE);
      return new Response(pdf, {
        headers: { ...CORS, "Content-Type": PDF_MIME, "Content-Disposition": 'inline; filename="selftest.pdf"' },
      });
    } catch (e) {
      console.error("selftest:", e);
      return Response.json({ ok: false, error: String(e) }, { status: 500, headers: CORS });
    }
  }

  if (req.method !== "POST") return new Response("not found", { status: 404, headers: CORS });

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* يُعامل كطلب فارغ */ }

  let cfg: any;
  try {
    cfg = await config();
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500, headers: CORS });
  }

  // إمّا نداء داخلي من البوت بسرّ الويبهوك، وإمّا مستخدم Mini App موثّق.
  const secret = req.headers.get("x-cron-secret");
  const internal = !!secret && !!cfg.webhook_secret && secret === cfg.webhook_secret;

  let telegramId: number;
  let chatId: string;

  if (internal && body.telegram_id) {
    telegramId = Number(body.telegram_id);
    chatId = String(body.chat_id ?? body.telegram_id);
  } else {
    const user = await verifyInitData(String(body.initData ?? body.init_data ?? ""), cfg.bot_token);
    if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: CORS });
    telegramId = user.id;
    chatId = String(user.id);
  }

  const kind = String(body.kind ?? "");
  const query = String(body.query ?? "").trim();

  try {
    let built;
    if (kind === "statement") {
      const { data, error } = await db.rpc("doc_customer_statement", {
        p_telegram_id: telegramId,
        p_customer_query: query,
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? "statement_failed");
      built = buildStatement(data);
    } else if (kind === "invoice") {
      const { data, error } = await db.rpc("doc_invoice", {
        p_telegram_id: telegramId,
        p_invoice_number: query,
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? "invoice_failed");
      built = buildInvoice(data);
    } else {
      throw new Error("unknown_kind");
    }

    const [pdfBytes, xlsxBytes] = await Promise.all([
      buildDocumentPdf(built.pdf, STORE),
      buildSheet(built.sheet, STORE),
    ]);

    if (body.debug) {
      const font = await loadArabicFont(400);
      return Response.json({
        ok: true,
        pdf_bytes: pdfBytes.length,
        xlsx_bytes: xlsxBytes.length,
        rows: built.pdf.rows.length,
        font: { family: font.family, bytes: font.bytes.length, format: "truetype" },
        engine: "pdf-lib + fontkit (GSUB shaping) + bidi-js (UAX#9)",
        persistence: "memory_only",
      }, { headers: CORS });
    }

    await sendDocument(cfg.bot_token, chatId, pdfBytes, `${built.fileBase}.pdf`, PDF_MIME, built.caption);
    await sendDocument(
      cfg.bot_token,
      chatId,
      xlsxBytes,
      `${built.fileBase}.xlsx`,
      XLSX_MIME,
      "📊 نفس المستند بصيغة Excel",
    );

    return Response.json({ ok: true, sent: true, persistence: "memory_only" }, { headers: CORS });
  } catch (e) {
    console.error("docgen:", e);
    const message = String(e);
    const friendly = message.includes("customer_not_found")
      ? "ما لكيت زبون بهذا الاسم أو الرقم."
      : message.includes("invoice_not_found")
      ? "ما لكيت فاتورة بهذا الرقم."
      : message.includes("unauthorized")
      ? "ما عندك صلاحية لهذا الطلب."
      : "صار خلل أثناء تجهيز المستند.";
    return Response.json({ ok: false, error: friendly, detail: escapeHtml(message).slice(0, 300) }, {
      status: 500,
      headers: CORS,
    });
  }
});
