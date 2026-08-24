// ============================================================================
// wa-templates — إنشاء قوالب واتساب المعتمدة
// ----------------------------------------------------------------------------
// برّا نافذة الـ٢٤ ساعة، Meta ما تسمح إلا بقوالب موافق عليها. وزبائن المحل
// ما راح يراسلونا قبل ما ندزلهم فاتورة، فالقوالب هي المسار الوحيد.
//
// قالب الشكر بترويسة DOCUMENT حتى الفاتورة PDF تنرفق بنفس الرسالة.
// ترويسة الوسائط تحتاج «عيّنة» وقت الإنشاء (header_handle) تنرفع عبر
// Resumable Upload API — وقت الإرسال ننطي رابط عادي بدلها.
//
// POST { }              ينشئ القوالب الثلاثة
// POST { list: true }   يعرض الموجود بلا إنشاء
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildDocumentPdf } from "../docgen/pdf.ts";
import { buildInvoice, STORE } from "../docgen/documents.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const WABA_ID = "2247344652770831";
const APP_ID = "1624890292572430";
const API = "https://graph.facebook.com/v21.0";

type Tpl = {
  name: string;
  category: "UTILITY" | "MARKETING";
  body: string;
  example: string[];
  withDocument?: boolean;
};

const TEMPLATES: Tpl[] = [
  {
    name: "invoice_thanks",
    category: "UTILITY",
    withDocument: true,
    body:
      "مرحباً {{1}} 🌟\n" +
      "شكراً لتعاملك مع مكتب سفيان للموبايل.\n" +
      "فاتورتك رقم {{2}} بمبلغ {{3}} دينار، ومرفقة معها التفاصيل.",
    example: ["أنس", "INV-1042", "71,000"],
  },
  {
    name: "payment_received",
    category: "UTILITY",
    body:
      "شكراً {{1}} 🙏\n" +
      "استلمنا منك مبلغ {{2}} دينار.\n" +
      "الدين المتبقي عليك: {{3}} دينار.",
    example: ["أنس", "250,000", "500,000"],
  },
  {
    // صيغة معاملاتية بحتة — بيان رصيد بلا أي دعوة لزيارة أو شراء.
    // النسخة الأولى كانت تنتهي بـ«راجعنا بالمحل» فصنّفتها Meta MARKETING،
    // وهذا يخلي الزبون اللي موقّف الرسائل الترويجية ما يستلم تذكير دينه.
    // الاسم انتغير من debt_reminder لأن Meta ما تسمح بإعادة استعمال
    // اسم قالب لسه ينحذف — والاسم الجديد يوصف المحتوى أدق.
    // ينتهي بسطر نص لأن Meta ترفض متغيراً بنهاية القالب.
    name: "debt_statement",
    category: "UTILITY",
    body:
      "السلام عليكم {{1}}\n" +
      "كشف حساب من مكتب سفيان للموبايل:\n" +
      "الرصيد المستحق عليك {{2}} دينار.\n" +
      "آخر حركة على حسابك بتاريخ {{3}}\n" +
      "هذا كشف تلقائي من نظام المحل.",
    example: ["أنس", "450,000", "2026-08-14"],
  },
];

async function token(): Promise<string> {
  const { data } = await db.rpc("wa_config");
  const cfg = Array.isArray(data) ? data[0] : data;
  const t = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? cfg?.token;
  if (!t) throw new Error("ماكو توكن واتساب");
  return t;
}

/** يرفع عيّنة PDF ويرجّع الـhandle المطلوب لترويسة المستند. */
async function uploadSample(tok: string, bytes: Uint8Array): Promise<string> {
  const start = await fetch(
    `${API}/${APP_ID}/uploads?file_name=invoice-sample.pdf` +
      `&file_length=${bytes.byteLength}&file_type=application/pdf`,
    { method: "POST", headers: { Authorization: `Bearer ${tok}` } },
  );
  const startJson = await start.json();
  if (!startJson?.id) {
    throw new Error("فشل بدء الرفع: " + JSON.stringify(startJson).slice(0, 200));
  }
  console.log("  جلسة الرفع:", startJson.id);

  const up = await fetch(`${API}/${startJson.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${tok}`, file_offset: "0" },
    body: bytes,
  });
  const upJson = await up.json();
  if (!upJson?.h) {
    throw new Error("فشل رفع العيّنة: " + JSON.stringify(upJson).slice(0, 200));
  }
  return upJson.h as string;
}

async function createTemplate(tok: string, tpl: Tpl, handle?: string) {
  const components: unknown[] = [];

  if (tpl.withDocument && handle) {
    components.push({
      type: "HEADER",
      format: "DOCUMENT",
      example: { header_handle: [handle] },
    });
  }

  components.push({
    type: "BODY",
    text: tpl.body,
    example: { body_text: [tpl.example] },
  });

  const res = await fetch(`${API}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({
      name: tpl.name,
      language: "ar",
      category: tpl.category,
      components,
    }),
  });

  const json = await res.json().catch(() => ({}));
  console.log(`  ${tpl.name}: HTTP ${res.status} — ${JSON.stringify(json)}`);
  return { name: tpl.name, http: res.status, result: json };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const { data: tgData } = await db.rpc("tg_config");
  const tg = Array.isArray(tgData) ? tgData[0] : tgData;
  if (!tg?.webhook_secret || req.headers.get("x-cron-secret") !== tg.webhook_secret) {
    return new Response("forbidden", { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  try {
    const tok = await token();

    // عرض الموجود فقط
    const listRes = await fetch(
      `${API}/${WABA_ID}/message_templates?fields=name,status,category,language,rejected_reason&limit=50`,
      { headers: { Authorization: `Bearer ${tok}` } },
    );
    const existing = await listRes.json();

    if (body.list === true) {
      return Response.json({ ok: true, templates: existing?.data ?? [] });
    }

    const have = new Set((existing?.data ?? []).map((t: any) => t.name));

    // عيّنة PDF لترويسة المستند — نبنيها من فاتورة حقيقية
    let handle: string | undefined;
    if (TEMPLATES.some((t) => t.withDocument && !have.has(t.name))) {
      console.log("[1] بناء عيّنة PDF ورفعها…");
      const { data: doc } = await db.rpc("doc_invoice", {
        p_telegram_id: 8137310456,
        p_invoice_number: String(body.sample_invoice ?? "DEMO-WA-001"),
      });
      if (!doc?.ok) throw new Error("ما كدرت أجيب فاتورة العيّنة");
      const pdf = await buildDocumentPdf(buildInvoice(doc).pdf, STORE);
      handle = await uploadSample(tok, pdf);
      console.log("  ✓ handle:", handle.slice(0, 40) + "…");
    }

    console.log("[2] إنشاء القوالب…");
    const results = [];
    for (const tpl of TEMPLATES) {
      if (have.has(tpl.name)) {
        console.log(`  ${tpl.name}: موجود مسبقاً — تخطّي`);
        results.push({ name: tpl.name, skipped: "موجود مسبقاً" });
        continue;
      }
      results.push(await createTemplate(tok, tpl, handle));
    }

    // الحالة بعد الإنشاء
    const after = await fetch(
      `${API}/${WABA_ID}/message_templates?fields=name,status,category,language&limit=50`,
      { headers: { Authorization: `Bearer ${tok}` } },
    );
    const afterJson = await after.json();

    return Response.json({ ok: true, results, templates: afterJson?.data ?? [] });
  } catch (e) {
    console.error("wa-templates فشل:", String(e));
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
