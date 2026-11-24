// ============================================================================
// wa-send — مرسل رسائل واتساب
// ----------------------------------------------------------------------------
// يشتغل بوضعين حسب اللي متوفر بالخزنة:
//
//   cloud — WhatsApp Cloud API الرسمي: يدز الرسالة لحاله، بلا تدخل.
//           جوّا نافذة الـ٢٤ ساعة يدز نص حر (أرخص وأمرن)،
//           وبرّاها يدز قالباً معتمداً — لأن Meta ما تسمح بغيره.
//           رسالة الشكر تنبنيلها فاتورة PDF وتنرفق بترويسة القالب.
//
//   link  — ماكو مفاتيح: يدز للمالك بتلغرام رسالة بيها زر،
//           ضغطة وحدة يفتح واتساب والنص مكتوب جاهز.
//
// ينندى كل ١٠ دقائق من pg_cron عبر wa_trigger_send()، وما يشتغل
// إذا الطابور فارغ أو الوقت ضمن ساعات الهدوء.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// وحدات docgen مثبّتة على نفس الـcommit اللي كانت تنحل منه بالنشر السابق،
// حتى يبقى مولّد المستندات حرفياً هو نفسه ولا يتغير شي غير الرابط الموقّع.
import { buildDocumentPdf } from "https://raw.githubusercontent.com/dddgbvc/Soufyan-Store/31eb94d3184a85137a9a73caadf572235085530e/supabase/functions/docgen/pdf.ts";
import { buildInvoice, STORE } from "https://raw.githubusercontent.com/dddgbvc/Soufyan-Store/31eb94d3184a85137a9a73caadf572235085530e/supabase/functions/docgen/documents.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const BUCKET = "invoices";
const TELEGRAM_ID = 8137310456; // هوية القراءة المستعملة مع doc_invoice

// عمر الرابط الموقّع. Meta تجلب الملف أثناء نداء الإرسال نفسه — ثوانٍ —
// فالساعة هامش واسع يغطي إعادة المحاولة، ويبقى منتهياً بعدها.
const SIGNED_URL_TTL = 3600;

type Row = {
  id: string;
  kind: string;
  phone: string;
  name: string | null;
  body: string;
  template_name: string | null;
  template_params: string[];
  window_open: boolean;
  invoice_number: string | null;
};

const KIND_LABEL: Record<string, string> = {
  welcome: "شكر بعد الشراء",
  payment: "تأكيد تسديد",
  debt: "تذكير دين",
};

/** أخطاء Meta الشائعة بصيغة يفهمها صاحب المحل. */
const WA_ERRORS: Record<string, string> = {
  "131047": "خارج نافذة الـ٢٤ ساعة — يحتاج قالب موافق عليه من Meta",
  "131026": "الرقم مو مسجّل بواتساب",
  "131051": "نوع الرسالة مو مدعوم",
  "132000": "عدد معاملات القالب ما يطابق المعتمد",
  "132001": "القالب مو موجود أو مو معتمد بهذي اللغة",
  "132015": "القالب متوقف عند Meta",
  "133010": "الرقم مو مسجّل على الـCloud API — نفّذ خطوة register",
  "190": "التوكن منتهي — جدّده بالخزنة",
};

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * رابط واتساب بالنص جاهز.
 * النص العربي يتضخم ٥ أضعاف وقت الترميز (قوالبنا تطلع ٤٣٠–١٠١٥ حرف).
 * إذا أحد طوّل القالب وعدّى الحد، نرجع رابط بلا نص ونخلي النص
 * قابل للنسخ بالرسالة بدله.
 */
function waLink(phone: string, body: string): { url: string; withText: boolean } {
  const full = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
  return full.length <= 1900
    ? { url: full, withText: true }
    : { url: `https://wa.me/${phone}`, withText: false };
}

async function tgSend(token: string, chatId: string, text: string, keyboard?: unknown) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (keyboard) payload.reply_markup = keyboard;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) console.error("tgSend failed:", JSON.stringify(json).slice(0, 300));
  return !!json.ok;
}

