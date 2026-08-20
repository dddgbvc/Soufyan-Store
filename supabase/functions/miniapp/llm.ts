// ============================================================================
// طبقة موحّدة للتعامل مع مزوّدي الذكاء الاصطناعي
// ----------------------------------------------------------------------------
// تدعم استدعاء الأدوات (tool calling) عند المزوّدين الثلاثة الكبار بصيغهم
// المختلفة، مع ارتداد تلقائي إلى بروتوكول نصّي إذا كان النموذج لا يدعم
// الأدوات — فلا يتعطّل المساعد مهما كان المزوّد المضبوط في الخزنة.
// ============================================================================

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text?: string; calls?: ToolCall[] }
  | { role: "tool"; callId: string; name: string; result: string };

export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type Reply = { text: string; calls: ToolCall[] };

export type AiConfig = {
  provider: string;
  key: string;
  baseUrl?: string | null;
  model?: string | null;
};

type Family = "openai" | "anthropic" | "gemini";

/**
 * الإعدادات الافتراضية. النماذج المختارة كلّها تدعم استدعاء الأدوات وتُجيد
 * العربية. يمكن تجاوزها دائماً بالسرّ ai_model في الخزنة.
 */
const PRESETS: Record<string, { base: string; model: string; family: Family }> = {
  openai: { base: "https://api.openai.com/v1", model: "gpt-4.1", family: "openai" },
  azure: { base: "https://api.openai.com/v1", model: "gpt-4.1", family: "openai" },
  groq: { base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", family: "openai" },
  deepseek: { base: "https://api.deepseek.com/v1", model: "deepseek-chat", family: "openai" },
  openrouter: { base: "https://openrouter.ai/api/v1", model: "google/gemini-2.5-flash", family: "openai" },
  together: {
    base: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    family: "openai",
  },
  mistral: { base: "https://api.mistral.ai/v1", model: "mistral-large-latest", family: "openai" },
  xai: { base: "https://api.x.ai/v1", model: "grok-4", family: "openai" },
  gemini: {
    base: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash",
    family: "gemini",
  },
  anthropic: { base: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6", family: "anthropic" },
};

export function resolve(cfg: AiConfig) {
  const provider = String(cfg.provider ?? "openai").toLowerCase().trim();
  const preset = PRESETS[provider] ?? PRESETS.openai;
  return {
    provider,
    family: preset.family,
    base: String(cfg.baseUrl || preset.base).replace(/\/+$/, ""),
    model: String(cfg.model || preset.model),
  };
}

export class ToolsUnsupported extends Error {}

const TOOL_ERROR = /tool|function[_ ]?call|not supported|unsupported|unrecognized|invalid.*schema/i;

export type ChatOptions = {
  system: string;
  messages: Msg[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

export async function chat(cfg: AiConfig, opts: ChatOptions): Promise<Reply> {
  if (!cfg.key) throw new Error("AI key missing");
  const target = resolve(cfg);
  try {
    if (target.family === "anthropic") return await anthropicChat(cfg, target, opts);
    if (target.family === "gemini") return await geminiChat(cfg, target, opts);
    return await openaiChat(cfg, target, opts);
  } catch (e) {
    // إذا كان الفشل بسبب عدم دعم الأدوات، أبلغ المستدعي ليُعيد المحاولة نصّياً.
    if (opts.tools?.length && TOOL_ERROR.test(String((e as Error).message ?? e))) {
      throw new ToolsUnsupported(String((e as Error).message ?? e));
    }
    throw e;
  }
}

// ------------------------------ OpenAI ومتوافقوه ------------------------------

async function openaiChat(
  cfg: AiConfig,
  target: ReturnType<typeof resolve>,
  opts: ChatOptions,
): Promise<Reply> {
  const messages: any[] = [{ role: "system", content: opts.system }];
  for (const m of opts.messages) {
    if (m.role === "user") messages.push({ role: "user", content: m.text });
    else if (m.role === "assistant") {
      const entry: any = { role: "assistant", content: m.text ?? "" };
      if (m.calls?.length) {
        entry.tool_calls = m.calls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        }));
      }
      messages.push(entry);
    } else {
      messages.push({ role: "tool", tool_call_id: m.callId, name: m.name, content: m.result });
    }
  }

  const body: any = {
    model: target.model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1600,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.key}`,
  };
  if (target.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://telegram.org";
    headers["X-Title"] = "Soufyan Mobile MiniApp";
  }

  const res = await fetch(`${target.base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message ?? `AI ${res.status}`);
  }

  const message = json.choices?.[0]?.message ?? {};
  const calls: ToolCall[] = (message.tool_calls ?? []).map((c: any, i: number) => ({
    id: String(c.id ?? `call_${i}`),
    name: String(c.function?.name ?? ""),
    args: parseArgs(c.function?.arguments),
  }));
  return { text: String(message.content ?? "").trim(), calls };
}

