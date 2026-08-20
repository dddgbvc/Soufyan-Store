// ============================================================================
// miniapp — واجهة الـ Telegram Mini App
//   POST /miniapp        سؤال للمساعد الذكي
//   POST /miniapp/data   لقطة البيانات للواجهة
//   POST /miniapp/health تشخيص: أي مزوّد ونموذج مفعّل الآن
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { runAgent, type SqlOutcome } from "./agent.ts";
import { resolve, type Msg } from "./llm.ts";
import { baghdadNow, liveContext, systemPrompt } from "./prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ------------------------------ مصادقة تلغرام ------------------------------

async function hmac(key: BufferSource, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function telegramUser(initData: string, botToken: string): Promise<any | null> {
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
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

async function authenticate(body: any, cfg: any) {
  const user = await telegramUser(String(body.initData ?? body.init_data ?? ""), cfg.bot_token);
  if (!user) throw httpError("unauthorized", 401);
  const { data: identity } = await db.rpc("bot_identify", { p_telegram_id: user.id });
  if (!identity?.can_read) throw httpError("forbidden", 403);
  return { user, identity };
}

// -------------------------------- تحويل السجل --------------------------------

const MAX_HISTORY_TURNS = 16;

function toMessages(history: unknown): Msg[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m: any) => m && typeof m.content === "string" && ["user", "assistant"].includes(m.role))
    .slice(-MAX_HISTORY_TURNS)
    .map((m: any) =>
      m.role === "user"
        ? { role: "user" as const, text: m.content.slice(0, 4000) }
        : { role: "assistant" as const, text: m.content.slice(0, 4000) }
    );
}

// --------------------------------- الخادم ---------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("not found", { status: 404, headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const cfg = await config();
    if (!cfg?.bot_token) throw new Error("bot not configured");

    const { user, identity } = await authenticate(body, cfg);
    const path = new URL(req.url).pathname;

    if (path.endsWith("/data")) {
      const { data, error } = await db.rpc("miniapp_snapshot", { p_telegram_id: user.id });
      if (error) throw error;
      return Response.json(data, { headers: CORS });
    }

    if (path.endsWith("/health")) {
      const target = resolve({ provider: cfg.ai_provider, key: cfg.ai_key, baseUrl: cfg.ai_base_url, model: cfg.ai_model });
      return Response.json({
        ok: true,
        provider: target.provider,
        model: target.model,
        has_key: !!cfg.ai_key,
        now: baghdadNow(),
        engine: "tool-calling agent · حتى 4 استعلامات لكل سؤال",
      }, { headers: CORS });
    }

    const question = String(body.q ?? body.message ?? body.text ?? "").trim().slice(0, 3000);
    if (!question) return Response.json({ ok: false, error: "empty" }, { headers: CORS });
    if (!cfg.ai_key) {
      return Response.json({ ok: false, error: "مفتاح الذكاء الاصطناعي مو مضبوط بالخزنة." }, {
        status: 503,
        headers: CORS,
      });
    }

    // لقطة حيّة تُحقن في التعليمات: تجعل الأسئلة العامة تُجاب فوراً وبأرقام صحيحة.
    const { data: snapshot } = await db.rpc("miniapp_snapshot", { p_telegram_id: user.id });

    const system = systemPrompt(
      {
        name: identity.employee_name ?? identity.label ?? "المستخدم",
        role: identity.employee_role ?? "CASHIER",
        canWrite: !!identity.can_write,
      },
      liveContext(snapshot),
      baghdadNow(),
    );

    const runSql = async (sql: string): Promise<SqlOutcome> => {
      const { data, error } = await db.rpc("ai_query", { p_sql: sql });
      if (error) return { error: error.message };
      return { rows: Array.isArray(data) ? data : [] };
    };

    const result = await runAgent(
      { provider: cfg.ai_provider, key: cfg.ai_key, baseUrl: cfg.ai_base_url, model: cfg.ai_model },
      system,
      toMessages(body.history),
      question,
      runSql,
    );

    const payload: Record<string, unknown> = {
      ok: true,
      answer: result.answer,
      mode: result.mode,
      rows: result.rows,
    };
    if (body.debug) {
      payload.steps = result.steps;
      payload.tool_mode = result.toolMode;
    }
    return Response.json(payload, { headers: CORS });
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    console.error("miniapp:", e);
    const friendly = status === 401
      ? "الجلسة غير موثّقة."
      : status === 403
      ? "ما عندك صلاحية."
      : "صار خلل بالمساعد — جرّب مرة ثانية بعد شوية.";
    return Response.json({ ok: false, error: friendly, detail: String(e).slice(0, 300) }, {
      status,
      headers: CORS,
    });
  }
});
