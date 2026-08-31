// ============================================================================
// setup-provision — تهيئة النظام على الخادم، لا في المتصفح
// ----------------------------------------------------------------------------
// V6 كان ينفّذ "التهيئة" داخل الصفحة: يكتب في localStorage تحت soufyan.erp.*
// ويضع setup_completed = true، فيبدو الإعداد ناجحًا بلا أي حساب حقيقي.
// هذه الدالة تُنهي ذلك:
//
//   • لا تُنفَّذ مهمة إلا بجلسة Supabase Auth حقيقية (Bearer <user JWT>).
//     مفتاح anon وحده لا يكفي — وهو ما يمنع استدعاء «إنهاء الإعداد» مباشرةً.
//   • كل مهمة idempotent: المفتاح (run_key, task) فريد في قاعدة البيانات،
//     فإعادة الإرسال بعد انقطاع الشبكة تُعيد النتيجة الأولى ولا تُكرّر شيئًا.
//   • ترتيب المهام مفروض على الخادم: لا يمكن استدعاء finalize قبل ما قبلها.
//   • ترقية المالك إلى ADMIN تتم هنا بمفتاح الخدمة، ولا يملكها العميل إطلاقًا.
//   • لا يُعاد للعميل أي تفصيل داخلي عند الخطأ، ولا يُسجَّل أي سرّ.
//
//   POST { runKey, task, payload }  ⇒  { ok, task, result, idempotent }
// ============================================================================

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.58.0";

