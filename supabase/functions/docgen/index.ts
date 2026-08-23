// ============================================================================
// docgen — توليد مستندات المحل بصيغتَي PDF و Excel وإرسالها عبر تلغرام
// ----------------------------------------------------------------------------
//   POST { kind, query?, from?, to?, initData }              (من الـ Mini App)
//   POST { kind, query?, from?, to?, telegram_id, chat_id }  + x-cron-secret
//   GET  /docgen/selftest?kind=…                             (تشخيص بلا بيانات)
//
// الأنواع المدعومة:
//   مستندات مفردة: invoice · statement · repair · return
//   تقارير:        sales · debts · shortages · expenses · returns · repairs
//                  payments · inventory
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildDocumentPdf } from "./pdf.ts";
import { buildSheet } from "./xlsx.ts";
import {
  type BuiltDocument,
  buildDebtsReport,
  buildExpensesReport,
  buildInventoryReport,
  buildInvoice,
  buildPaymentsReport,
  buildRepairInvoice,
  buildRepairsReport,
  buildReturnInvoice,
  buildReturnsReport,
  buildSalesReport,
  buildShortagesReport,
  buildStatement,
  escapeHtml,
  STORE,
} from "./documents.ts";
import { loadArabicFont } from "./font.ts";
import { SAMPLES } from "./sample.ts";

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

// --------------------------------- السجلّ ---------------------------------

type Args = Record<string, unknown>;

type KindHandler = {
  /** دالة قاعدة البيانات التي تجلب البيانات. */
  rpc: string;
  /** يبني معاملات الاستدعاء من جسم الطلب. */
  args: (telegramId: number, body: any) => Args;
  /** يحوّل ما رجع إلى مواصفة مستند. */
  build: (data: any) => BuiltDocument;
};

const asDate = (v: unknown): string | null => {
  const s = String(v ?? "").trim().replace(/\//g, "-");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const query = (body: any) => String(body.query ?? body.q ?? "").trim();

/** التقارير كلها تشترك في نفس شكل المعاملات. */
const listArgs = (telegramId: number, body: any): Args => ({
  p_telegram_id: telegramId,
  p_query: query(body),
});

const rangeArgs = (telegramId: number, body: any): Args => ({
  ...listArgs(telegramId, body),
  p_from: asDate(body.from),
  p_to: asDate(body.to),
});

const KINDS: Record<string, KindHandler> = {
  invoice: {
    rpc: "doc_invoice",
    args: (id, body) => ({ p_telegram_id: id, p_invoice_number: query(body) }),
    build: buildInvoice,
  },
  statement: {
    rpc: "doc_customer_statement",
    args: (id, body) => ({ p_telegram_id: id, p_customer_query: query(body) }),
    build: buildStatement,
  },
  repair: {
    rpc: "doc_repair",
    args: (id, body) => ({ p_telegram_id: id, p_ticket: query(body) }),
    build: buildRepairInvoice,
  },
  return: {
    rpc: "doc_return",
    args: (id, body) => ({ p_telegram_id: id, p_number: query(body) }),
    build: buildReturnInvoice,
  },
  sales: { rpc: "doc_sales", args: rangeArgs, build: buildSalesReport },
  returns: { rpc: "doc_returns", args: rangeArgs, build: buildReturnsReport },
  debts: { rpc: "doc_debts", args: listArgs, build: buildDebtsReport },
  shortages: { rpc: "doc_shortages", args: listArgs, build: buildShortagesReport },
  expenses: { rpc: "doc_expenses", args: listArgs, build: buildExpensesReport },
  repairs: { rpc: "doc_repairs", args: listArgs, build: buildRepairsReport },
  payments: { rpc: "doc_debt_payments", args: listArgs, build: buildPaymentsReport },
  inventory: { rpc: "doc_inventory", args: listArgs, build: buildInventoryReport },
};

/** نفس المُنشئات لكن على النماذج الثابتة — يستعملها الاختبار الذاتي. */
const SAMPLE_BUILDERS: Record<string, (data: any) => BuiltDocument> = Object.fromEntries(
  Object.entries(KINDS).map(([kind, handler]) => [kind, handler.build]),
);

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

const NOT_FOUND: Record<string, string> = {
  customer_not_found: "ما لكيت زبون بهذا الاسم أو الرقم.",
  invoice_not_found: "ما لكيت فاتورة بهذا الرقم.",
  repair_not_found: "ما لكيت تذكرة صيانة بهذا الرقم.",
  return_not_found: "ما لكيت عملية استرجاع بهذا الرقم.",
  unauthorized: "ما عندك صلاحية لهذا الطلب.",
};

// --------------------------------- الخادم ---------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);

  // مسار تشخيصي: يرسم مستنداً بنموذج ثابت — لا يلمس أي بيانات حقيقية.
  if (req.method === "GET" && url.pathname.endsWith("/selftest")) {
    try {
      const kind = url.searchParams.get("kind") ?? "invoice";
      if (url.searchParams.get("format") === "json") {
        const font = await loadArabicFont(400);
        const sizes: Record<string, number> = {};
        for (const [name, sample] of Object.entries(SAMPLES)) {
          const built = SAMPLE_BUILDERS[name](sample);
          sizes[name] = (await buildDocumentPdf(built.pdf, STORE)).length;
        }
        return Response.json({
          ok: true,
          kinds: Object.keys(KINDS),
          font: { family: font.family, weight: font.weight, bytes: font.bytes.length, format: "truetype" },
          pdf_bytes: sizes,
          engine: "pdf-lib + fontkit (GSUB shaping) + bidi-js (UAX#9)",
        }, { headers: CORS });
      }

      const sample = SAMPLES[kind];
      if (!sample) {
        return Response.json({ ok: false, error: "unknown_kind", kinds: Object.keys(KINDS) }, {
          status: 400,
          headers: CORS,
        });
      }
      const built = SAMPLE_BUILDERS[kind](sample);
      const pdf = await buildDocumentPdf(built.pdf, STORE);
      return new Response(pdf, {
        headers: {
          ...CORS,
          "Content-Type": PDF_MIME,
          "Content-Disposition": `inline; filename="selftest-${kind}.pdf"`,
        },
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

  const kind = String(body.kind ?? "").trim();
  const handler = KINDS[kind];
  if (!handler) {
    return Response.json({ ok: false, error: "نوع مستند غير معروف.", kinds: Object.keys(KINDS) }, {
      status: 400,
      headers: CORS,
    });
  }

  try {
    const { data, error } = await db.rpc(handler.rpc, handler.args(telegramId, body));
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(data?.error ?? `${kind}_failed`);

    const built = handler.build(data);
    const [pdfBytes, xlsxBytes] = await Promise.all([
      buildDocumentPdf(built.pdf, STORE),
      buildSheet(built.sheet, STORE),
    ]);

    if (body.debug) {
      const font = await loadArabicFont(400);
      return Response.json({
        ok: true,
        kind,
        pdf_bytes: pdfBytes.length,
        xlsx_bytes: xlsxBytes.length,
        rows: built.pdf.rows.length,
        orientation: built.pdf.orientation ?? "portrait",
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

    return Response.json({ ok: true, sent: true, kind, persistence: "memory_only" }, { headers: CORS });
  } catch (e) {
    console.error("docgen:", e);
    const message = String(e);
    const key = Object.keys(NOT_FOUND).find((k) => message.includes(k));
    return Response.json({
      ok: false,
      error: key ? NOT_FOUND[key] : "صار خلل أثناء تجهيز المستند.",
      detail: escapeHtml(message).slice(0, 300),
    }, { status: 500, headers: CORS });
  }
});
