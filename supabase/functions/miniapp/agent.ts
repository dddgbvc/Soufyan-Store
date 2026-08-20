// ============================================================================
// حلقة الوكيل: يفكّر ⇐ يستعلم ⇐ يصحّح نفسه ⇐ يجيب
// ----------------------------------------------------------------------------
// النسخة السابقة كانت جولة واحدة: "أعطني JSON فيه sql" ثم جولة ثانية للصياغة.
// أي خطأ في الاستعلام كان ينتهي بخطأ 500، وأي سؤال يحتاج خطوتين كان يفشل.
// هنا الوكيل يقدر يستعلم عدة مرات، ويستلم رسالة الخطأ ويصحّح استعلامه.
// ============================================================================

import { chat, type Msg, type ToolDef, ToolsUnsupported, type AiConfig } from "./llm.ts";

export type SqlOutcome = { rows: unknown[] } | { error: string };
export type RunSql = (sql: string) => Promise<SqlOutcome>;

export type AgentStep = { sql: string; rows: number; error?: string };

export type AgentResult = {
  answer: string;
  mode: "chat" | "data";
  steps: AgentStep[];
  rows: unknown[];
  toolMode: "native" | "text";
};

const MAX_STEPS = 4;
const MAX_RESULT_CHARS = 14_000;
const MAX_SQL_CHARS = 4_000;
const CALL_TIMEOUT_MS = 45_000;

const RUN_SQL: ToolDef = {
  name: "run_sql",
  description:
    "ينفّذ استعلام قراءة (SELECT/WITH) على قاعدة بيانات المحل ويعيد النتيجة JSON. " +
    "استعمله لأي رقم أو تفصيل غير موجود في اللقطة الحيّة. يمكن استدعاؤه عدة مرات.",
  parameters: {
    type: "object",
    properties: {
      sql: { type: "string", description: "استعلام PostgreSQL للقراءة فقط، بلا فاصلة منقوطة." },
      purpose: { type: "string", description: "بسطر واحد: شنو تريد تعرف من هذا الاستعلام." },
    },
    required: ["sql"],
  },
};

const TEXT_PROTOCOL = `
هذا النموذج لا يدعم الأدوات، فاستعمل البروتوكول النصّي:
- إذا احتجت بيانات، اكتب الاستعلام وحده داخل كتلة:
\`\`\`sql
SELECT ...
\`\`\`
ولا تكتب أي شيء آخر في تلك الرسالة.
- إذا صار عندك ما يكفي، اكتب الجواب النهائي نصاً عادياً بلا أي كتلة sql.
`.trim();

// ------------------------------ حارس الاستعلام ------------------------------

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze|call|do|merge|execute|refresh|reindex|comment|security|lo_import|lo_export|dblink|pg_read_file|pg_ls_dir)\b/i;
const FORBIDDEN_SCHEMAS =
  /\b(vault|auth|storage|extensions|cron|net|information_schema|pg_catalog|pg_shadow|pg_authid|pg_user)\b/i;
const FORBIDDEN_COLUMNS = /\b(pin_hash|decrypted_secret|secrets)\b/i;

/** يتحقّق محلياً قبل الوصول لقاعدة البيانات، ويعيد سبباً عربياً واضحاً للنموذج. */
export function guardSql(raw: string): { sql: string } | { reason: string } {
  const sql = String(raw ?? "").trim().replace(/;+\s*$/, "").trim();
  if (!sql) return { reason: "الاستعلام فارغ." };
  if (sql.length > MAX_SQL_CHARS) return { reason: "الاستعلام طويل جداً، اختصره." };
  if (!/^\s*(select|with)\b/i.test(sql)) return { reason: "مسموح SELECT أو WITH فقط." };
  if (/;\s*\S/.test(sql)) return { reason: "استعلام واحد فقط، بلا فاصلة منقوطة في الوسط." };
  if (FORBIDDEN.test(sql)) return { reason: "الاستعلام يحتوي كلمة كتابة ممنوعة." };
  if (FORBIDDEN_SCHEMAS.test(sql)) {
    return {
      reason:
        "الاستعلام يحتوي كلمة محجوبة (vault/auth/storage/extensions/cron/net/…). " +
        "غيّر الأسماء المستعارة إلى t1 أو agg وأعد المحاولة.",
    };
  }
  if (FORBIDDEN_COLUMNS.test(sql)) return { reason: "هذا العمود محجوب." };
  return { sql };
}

// -------------------------------- تطبيع السؤال --------------------------------

