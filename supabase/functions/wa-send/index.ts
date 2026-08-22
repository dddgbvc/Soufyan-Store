// ============================================================================
// wa-send — مرسل رسائل واتساب
// ----------------------------------------------------------------------------
// يشتغل بوضعين حسب اللي متوفر بالخزنة:
//
//   cloud — WhatsApp Cloud API الرسمي: يدز الرسالة لحاله، بلا تدخل.
//   link  — ماكو مفاتيح: يدز للمالك بتلغرام رسالة بيها زر،
//           ضغطة وحدة يفتح واتساب والنص مكتوب جاهز.
//
// ينندى كل ١٠ دقائق من pg_cron عبر wa_trigger_send()، وما يشتغل
// إذا الطابور فارغ أو الوقت ضمن ساعات الهدوء.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Row = { id: string; kind: string; phone: string; name: string | null; body: string };

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
  "133010": "الحساب مو مفعّل بالكامل عند Meta",
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

/** الإرسال الآلي عبر WhatsApp Cloud API. */
async function sendCloud(cfg: any, row: Row): Promise<{ ok: boolean; reason?: string }> {
  const url = `https://graph.facebook.com/${cfg.api_version}/${cfg.phone_id}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: row.phone,
      type: "text",
      text: { preview_url: false, body: row.body },
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (res.ok && json?.messages?.length) return { ok: true };

  const code = String(json?.error?.code ?? res.status);
  const detail = json?.error?.error_user_msg ?? json?.error?.message ?? `HTTP ${res.status}`;
  return { ok: false, reason: WA_ERRORS[code] ?? `${code}: ${String(detail).slice(0, 150)}` };
}

/** الوضع نصف الآلي: رسالة تلغرام بيها زر يفتح واتساب. */
async function sendLink(tgToken: string, chatId: string, row: Row): Promise<boolean> {
  const link = waLink(row.phone, row.body);

  const text =
    `📲 <b>رسالة واتساب جاهزة</b>\n` +
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

  // إعدادات تلغرام (للمصادقة والوضع نصف الآلي)
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
    console.log("paused:", batch.reason);
    return Response.json({ ok: true, paused: true, reason: batch.reason });
  }

  const rows: Row[] = batch?.rows ?? [];
  if (!rows.length) return Response.json({ ok: true, sent: 0, note: "الطابور فارغ" });

  // بالوضع نصف الآلي نراسل المالك الأول بس — حتى ما يدزها اثنين للزبون
  const owner = String(tg.chat_ids ?? "").split(",").map((s: string) => s.trim())
    .filter(Boolean)[0];

  let sent = 0, failed = 0;

  for (const row of rows) {
    try {
      if (wa.mode === "cloud") {
        const r = await sendCloud(wa, row);
        if (r.ok) {
          await db.rpc("wa_mark", { p_id: row.id, p_status: "sent", p_provider: "cloud" });
          sent++;
        } else {
          await db.rpc("wa_mark", {
            p_id: row.id, p_status: "failed", p_provider: "cloud", p_reason: r.reason,
          });
          failed++;
          console.error("cloud send failed:", row.id, r.reason);
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

  return Response.json({ ok: true, mode: wa.mode, sent, failed, total: rows.length });
});
