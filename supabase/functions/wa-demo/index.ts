// ============================================================================
// wa-demo — سيناريو تجريبي متكامل: Supabase ← PDF ← Storage ← WhatsApp Cloud API
// ----------------------------------------------------------------------------
// خطوات التنفيذ:
//   ١) يجيب بيانات الفاتورة من قاعدة البيانات عبر doc_invoice
//   ٢) يبني فاتورة PDF عربية بمولّد docgen الموجود بالمشروع
//   ٣) يرفعها لـSupabase Storage (مخزن عام) ويطلع رابط مباشر
//   ٤) يدزها لواتساب كـdocument مع نص الرسالة بالـcaption
//   ٥) يطبع كل خطوة بالسجلات ويرجّع استجابة Meta كاملة
//
// التوكن: WHATSAPP_ACCESS_TOKEN من متغيرات البيئة (Supabase Secrets)،
//         وإذا مو موجود يجرب سرّ whatsapp_token بالخزنة.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildDocumentPdf } from "../docgen/pdf.ts";
import { buildInvoice, STORE } from "../docgen/documents.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const PHONE_NUMBER_ID = "1212588625278533";
const API_VERSION = "v21.0";
const BUCKET = "invoices";

const DEFAULTS = {
  invoice: "DEMO-WA-001",
  to: "9647718740999",
  telegram_id: 8137310456,
  filename: "فاتورة_الشراء.pdf",
  caption:
    "أهلاً بك أستاذ أنس، شكراً لتعاملك معنا. تم تجهيز طلبك بنجاح ومرفق معه ملف الفاتورة والتفاصيل.",
};