// --------------------------------- Anthropic ---------------------------------

async function anthropicChat(
  cfg: AiConfig,
  target: ReturnType<typeof resolve>,
  opts: ChatOptions,
): Promise<Reply> {
  const messages: any[] = [];
  for (const m of opts.messages) {
    if (m.role === "user") {
      messages.push({ role: "user", content: [{ type: "text", text: m.text }] });
    } else if (m.role === "assistant") {
      const content: any[] = [];
      if (m.text) content.push({ type: "text", text: m.text });
      for (const c of m.calls ?? []) {
        content.push({ type: "tool_use", id: c.id, name: c.name, input: c.args });
      }
      if (content.length) messages.push({ role: "assistant", content });
    } else {
      const last = messages[messages.length - 1];
      const block = { type: "tool_result", tool_use_id: m.callId, content: m.result };
      if (last?.role === "user" && Array.isArray(last.content)) last.content.push(block);
      else messages.push({ role: "user", content: [block] });
    }
  }

  const body: any = {
    model: target.model,
    max_tokens: opts.maxTokens ?? 1600,
    temperature: opts.temperature ?? 0.3,
    system: opts.system,
    messages,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const res = await fetch(`${target.base}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json?.error?.message ?? `AI ${res.status}`);

  const blocks: any[] = json.content ?? [];
  return {
    text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(),
    calls: blocks
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: String(b.id), name: String(b.name), args: (b.input ?? {}) as any })),
  };
}

// ---------------------------------- Gemini ----------------------------------

async function geminiChat(
  cfg: AiConfig,
  target: ReturnType<typeof resolve>,
  opts: ChatOptions,
): Promise<Reply> {
  const contents: any[] = [];
  for (const m of opts.messages) {
    if (m.role === "user") contents.push({ role: "user", parts: [{ text: m.text }] });
    else if (m.role === "assistant") {
      const parts: any[] = [];
      if (m.text) parts.push({ text: m.text });
      for (const c of m.calls ?? []) parts.push({ functionCall: { name: c.name, args: c.args } });
      if (parts.length) contents.push({ role: "model", parts });
    } else {
      contents.push({
        role: "user",
        parts: [{
          functionResponse: { name: m.name, response: { result: m.result } },
        }],
      });
    }
  }

  const body: any = {
    system_instruction: { parts: [{ text: opts.system }] },
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxTokens ?? 1600,
    },
  };
  if (opts.tools?.length) {
    body.tools = [{
      functionDeclarations: opts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    }];
  }

  const res = await fetch(
    `${target.base}/models/${target.model}:generateContent?key=${encodeURIComponent(cfg.key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json?.error?.message ?? `AI ${res.status}`);

  const parts: any[] = json.candidates?.[0]?.content?.parts ?? [];
  const calls: ToolCall[] = [];
  let text = "";
  parts.forEach((p, i) => {
    if (p.text) text += p.text;
    if (p.functionCall) {
      calls.push({
        id: `call_${i}`,
        name: String(p.functionCall.name ?? ""),
        args: (p.functionCall.args ?? {}) as any,
      });
    }
  });
  return { text: text.trim(), calls };
}

// ---------------------------------- أدوات ----------------------------------

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch { /* تجاهل */ }
    }
    return {};
  }
}