const EASTERN_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function normalizeQuestion(raw: string): string {
  return String(raw ?? "")
    .replace(/[٠-٩۰-۹]/g, (d) => EASTERN_DIGITS[d] ?? d)
    .replace(/ـ+/g, "") // التطويل
    .replace(/٬/g, ",") // فاصلة الآلاف العربية
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------- الحلقة ----------------------------------

export async function runAgent(
  cfg: AiConfig,
  system: string,
  history: Msg[],
  question: string,
  runSql: RunSql,
): Promise<AgentResult> {
  const messages: Msg[] = [...history, { role: "user", text: normalizeQuestion(question) }];
  const steps: AgentStep[] = [];
  let lastRows: unknown[] = [];
  let toolMode: "native" | "text" = "native";
  let activeSystem = system;

  const ask = async (useTools: boolean) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    try {
      return await chat(cfg, {
        system: activeSystem,
        messages,
        tools: useTools && toolMode === "native" ? [RUN_SQL] : undefined,
        temperature: 0.3,
        maxTokens: 1600,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    let reply;
    try {
      reply = await ask(true);
    } catch (e) {
      if (e instanceof ToolsUnsupported && toolMode === "native") {
        // النموذج لا يدعم الأدوات — انتقل للبروتوكول النصّي وأعد المحاولة.
        toolMode = "text";
        activeSystem = `${system}\n\n${TEXT_PROTOCOL}`;
        reply = await ask(false);
      } else {
        throw e;
      }
    }

    // --- المسار الأصلي: استدعاء أدوات ---
    if (reply.calls.length) {
      messages.push({ role: "assistant", text: reply.text, calls: reply.calls });
      for (const call of reply.calls) {
        const result = await executeCall(call.name, call.args, runSql, steps, (rows) => {
          lastRows = rows;
        });
        messages.push({ role: "tool", callId: call.id, name: call.name, result });
      }
      continue;
    }

    // --- المسار البديل: كتلة sql داخل النص ---
    const embedded = toolMode === "text" ? extractSql(reply.text) : null;
    if (embedded) {
      messages.push({ role: "assistant", text: reply.text });
      const result = await executeCall("run_sql", { sql: embedded }, runSql, steps, (rows) => {
        lastRows = rows;
      });
      messages.push({ role: "user", text: `نتيجة الاستعلام:\n${result}` });
      continue;
    }

    if (reply.text) {
      return {
        answer: reply.text,
        mode: steps.length ? "data" : "chat",
        steps,
        rows: lastRows.slice(0, 25),
        toolMode,
      };
    }
    break;
  }

  // استهلكنا الخطوات: اطلب جواباً نهائياً بلا أدوات.
  messages.push({
    role: "user",
    text: "خلص الوقت. اكتب الجواب النهائي الآن من النتائج المتوفرة، بلا أي استعلام إضافي.",
  });
  const final = await (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    try {
      return await chat(cfg, {
        system: activeSystem,
        messages,
        temperature: 0.3,
        maxTokens: 900,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  })();

  return {
    answer: final.text || "هسه ما عندي جواب كافي — جرّب تسأل بطريقة أوضح.",
    mode: steps.length ? "data" : "chat",
    steps,
    rows: lastRows.slice(0, 25),
    toolMode,
  };
}

async function executeCall(
  name: string,
  args: Record<string, unknown>,
  runSql: RunSql,
  steps: AgentStep[],
  onRows: (rows: unknown[]) => void,
): Promise<string> {
  if (name !== "run_sql") return JSON.stringify({ error: `أداة غير معروفة: ${name}` });

  const guard = guardSql(String(args.sql ?? ""));
  if ("reason" in guard) {
    steps.push({ sql: String(args.sql ?? ""), rows: 0, error: guard.reason });
    return JSON.stringify({ error: guard.reason });
  }

  const outcome = await runSql(guard.sql);
  if ("error" in outcome) {
    steps.push({ sql: guard.sql, rows: 0, error: outcome.error });
    return JSON.stringify({
      error: outcome.error,
      hint: "صحّح الاستعلام وأعد المحاولة مرة واحدة على الأقل قبل ما تعتذر للمستخدم.",
    });
  }

  const rows = Array.isArray(outcome.rows) ? outcome.rows : [];
  steps.push({ sql: guard.sql, rows: rows.length });
  onRows(rows);

  if (!rows.length) return JSON.stringify({ rows: [], note: "ماكو نتيجة لهذا الاستعلام." });

  let payload = JSON.stringify(rows);
  let truncated = false;
  if (payload.length > MAX_RESULT_CHARS) {
    let keep = rows.length;
    while (keep > 1 && JSON.stringify(rows.slice(0, keep)).length > MAX_RESULT_CHARS) {
      keep = Math.floor(keep / 2);
    }
    payload = JSON.stringify(rows.slice(0, keep));
    truncated = true;
  }
  return JSON.stringify({ count: rows.length, truncated, rows: JSON.parse(payload) });
}

/** يلتقط استعلاماً من كتلة ```sql أو من JSON بالشكل {"sql": "..."} */
export function extractSql(text: string): string | null {
  const fenced = text.match(/```sql\s*([\s\S]*?)```/i) ?? text.match(/```\s*(select|with)([\s\S]*?)```/i);
  if (fenced) {
    const body = fenced.length === 2 ? fenced[1] : `${fenced[1]}${fenced[2]}`;
    const sql = body.trim();
    if (sql) return sql;
  }
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      if (typeof parsed?.sql === "string" && parsed.sql.trim()) return parsed.sql.trim();
    } catch { /* ليس JSON */ }
  }
  return null;
}