/** التوكن: متغير البيئة أولاً، وبعدين الخزنة. */
async function accessToken(): Promise<{ token: string | null; source: string }> {
  const fromEnv = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  if (fromEnv) return { token: fromEnv, source: "env:WHATSAPP_ACCESS_TOKEN" };

  const { data } = await db.rpc("wa_config");
  const cfg = Array.isArray(data) ? data[0] : data;
  if (cfg?.token) return { token: cfg.token, source: "vault:whatsapp_token" };

  return { token: null, source: "—" };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // مصادقة بنفس سرّ الكرون المستعمل بباقي الدوال
  const { data: tgData } = await db.rpc("tg_config");
  const tg = Array.isArray(tgData) ? tgData[0] : tgData;
  if (!tg?.webhook_secret || req.headers.get("x-cron-secret") !== tg.webhook_secret) {
    return new Response("forbidden", { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const invoiceNumber = String(body.invoice ?? DEFAULTS.invoice);
  const to = String(body.to ?? DEFAULTS.to);
  const caption = String(body.caption ?? DEFAULTS.caption);
  const filename = String(body.filename ?? DEFAULTS.filename);
  const dryRun = body.dry_run === true;

  const log: string[] = [];
  const step = (msg: string) => { console.log(msg); log.push(msg); };

  try {
    // ------------------------------------------------ ١) البيانات
    step(`[1/5] جلب الفاتورة ${invoiceNumber} من قاعدة البيانات…`);
    const { data: doc, error: docErr } = await db.rpc("doc_invoice", {
      p_telegram_id: Number(body.telegram_id ?? DEFAULTS.telegram_id),
      p_invoice_number: invoiceNumber,
    });
    if (docErr) throw new Error("doc_invoice: " + docErr.message);
    if (!doc?.ok) throw new Error("doc_invoice: " + (doc?.error ?? "فشل غير معروف"));

    const items = doc.items ?? [];
    step(`      ✓ الزبون: ${doc.invoice?.customer_name} · ${items.length} مواد · ` +
         `الإجمالي ${doc.invoice?.total} د.ع`);

    // ------------------------------------------------ ٢) الـPDF
    step("[2/5] بناء فاتورة PDF عربية…");
    const built = buildInvoice(doc);
    const pdf = await buildDocumentPdf(built.pdf, STORE);
    step(`      ✓ الحجم ${(pdf.byteLength / 1024).toFixed(1)} KB`);

    // ------------------------------------------------ ٣) الرفع
    // مسار لاتيني حتى الرابط ما يحتاج ترميز؛ الاسم العربي ينحط بحقل
    // filename اللي يعرضه واتساب للزبون.
    const path = `demo/${invoiceNumber}-${Date.now()}.pdf`;
    step(`[3/5] رفع الملف لـStorage: ${BUCKET}/${path}`);
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) throw new Error("storage.upload: " + upErr.message);

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
    const link = pub.publicUrl;
    step(`      ✓ الرابط: ${link}`);

    // تأكيد إن الرابط فعلاً يفتح من برّه — واتساب لازم يوصله
    const head = await fetch(link, { method: "HEAD" });
    step(`      ✓ فحص الرابط: HTTP ${head.status} · ` +
         `${head.headers.get("content-type")} · ${head.headers.get("content-length")} بايت`);
    if (!head.ok) throw new Error(`الرابط مو متاح للعامة (HTTP ${head.status})`);

    // ------------------------------------------------ ٤) الإرسال
    const { token, source } = await accessToken();
    step(`[4/5] التوكن: ${token ? `موجود (${source})` : "❌ مو موجود"}`);

    if (!token) {
      step("      ⛔ ما ينكدر يندز بدون WHATSAPP_ACCESS_TOKEN.");
      return Response.json({
        ok: false,
        stage: "missing_token",
        error: "WHATSAPP_ACCESS_TOKEN مو مضبوط لا بمتغيرات البيئة ولا بالخزنة",
        pdf_url: link,
        invoice: { number: invoiceNumber, total: doc.invoice?.total, items: items.length },
        log,
      }, { status: 424 });
    }

    if (dryRun) {
      step("      (تجربة جافة — ما اندز شي لواتساب)");
      return Response.json({ ok: true, dry_run: true, pdf_url: link, log });
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "document",
      document: { link, filename, caption },
    };
    step(`[5/5] إرسال لواتساب — الرقم ${to} عبر Phone Number ID ${PHONE_NUMBER_ID}`);
    console.log("      payload:", JSON.stringify(payload));

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      },
    );
    const apiResponse = await res.json().catch(() => ({}));

    console.log("      ⇢ HTTP", res.status);
    console.log("      ⇢ استجابة Meta:", JSON.stringify(apiResponse, null, 2));

    const wamid = apiResponse?.messages?.[0]?.id ?? null;
    if (res.ok && wamid) {
      step(`      ✅ انرسلت — معرّف الرسالة ${wamid}`);
      // نسجلها بالطابور حتى الويبهوك يربط بيها تقارير التسليم
      await db.from("wa_messages").insert({
        kind: "welcome",
        customer_id: doc.invoice?.customer_id ?? null,
        customer_name: doc.invoice?.customer_name,
        phone_raw: to,
        phone: to,
        body: caption,
        status: "sent",
        provider: "cloud",
        provider_msg_id: wamid,
        ref_table: "invoices",
        sent_at: new Date().toISOString(),
      });
    } else {
      step(`      ❌ فشل — ${apiResponse?.error?.message ?? `HTTP ${res.status}`}`);
    }

    return Response.json({
      ok: res.ok && !!wamid,
      http_status: res.status,
      wamid,
      api_response: apiResponse,
      pdf_url: link,
      invoice: {
        number: invoiceNumber,
        customer: doc.invoice?.customer_name,
        total: doc.invoice?.total,
        items: items.map((x: any) => ({ name: x.name, qty: x.qty, price: x.unit_price, total: x.total })),
      },
      log,
    }, { status: res.ok ? 200 : 502 });
  } catch (e) {
    console.error("wa-demo فشل:", String(e));
    return Response.json({ ok: false, error: String(e), log }, { status: 500 });
  }
});