// ---------------------------------------------------------------------------
// CORS — قائمة سماح صريحة. لا "*" على نقطة تكتب في قاعدة البيانات.
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = (Deno.env.get("SETUP_ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const DEV_ORIGINS = [
  "http://localhost:8080", "http://127.0.0.1:8080",
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:3000", "http://127.0.0.1:3000",
];

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEV_ORIGINS;
  const ok = origin && allow.includes(origin);
  return {
    // بلا origin مطابق لا يُصدر رأس سماح إطلاقًا، فيرفض المتصفح القراءة.
    ...(ok ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "content-type,authorization,apikey,x-client-info,x-terminal-id",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

const json = (body: unknown, status: number, req: Request) =>
  Response.json(body, {
    status,
    headers: {
      ...corsFor(req),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });

// ---------------------------------------------------------------------------
// ترتيب المهام — مفروض على الخادم لا على المعالج
// ---------------------------------------------------------------------------
const TASKS = [
  "workspace", "store", "permissions", "inventory",
  "products", "defaults", "finalize",
] as const;
type Task = (typeof TASKS)[number];

const MAX_PAYLOAD_BYTES = 96 * 1024;
const MAX_STR = 200;

const str = (v: unknown, max = MAX_STR): string =>
  String(v ?? "").trim().slice(0, max);

/** يبني كائنًا بمفاتيح معروفة فقط — يمنع mass assignment. */
function pick<T extends string>(src: unknown, keys: readonly T[]): Record<string, unknown> {
  const o = (src && typeof src === "object") ? src as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in o) out[k] = o[k];
  return out;
}

// ---------------------------------------------------------------------------
// المهام — كلها تكتب داخل setup_state.payload تحت مفتاحها.
// لا تُخترع جداول موازية: مخطّط المحل الحقيقي موجود سلفًا، وما تحتاجه شاشة
// الإعداد هو إعدادات لا كيانات جديدة.
// ---------------------------------------------------------------------------
const SECTION: Record<Task, readonly string[] | null> = {
  workspace : ["name", "locale", "timezone"],
  store     : ["storeName", "shopName", "phone", "whatsapp", "city", "address", "branch"],
  permissions: null,  // تُشتقّ من الأدوار على الخادم
  inventory : ["trackImei", "trackSerial", "conditions", "lowStock", "intake", "requireImeiOnSale"],
  products  : ["brands", "storages", "colors", "categories"],
  defaults  : ["sales", "customers", "invoices", "preferences", "business"],
  finalize  : null,
};

async function runTask(
  admin: SupabaseClient,
  task: Task,
  userId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // الصف المفرد يُنشأ عند أول مهمة ثم يُحدَّث.
  await admin.from("setup_state").upsert({ id: 1 }, { onConflict: "id" });

  const { data: row, error: readErr } = await admin
    .from("setup_state").select("payload, completed").eq("id", 1).single();
  if (readErr) throw new Error("state_read_failed");

  const state = (row?.payload ?? {}) as Record<string, unknown>;

  if (task === "finalize") {
    // كل مهمة سابقة يجب أن تكون قد سجَّلت قسمها. لا اختصار للخطوات.
    const missing = TASKS.filter((t) => t !== "finalize" && t !== "permissions" && !(t in state));
    if (missing.length) {
      const e = new Error("incomplete") as Error & { missing?: string[] };
      e.missing = missing;
      throw e;
    }

    // المالك يصبح ADMIN هنا — بمفتاح الخدمة، لا بطلب من العميل.
    const { error: roleErr } = await admin
      .from("profiles").update({ role: "ADMIN", status: "active" }).eq("id", userId);
    if (roleErr) throw new Error("owner_role_failed");

    const storeName = str((state.store as Record<string, unknown>)?.storeName)
      || str((state.workspace as Record<string, unknown>)?.name);

    const { error: doneErr } = await admin.from("setup_state").update({
      completed: true,
      completed_at: new Date().toISOString(),
      completed_by: userId,
      store_name: storeName || null,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (doneErr) throw new Error("finalize_failed");

    return { completed: true, store_name: storeName };
  }

  if (task === "permissions") {
    // الصلاحيات ليست قائمة يرسلها العميل: تُشتقّ من permissions_for(role).
    const { data, error } = await admin.rpc("permissions_for", { p_role: "ADMIN" });
    if (error) throw new Error("permissions_failed");
    state.permissions = { source: "permissions_for", owner: data };
  } else {
    const keys = SECTION[task];
    state[task] = keys ? pick(payload, keys) : {};
  }

  const { error: writeErr } = await admin.from("setup_state")
    .update({ payload: state, updated_at: new Date().toISOString() }).eq("id", 1);
  if (writeErr) throw new Error("state_write_failed");

  return { section: task };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(req) });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, req);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "unavailable" }, 503, req);

  // --- 1) هوية المستدعي: جلسة مستخدم حقيقية، لا مفتاح anon ---
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
  if (!token) return json({ ok: false, error: "unauthenticated" }, 401, req);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const user = userData?.user;
  // مفتاح anon يمرّ من البوابة لكنه ليس مستخدمًا: getUser يرفضه هنا.
  if (userErr || !user?.id) return json({ ok: false, error: "unauthenticated" }, 401, req);
  if (!user.email_confirmed_at) return json({ ok: false, error: "email_unconfirmed" }, 403, req);

  // --- 2) حدّ المحاولات على الخادم ---
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    p_bucket: "setup_provision", p_subject: user.id, p_limit: 60, p_window_seconds: 300,
  });
  if (allowed === false) return json({ ok: false, error: "rate_limited" }, 429, req);

  // --- 3) الحمولة ---
  const raw = await req.text();
  if (raw.length > MAX_PAYLOAD_BYTES) return json({ ok: false, error: "payload_too_large" }, 413, req);

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw || "{}"); } catch { return json({ ok: false, error: "bad_json" }, 400, req); }

  const task = str(body.task, 40) as Task;
  const runKey = str(body.runKey, 80);
  if (!TASKS.includes(task)) return json({ ok: false, error: "unknown_task" }, 400, req);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(runKey)) return json({ ok: false, error: "bad_run_key" }, 400, req);

  const payload = (body.payload && typeof body.payload === "object")
    ? body.payload as Record<string, unknown> : {};

  // --- 4) الإعداد مرة واحدة: لا إعادة تهيئة على نظام مكتمل ---
  const { data: st } = await admin.from("setup_state").select("completed").eq("id", 1).maybeSingle();
  if (st?.completed) return json({ ok: false, error: "already_completed" }, 409, req);

  // --- 5) idempotency: نفس (runKey, task) لا يُنفَّذ مرتين ---
  const { data: prior } = await admin.from("setup_provision_runs")
    .select("result, status").eq("run_key", runKey).eq("task", task).maybeSingle();
  if (prior?.status === "done") {
    return json({ ok: true, task, result: prior.result, idempotent: true }, 200, req);
  }

  // --- 6) التنفيذ ---
  try {
    const result = await runTask(admin, task, user.id, payload);

    // الحجز والنتيجة في خطوة واحدة. تسابُق نداءين متزامنين ينتهي بأن
    // أحدهما يصطدم بالمفتاح الفريد فيقرأ نتيجة الآخر بدل أن يكرّرها.
    const { error: insErr } = await admin.from("setup_provision_runs").insert({
      run_key: runKey, task, status: "done", result,
      actor: user.id, terminal_id: str(req.headers.get("x-terminal-id"), 80) || null,
    });
    if (insErr) {
      const { data: raced } = await admin.from("setup_provision_runs")
        .select("result").eq("run_key", runKey).eq("task", task).maybeSingle();
      if (raced) return json({ ok: true, task, result: raced.result, idempotent: true }, 200, req);
      throw new Error("run_record_failed");
    }

    await admin.rpc("log_security_event", {
      p_event: `setup.${task}`, p_outcome: "ok",
      p_terminal_id: str(req.headers.get("x-terminal-id"), 80) || null,
      p_detail: { run_key: runKey },
    }).then(() => {}, () => {});

    return json({ ok: true, task, result, idempotent: false }, 200, req);
  } catch (e) {
    const err = e as Error & { missing?: string[] };
    // يُسجَّل الداخلي في سجلّ الدالة، ويُعاد للعميل رمز مغلق فقط.
    console.error("setup-provision", task, err?.message);
    if (err?.message === "incomplete") {
      return json({ ok: false, error: "incomplete", missing: err.missing ?? [] }, 409, req);
    }
    return json({ ok: false, error: "provision_failed", task }, 500, req);
  }
});