/**
 * يبني فاتورة PDF ويرفعها ويرجّع رابطاً موقّعاً قصير العمر.
 * يُستعمل لترويسة قالب الشكر — Meta تحتاج رابطاً تكدر تنزّل منه.
 *
 * كان يستعمل getPublicUrl على مخزن عام، فرابط فاتورة الزبون يبقى مفتوحاً
 * للأبد لأي واحد يحصل عليه. الرابط الموقّع ينتهي بساعة والمخزن صار خاصاً.
 */
async function invoicePdfLink(row: Row): Promise<string | null> {
  if (!row.invoice_number) return null;
  try {
    const { data: doc, error } = await db.rpc("doc_invoice", {
      p_telegram_id: TELEGRAM_ID,
      p_invoice_number: row.invoice_number,
    });
    if (error || !doc?.ok) {
      console.error("doc_invoice:", error?.message ?? doc?.error);
      return null;
    }

    const pdf = await buildDocumentPdf(buildInvoice(doc).pdf, STORE);
    const path = `auto/${row.invoice_number}-${Date.now()}.pdf`;

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) {
      console.error("storage.upload:", upErr.message);
      return null;
    }

    const { data: signed, error: signErr } = await db.storage
      .from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    if (signErr || !signed?.signedUrl) {
      console.error("createSignedUrl:", signErr?.message ?? "ماكو رابط");
      return null;
    }

    await db.rpc("wa_set_media_url", { p_id: row.id, p_url: signed.signedUrl });
    return signed.signedUrl;
  } catch (e) {
    console.error("invoicePdfLink:", String(e));
    return null;
  }
}

/** يبني جسم الطلب: نص حر جوّا النافذة، وقالب برّاها. */
async function buildPayload(row: Row): Promise<Record<string, unknown>> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: row.phone };

  // جوّا النافذة النص الحر مسموح — أوضح وأرخص، وما يحتاج اعتماد
  if (row.window_open || !row.template_name) {
    return { ...base, type: "text", text: { preview_url: false, body: row.body } };
  }

  const components: unknown[] = [];

  // ترويسة المستند لرسالة الشكر: الفاتورة تنرفق بنفس الرسالة
  if (row.kind === "welcome") {
    const link = await invoicePdfLink(row);
    if (link) {
      components.push({
        type: "header",
        parameters: [{
          type: "document",
          document: { link, filename: "فاتورة_الشراء.pdf" },
        }],
      });
    }
  }

  if (row.template_params?.length) {
    components.push({
      type: "body",
      parameters: row.template_params.map((v) => ({ type: "text", text: String(v) })),
    });
  }

  return {
    ...base,
    type: "template",
    template: {
      name: row.template_name,
      language: { code: "ar" },
      ...(components.length ? { components } : {}),
    },
  };
}

