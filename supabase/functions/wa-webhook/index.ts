// ============================================================================
// wa-webhook — نقطة استقبال واتساب (Callback URL اللي تنحط بلوحة Meta)
// ----------------------------------------------------------------------------
// GET  — فحص الملكية: Meta تدز hub.challenge مع رمز التحقق، ونرجعه إذا طابق.
// POST — حدثين:
//          statuses  تقارير التسليم (انرسلت / وصلت / انقرأت / فشلت)
//          messages  ردود الزبائن — تنسجل، وردّ الزبون يفتح نافذة ٢٤ ساعة
//                    اللي تسمح بإرسال نص حر بدل القوالب الموافق عليها.
//
// verify_jwt مطفي لأن Meta ما تدز توكن Supabase — المصادقة عبر رمز التحقق
// بالـGET، وعبر توقيع X-Hub-Signature-256 بالـPOST.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function config() {
  const { data, error } = await db.rpc("wa_webhook_config");
  if (error) throw new Error("wa_webhook_config: " + error.message);
  return Array.isArray(data) ? data[0] : data;
}

/** مقارنة بزمن ثابت — ما تفضح الرمز عبر فروقات التوقيت. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** تحقق من توقيع Meta على جسم الطلب. */
async function validSignature(secret: string, raw: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(hex, header.slice(7));
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ---------- فحص الملكية ----------
  if (req.method === "GET") {
    const cfg = await config().catch(() => null);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";

    if (!cfg?.verify_token) {
      console.error("verify: whatsapp_verify_token مو موجود بالخزنة");
      return new Response("not configured", { status: 500 });
    }
    if (mode === "subscribe" && token && safeEqual(token, cfg.verify_token)) {
      console.log("webhook verified ✅");
      return new Response(challenge, { headers: { "Content-Type": "text/plain" } });
    }
    console.warn("verify failed: رمز تحقق غلط");
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // ---------- الأحداث ----------
  const raw = await req.text();
  const cfg = await config().catch(() => null);

  // إذا سرّ التطبيق مضبوط نلزم التوقيع؛ إذا مو مضبوط نكمل وننبّه بالسجل.
  if (cfg?.app_secret) {
    const ok = await validSignature(cfg.app_secret, raw, req.headers.get("x-hub-signature-256"));
    if (!ok) {
      console.warn("توقيع غير صالح — انرفض الطلب");
      return new Response("forbidden", { status: 403 });
    }
  } else {
    console.warn("whatsapp_app_secret مو مضبوط — التوقيع ما انفحص");
  }

  let body: any = {};
  try { body = JSON.parse(raw); } catch { /* نرجع 200 حتى Meta ما تعيد المحاولة */ }

  let statuses = 0, inbound = 0;

  try {
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const v = change?.value ?? {};

        // تقارير التسليم
        for (const st of v.statuses ?? []) {
          const reason = st?.errors?.[0]?.title ?? st?.errors?.[0]?.message ?? null;
          await db.rpc("wa_mark_by_wamid", {
            p_wamid: String(st.id ?? ""),
            p_status: String(st.status ?? ""),
            p_reason: reason ? String(reason).slice(0, 200) : null,
          });
          statuses++;
        }

        // ردود الزبائن
        for (const m of v.messages ?? []) {
          const text = m?.text?.body ??
            m?.button?.text ??
            m?.interactive?.button_reply?.title ??
            `[${m?.type ?? "غير نصي"}]`;
          await db.rpc("wa_log_inbound", {
            p_wamid: String(m.id ?? ""),
            p_phone: String(m.from ?? ""),
            p_body: String(text),
            p_type: String(m?.type ?? "text"),
          });
          inbound++;
        }
      }
    }
  } catch (e) {
    console.error("webhook handling error:", String(e));
  }

  // دائماً 200 — أي خطأ يخلي Meta تعيد الإرسال وتكرر الأحداث
  return Response.json({ ok: true, statuses, inbound });
});
