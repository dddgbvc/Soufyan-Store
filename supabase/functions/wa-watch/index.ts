// ============================================================================
// wa-watch — يراقب اعتماد القوالب ويدز الفاتورة التجريبية أول ما تنعتمد
// ----------------------------------------------------------------------------
// القوالب تحت مراجعة Meta، والنافذة ما تنفتح لأن رقم المحل انتقل للـCloud API
// وما عاد يستقبل بواتساب العادي. فبدل ما ينطر صاحب المحل ويسأل كل شوية،
// هذي تنندى كل ١٥ دقيقة وتتحقق:
//
//   invoice_thanks معتمد؟  → تبني الفاتورة PDF، تدزها بالقالب،
//                             تبلّغ المالك بتلغرام، وتطفي نفسها.
//   لسه PENDING؟           → ما تسوي شي وتنطر الدورة الجاية.
//
// تنطفي بعد أول إرسال ناجح (علامة بـbot_settings) حتى ما تتكرر.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// وحدات docgen مثبّتة على نفس الـcommit اللي كانت تنحل منه بالنشر السابق.
import { buildDocumentPdf } from "https://raw.githubusercontent.com/dddgbvc/Soufyan-Store/d2f9a70ff2329df1042eaf5bff3ef5bc3facc89f/supabase/functions/docgen/pdf.ts";
import { buildInvoice, STORE } from "https://raw.githubusercontent.com/dddgbvc/Soufyan-Store/d2f9a70ff2329df1042eaf5bff3ef5bc3facc89f/supabase/functions/docgen/documents.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const WABA_ID = "2247344652770831";
const PHONE_ID = "1212588625278533";
const API = "https://graph.facebook.com/v21.0";
const BUCKET = "invoices";

// عمر الرابط الموقّع — Meta تجلب الملف أثناء نداء الإرسال نفسه.
const SIGNED_URL_TTL = 3600;

const TARGET = "9647718740999";
const INVOICE = "DEMO-WA-001";
const TEMPLATE = "invoice_thanks";