/** الإرسال الآلي عبر WhatsApp Cloud API. */
async function sendCloud(
  cfg: any,
  row: Row,
): Promise<{ ok: boolean; reason?: string; wamid?: string; via: string }> {
  const payload = await buildPayload(row);
  const via = payload.type === "template"
    ? `قالب ${row.template_name}`
    : "نص حر (النافذة مفتوحة)";
  console.log(`  ${row.id} → ${via}`);

  const res = await fetch(`https://graph.facebook.com/${cfg.api_version}/${cfg.phone_id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (res.ok && json?.messages?.length) {
    return { ok: true, wamid: json.messages[0]?.id, via };
  }

  const code = String(json?.error?.code ?? res.status);
  const detail = json?.error?.error_user_msg ?? json?.error?.message ?? `HTTP ${res.status}`;
  console.error(`  ⇢ فشل ${code}:`, JSON.stringify(json).slice(0, 300));
  return { ok: false, reason: WA_ERRORS[code] ?? `${code}: ${String(detail).slice(0, 150)}`, via };
}

/** الوضع نصف الآلي: رسالة تلغرام بيها زر يفتح واتساب. */
async function sendLink(tgToken: string, chatId: string, row: Row): Promise<boolean> {
  const link = waLink(row.phone, row.body);

  const text = `📲 <b>رسالة واتساب جاهزة</b>\n` +
    `النوع: ${KIND_LABEL[row.kind] ?? row.kind}\n` +
    `الزبون: <b>${esc(row.name ?? "—")}</b> — <code>${row.phone}</code>\n` +
    `────────────\n` +
    (link.withText ? `${esc(row.body)}\n` : `<code>${esc(row.body)}</code>\n`) +
    `────────────\n` +
    (link.withText
      ? `اضغط الزر ويفتح واتساب والرسالة مكتوبة — بس دزها.`
      : `⚠️ النص طويل فما انحط بالرابط. اضغط على النص أعلاه حتى ينتسخ، ` +
        `وبعدين افتح واتساب والصقه.`);

  return await tgSend(tgToken, chatId, text, {
    inline_keyboard: [[{ text: "📲 افتح واتساب", url: link.url }]],
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const { data: tgData, error: tgErr } = await db.rpc("tg_config");
  if (tgErr) {
    console.error("tg_config:", tgErr.message);
    return new Response(JSON.stringify({ ok: false, error: "config" }), { status: 500 });
  }
  const tg = Array.isArray(tgData) ? tgData[0] : tgData;

  if (!tg?.webhook_secret || req.headers.get("x-cron-secret") !== tg.webhook_secret) {
    return new Response("forbidden", { status: 403 });
  }

  const { data: waData, error: waErr } = await db.rpc("wa_config");
  if (waErr) {
    console.error("wa_config:", waErr.message);
    return new Response(JSON.stringify({ ok: false, error: "wa_config" }), { status: 500 });
  }
  const wa = Array.isArray(waData) ? waData[0] : waData;

  const { data: batch, error: batchErr } = await db.rpc("wa_next_batch", { p_limit: null });
  if (batchErr) {
    console.error("wa_next_batch:", batchErr.message);
    return new Response(JSON.stringify({ ok: false, error: "batch" }), { status: 500 });
  }

  if (batch?.paused) {
    console.log("متوقف:", batch.reason);
    return Response.json({ ok: true, paused: true, reason: batch.reason });
  }

  const rows: Row[] = batch?.rows ?? [];
  if (!rows.length) return Response.json({ ok: true, sent: 0, note: "الطابور فارغ" });

  // بالوضع نصف الآلي نراسل المالك الأول بس — حتى ما يدزها اثنين للزبون
  const owner = String(tg.chat_ids ?? "").split(",").map((s: string) => s.trim())
    .filter(Boolean)[0];

  let sent = 0, failed = 0;
  const detail: unknown[] = [];

  for (const row of rows) {
    try {
      if (wa.mode === "cloud") {
        const r = await sendCloud(wa, row);
        if (r.ok) {
          await db.rpc("wa_mark", { p_id: row.id, p_status: "sent", p_provider: "cloud" });
          if (r.wamid) {
            // RPC مو update مباشر — الجداول بلا GRANT عمداً
            const { error } = await db.rpc("wa_set_wamid", { p_id: row.id, p_wamid: r.wamid });
            if (error) console.error("wa_set_wamid فشل:", error.message);
          }
          sent++;
          detail.push({ id: row.id, ok: true, via: r.via, wamid: r.wamid });
        } else {
          await db.rpc("wa_mark", {
            p_id: row.id, p_status: "failed", p_provider: "cloud", p_reason: r.reason,
          });
          failed++;
          detail.push({ id: row.id, ok: false, via: r.via, reason: r.reason });
        }
      } else {
        if (!owner) {
          await db.rpc("wa_mark", {
            p_id: row.id, p_status: "failed", p_provider: "link",
            p_reason: "ماكو chat_id مضبوط بالخزنة",
          });
          failed++;
          continue;
        }
        const ok = await sendLink(tg.bot_token, owner, row);
        await db.rpc("wa_mark", {
          p_id: row.id,
          p_status: ok ? "linked" : "failed",
          p_provider: "link",
          p_reason: ok ? null : "تعذّر إرسال الرابط بتلغرام",
        });
        ok ? sent++ : failed++;
        detail.push({ id: row.id, ok, via: "رابط تلغرام" });
      }
    } catch (e) {
      console.error("send error:", row.id, String(e));
      await db.rpc("wa_mark", {
        p_id: row.id, p_status: "failed", p_provider: wa.mode,
        p_reason: String(e).slice(0, 150),
      });
      failed++;
    }
  }

  return Response.json({ ok: true, mode: wa.mode, sent, failed, total: rows.length, detail });
});