async function tgNotify(text: string) {
  try {
    const { data } = await db.rpc("tg_config");
    const tg = Array.isArray(data) ? data[0] : data;
    const chat = String(tg?.chat_ids ?? "").split(",").map((s: string) => s.trim())
      .filter(Boolean)[0];
    if (!tg?.bot_token || !chat) return;
    await fetch(`https://api.telegram.org/bot${tg.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("tgNotify:", String(e));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const { data: tgData } = await db.rpc("tg_config");
  const tg = Array.isArray(tgData) ? tgData[0] : tgData;
  if (!tg?.webhook_secret || req.headers.get("x-cron-secret") !== tg.webhook_secret) {
    return new Response("forbidden", { status: 403 });
  }

  const { data: settings } = await db.rpc("bot_get_settings");
  if (settings?.wa_watch?.done === true) {
    return Response.json({ ok: true, note: "خلصت شغلها سابقاً" });
  }

  const { data: waData } = await db.rpc("wa_config");
  const wa = Array.isArray(waData) ? waData[0] : waData;
  if (!wa?.token) return Response.json({ ok: false, error: "ماكو توكن" }, { status: 424 });

  try {
    // ------------------------------------------------ حالة الاعتماد
    const res = await fetch(
      `${API}/${WABA_ID}/message_templates?fields=name,status,rejected_reason&limit=25`,
      { headers: { Authorization: `Bearer ${wa.token}` } },
    );
    const list = await res.json();
    const tpl = (list?.data ?? []).find((t: any) => t.name === TEMPLATE);

    if (!tpl) return Response.json({ ok: false, error: "القالب مو موجود" }, { status: 404 });

    if (tpl.status === "REJECTED") {
      await tgNotify(
        `❌ <b>Meta رفضت القالب</b>\nالقالب: <code>${TEMPLATE}</code>\n` +
        `السبب: ${tpl.rejected_reason ?? "غير مذكور"}`,
      );
      await db.rpc("wa_watch_done");
      return Response.json({ ok: false, status: tpl.status, reason: tpl.rejected_reason });
    }

    if (tpl.status !== "APPROVED") {
      console.log(`${TEMPLATE} لسه ${tpl.status} — ننطر`);
      return Response.json({ ok: true, status: tpl.status, note: "لسه بالمراجعة" });
    }

    console.log(`✅ ${TEMPLATE} انعتمد — نبني الفاتورة وندزها`);

    // ------------------------------------------------ الفاتورة PDF
    const { data: doc, error: docErr } = await db.rpc("doc_invoice", {
      p_telegram_id: 8137310456,
      p_invoice_number: INVOICE,
    });
    if (docErr || !doc?.ok) throw new Error("doc_invoice: " + (docErr?.message ?? doc?.error));

    const pdf = await buildDocumentPdf(buildInvoice(doc).pdf, STORE);
    const path = `auto/${INVOICE}-${Date.now()}.pdf`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) throw new Error("storage.upload: " + upErr.message);

    // رابط موقّع قصير العمر بدل getPublicUrl — المخزن صار خاصاً فما يبقى
    // رابط فاتورة الزبون مفتوحاً للأبد.
    const { data: signed, error: signErr } = await db.storage
      .from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    if (signErr || !signed?.signedUrl) {
      throw new Error("createSignedUrl: " + (signErr?.message ?? "ماكو رابط"));
    }
    console.log("  الرابط الموقّع جاهز (ينتهي بعد", SIGNED_URL_TTL, "ثانية)");

    // ------------------------------------------------ الإرسال بالقالب
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: TARGET,
      type: "template",
      template: {
        name: TEMPLATE,
        language: { code: "ar" },
        components: [
          {
            type: "header",
            parameters: [{
              type: "document",
              document: { link: signed.signedUrl, filename: "فاتورة_الشراء.pdf" },
            }],
          },
          {
            type: "body",
            parameters: [
              { type: "text", text: doc.invoice?.customer_name ?? "عزيزنا" },
              { type: "text", text: INVOICE },
              { type: "text", text: String(doc.invoice?.total ?? 0) },
            ],
          },
        ],
      },
    };

    const send = await fetch(`${API}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${wa.token}` },
      body: JSON.stringify(payload),
    });
    const apiResponse = await send.json().catch(() => ({}));
    console.log("  ⇢ HTTP", send.status, JSON.stringify(apiResponse));

    const wamid = apiResponse?.messages?.[0]?.id ?? null;

    if (send.ok && wamid) {
      await db.rpc("wa_record_sent", {
        p_kind: "welcome",
        p_customer_name: doc.invoice?.customer_name ?? null,
        p_phone: TARGET,
        p_body: `[قالب ${TEMPLATE}] فاتورة ${INVOICE}`,
        p_provider_msg_id: wamid,
        p_ref_table: "invoices",
      });
      await db.rpc("wa_watch_done");
      await tgNotify(
        `✅ <b>القوالب انعتمدت والفاتورة انرسلت</b>\n` +
        `الرقم: <code>${TARGET}</code>\n` +
        `القالب: <code>${TEMPLATE}</code>\n` +
        `افحص واتساب — لازم توصلك الرسالة ومعاها فاتورة_الشراء.pdf`,
      );
      return Response.json({ ok: true, sent: true, wamid, api_response: apiResponse });
    }

    // فشل الإرسال رغم الاعتماد — نبلّغ ونضل نحاول
    const err = apiResponse?.error?.message ?? `HTTP ${send.status}`;
    console.error("  فشل الإرسال:", err);
    await tgNotify(`⚠️ القالب انعتمد بس الإرسال فشل:\n<code>${err}</code>`);
    return Response.json({ ok: false, api_response: apiResponse }, { status: 502 });
  } catch (e) {
    console.error("wa-watch:", String(e));
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
