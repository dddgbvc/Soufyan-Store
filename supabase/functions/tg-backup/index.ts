import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2";
import { buildFiles, groupLines, stampText } from "./backup.ts";
import { baghdadTime } from "./labels.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const SCHEMA = `
customers(id uuid, name text, phone text, address text, balance numeric, credit_limit numeric, created_at timestamptz)
  -- balance = الدين الحالي (موجب = عليه دين)
invoices(id uuid, invoice_number text, customer_id uuid, customer_name text, total_amount numeric,
         paid_amount numeric, delivery_price numeric, province_name text,
         payment_type text IN ('CASH','DEBT'), actor text, created_at timestamptz)
invoice_items(id uuid, invoice_id uuid, product_id uuid, product_name text, quantity int,
              unit_price numeric, discount numeric, total numeric)
products(id uuid, barcode text, name text, category_id uuid, cost_price numeric, selling_price numeric,
         stock_quantity int, min_stock_alert int, created_at timestamptz)
categories(id uuid, name text, slug text)
debt_payments(id uuid, customer_id uuid, customer_name text, previous_debt numeric, amount_paid numeric,
              waived_amount numeric, remaining_debt numeric, is_zeroed bool, actor text, created_at timestamptz)
expenses(id uuid, description text, category text, amount numeric, actor text, created_at timestamptz)
repairs(id uuid, ticket_no text, customer_name text, device text, fault text,
        status text IN ('intake','diagnosing','awaiting_parts','ready','delivered','unrepairable'),
        cost numeric, labour numeric, created_at timestamptz)
shortages(id uuid, product_id uuid, name text, category text, current_qty int, limit_qty int, resolved bool)
employees(id uuid, name text, display_name text, role text, department text, status text)
`;

const INTENT_SYSTEM = `انت تصنف رسائل صاحب محل موبايلات عراقي.

ارجع JSON فقط بدون markdown:

1) إذا الرسالة أمر بتسديد دين (مثلاً "أحمد سدد 150000" أو "استلمت من علي 50 الف"):
{"action":"pay","customer":"اسم الزبون","amount":150000}

2) إذا سؤال عن البيانات:
{"action":"ask"}

3) إذا كلام عام (سلام، شكراً):
{"action":"chat","answer":"رد قصير بالعامية العراقية"}

ملاحظات: "الف" = 1000 ، "مليون" = 1000000. ارجع amount رقم صحيح بدون فواصل.`;

const SQL_SYSTEM = `انت تحول أسئلة صاحب محل موبايلات عراقي الى استعلام PostgreSQL.

الجداول (schema public):
${SCHEMA}

قواعد ملزمة:
- SELECT فقط.
- الوقت بتوقيت بغداد: (created_at at time zone 'Asia/Baghdad')::date
- "اليوم" = (now() at time zone 'Asia/Baghdad')::date
- للأسماء استخدم ILIKE '%جزء%' وليس =
- دائماً LIMIT 50 أو أقل.

ارجع JSON فقط بدون markdown: {"sql": "SELECT ..."}`;

const ANSWER_SYSTEM = `انت مساعد محل "مكتب سفيان للموبايلات".
ترد باللهجة العراقية العامية ، مختصر ومباشر.

قواعد:
- المبالغ بالدينار مع فواصل (1,850,000 د.ع)
- إذا النتيجة فارغة قل ذلك بوضوح
- لا تخترع أرقام
- ممنوع markdown وجداول وعلامات * أو #
- سطرين لخمسة أسطر بس`;

function baghdadStamp(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
}

function fmt(n: number | string): string {
  const x = Number(n);
  if (!isFinite(x)) return String(n);
  return x.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitize(s: string): string {
  return esc(s).replace(/^\s*[*#]+\s*/gm, "• ").replace(/\*\*/g, "").trim();
}

function parseAmount(raw: string): number | null {
  const map: Record<string, string> = {
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
    "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
  };
  const norm = raw.replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d)
                  .replace(/[,٬\s_]/g, "");
  const m = norm.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return isFinite(n) ? n : null;
}

function token(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

async function getConfig() {
  const { data, error } = await db.rpc("tg_config");
  if (error) throw new Error("tg_config failed: " + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.bot_token) throw new Error("bot_token missing in vault");
  return {
    token: row.bot_token as string,
    chatIds: String(row.chat_ids ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    webhookSecret: (row.webhook_secret ?? "") as string,
    aiProvider: String(row.ai_provider ?? "openai").toLowerCase(),
    aiKey: (row.ai_key ?? "") as string,
    aiBaseUrl: (row.ai_base_url ?? "") as string,
    aiModel: (row.ai_model ?? "") as string,
  };
}

async function tgSend(token: string, chatId: string, text: string, keyboard?: any) {
  let body = (text ?? "").trim() || "ماكو نتيجة.";
  if (body.length > 3900) body = body.slice(0, 3900) + "…";
  const payload: any = { chat_id: chatId, text: body, parse_mode: "HTML" };
  if (keyboard) payload.reply_markup = keyboard;

  let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  let json = await res.json();

  if (!json.ok) {
    console.error("sendMessage(HTML) failed:", JSON.stringify(json));
    const plain: any = { chat_id: chatId, text: body.replace(/<[^>]*>/g, "") };
    if (keyboard) plain.reply_markup = keyboard;
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(plain),
    });
    json = await res.json();
    if (!json.ok) console.error("sendMessage(plain) failed:", JSON.stringify(json));
  }
  return json;
}

async function tgAnswerCallback(token: string, id: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, text: text ?? "" }),
  }).catch(() => {});
}

async function tgEditMarkup(token: string, chatId: string, messageId: number) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
  }).catch(() => {});
}

async function tgTyping(token: string, chatId: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}

async function tgDocument(token: string, chatId: string, bytes: Uint8Array, filename: string, caption: string) {
  const fd = new FormData();
  fd.append("chat_id", chatId);
  fd.append("caption", caption);
  fd.append("parse_mode", "HTML");
  fd.append("document", new Blob([bytes], { type: "application/zip" }), filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: fd });
  const json = await res.json();
  if (!json.ok) throw new Error("sendDocument failed: " + JSON.stringify(json));
  return json;
}

const DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openai:     { baseUrl: "https://api.openai.com/v1",      model: "gpt-4.1-mini" },
  groq:       { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  deepseek:   { baseUrl: "https://api.deepseek.com/v1",    model: "deepseek-chat" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1",   model: "google/gemini-3.1-flash-lite" },
  together:   { baseUrl: "https://api.together.xyz/v1",    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  mistral:    { baseUrl: "https://api.mistral.ai/v1",      model: "mistral-large-latest" },
  gemini:     { baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash" },
  anthropic:  { baseUrl: "https://api.anthropic.com/v1",   model: "claude-sonnet-4-6" },
};

async function llm(cfg: any, system: string, userText: string, maxTokens = 1500): Promise<string> {
  const preset = DEFAULTS[cfg.aiProvider] ?? DEFAULTS.openai;
  const baseUrl = (cfg.aiBaseUrl || preset.baseUrl).replace(/\/+$/, "");
  const model = cfg.aiModel || preset.model;

  if (cfg.aiProvider === "gemini") {
    const res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${cfg.aiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error("AI: " + JSON.stringify(json.error));
    return (json.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
  }

  if (cfg.aiProvider === "anthropic") {
    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": cfg.aiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: userText }] }),
    });
    const json = await res.json();
    if (json.error) throw new Error("AI: " + JSON.stringify(json.error));
    return (json.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.aiKey}` },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.2,
      messages: [{ role: "system", content: system }, { role: "user", content: userText }],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error("AI: " + JSON.stringify(json.error));
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

function parseJsonLoose(s: string): any {
  let clean = s.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a !== -1 && b !== -1) clean = clean.slice(a, b + 1);
  return JSON.parse(clean);
}

async function answerQuestion(cfg: any, question: string): Promise<string> {
  const plan = await llm(cfg, SQL_SYSTEM, question, 1200);
  let parsed: any;
  try { parsed = parseJsonLoose(plan); }
  catch { return "ما فهمت السؤال ، ممكن تعيد صياغته؟"; }
  if (!parsed.sql) return "ما قدرت أطلع جواب لهالسؤال.";
  console.log("sql:", parsed.sql);

  const { data, error } = await db.rpc("ai_query", { p_sql: parsed.sql });
  if (error) {
    console.error("ai_query error:", error.message);
    return "ما قدرت أجيب البيانات — جرّب تسأل بطريقة أوضح.";
  }
  const reply = await llm(cfg, ANSWER_SYSTEM,
    `السؤال: ${question}\n\nالنتيجة (JSON):\n${JSON.stringify(data)}\n\nاكتب الجواب باللهجة العراقية.`, 1500);
  return sanitize(reply) || "ماكو نتيجة.";
}

// ==================== النسخة الاحتياطية ====================

async function buildBackup() {
  const { data, error } = await db.rpc("backup_dump");
  if (error) throw new Error("backup_dump failed: " + error.message);

  const stamp = baghdadStamp();
  const { files, counts, totalRows, tableCount } = buildFiles(data as any, stamp);

  const zipInput: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) zipInput[name] = strToU8(text);

  return { zipped: zipSync(zipInput, { level: 9 }), counts, totalRows, tableCount, stamp };
}

async function sendBackup(cfg: any, targets?: string[]) {
  const chats = targets && targets.length ? targets : cfg.chatIds;
  if (!chats.length) throw new Error("no chat ids configured");

  const { zipped, counts, totalRows, tableCount, stamp } = await buildBackup();
  const filename = `sufyan_backup_${stamp}.zip`;

  const caption =
    `💾 <b>النسخة الاحتياطية اليومية</b>\n` +
    `${stampText(stamp, " — الساعة ")}\n\n` +
    `هذا ملف مضغوط بيه بيانات المحل كلها بجداول عربية تنفتح بالإكسل.\n` +
    `احفظه بمكان أمين — منه ترجع بياناتك إذا صار أي خلل.\n\n` +
    `📊 ${tableCount} ملف · ${fmt(totalRows)} سجل · ${(zipped.byteLength / 1024).toFixed(0)} KB\n\n` +
    groupLines(counts).join("\n") +
    `\n\n📄 افتح ملف <b>«اقرأني»</b> أول شي — بيه شرح كل ملف شنو يعني.`;

  const results: string[] = [];
  for (const chat of chats) {
    try { await tgDocument(cfg.token, chat, zipped, filename, caption); results.push(`${chat}: ok`); }
    catch (e) { results.push(`${chat}: ${String(e)}`); }
  }
  return { filename, totalRows, tableCount, results };
}

// ==================== welcome ====================

function roleLine(role: string): string {
  if (role === "ADMIN") return "مدير عام";
  if (role === "MANAGER") return "مدير";
  return "كاشير";
}

function welcomeFor(id: any): string {
  const name = esc(id.employee_name ?? id.label);
  const isBoss = id.employee_role === "ADMIN" || id.employee_role === "MANAGER";

  return (
    `🎉 <b>أهلاً وسهلاً ${name}</b>\n\n` +
    `انت هسه مربوط بنظام <b>مكتب سفيان</b> — تكدر تشوف كلشي بالمحل وتسجل تسديدات من هاتفك مباشرة.\n` +
    `الصلاحية: <b>${roleLine(id.employee_role ?? "CASHIER")}</b> — قراءة وتسديد\n\n` +

    `💬 <b>اسألني بالعامية:</b>\n` +
    `• شنو مبيعات اليوم؟\n` +
    `• منو أكثر زبون عليه دين؟\n` +
    `• علي حسن شكد عليه دين؟\n` +
    `• شنو البضاعة اللي قاربت تخلص؟\n` +
    `• شكد مصاريف هالشهر؟\n\n` +

    `💰 <b>لتسجيل تسديد:</b>\n` +
    `• <code>أحمد الجبوري سدد 150000</code>\n` +
    `• أو بس <code>أحمد الجبوري سدد</code> ويطلعلك أزرار المبالغ\n\n` +

    `📁 <b>أوامر:</b>\n` +
    `/ديون — الزبائن اللي تجاوزوا مهلة السداد\n` +
    `/backup — نسخة احتياطية ZIP\n` +
    `/id — رقمك بالتلي\n` +
    `/help — هذه القائمة\n` +
    (isBoss ? `/pending — طلبات الانضمام\n/approve — موافقة على مستخدم\n` : "") +

    `\n⚠️ <b>مهم:</b>\n` +
    `كل تسديد يحتاج تأكيد قبل ما ينثبت.\n` +
    `المبلغ 200,000 فما فوق يطلب منك تكتبه مرة ثانية.\n` +
    `وكل عملية تنسجل باسمك — <b>${name}</b> — مع التاريخ والوقت.`
  );
}

// ==================== payment flow ====================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * الـcid يجي من callback_data، يعني من جهاز المستخدم وينكدر ينتحل.
 * نتحقق من الشكل أولاً، وبعدين ننادي دالة بمعامل مكتوب —
 * ممنوع نبني نص استعلام من مدخل خارجي.
 */
async function loadCustomer(cid: string) {
  if (!UUID.test(cid)) return null;
  const { data, error } = await db.rpc("bot_get_customer", { p_customer_id: cid });
  if (error) { console.error("bot_get_customer:", error.message); return null; }
  return data ?? null;
}

async function startPayment(cfg: any, chatId: string, userId: number, customerQuery: string, amount: number | null) {
  const { data: found, error } = await db.rpc("bot_find_customer", { p_query: customerQuery });
  if (error) { await tgSend(cfg.token, chatId, "❌ خطأ بالبحث عن الزبون"); return; }

  const list = (found ?? []) as any[];
  if (list.length === 0) {
    await tgSend(cfg.token, chatId, `❌ ما لكيت زبون اسمه يشبه «${esc(customerQuery)}»`);
    return;
  }
  if (list.length > 1) {
    const rows = list.map((c) => [{
      text: `${c.name} — ${fmt(c.balance)} د.ع`,
      callback_data: `amt:${c.id}:${amount ?? 0}`,
    }]);
    rows.push([{ text: "❌ إلغاء", callback_data: "cancel:0" }]);
    await tgSend(cfg.token, chatId, "🔍 أكثر من زبون يطابق — اختار واحد:", { inline_keyboard: rows });
    return;
  }
  await proposePayment(cfg, chatId, userId, list[0], amount);
}

async function proposePayment(cfg: any, chatId: string, userId: number, cust: any, amount: number | null) {
  const balance = Number(cust.balance);
  if (balance <= 0) {
    await tgSend(cfg.token, chatId, `ℹ️ <b>${esc(cust.name)}</b> ما عليه دين (الرصيد صفر)`);
    return;
  }

  const { data: settings } = await db.rpc("bot_get_settings");
  const quick: number[] = settings?.quick_amounts ?? [10000, 25000, 50000, 100000, 200000];

  if (!amount || amount <= 0) {
    const usable = quick.filter((q) => q <= balance);
    const rows: any[] = [];
    for (let i = 0; i < usable.length; i += 2) {
      rows.push(usable.slice(i, i + 2).map((q) => ({
        text: `${fmt(q)} د.ع`, callback_data: `amt:${cust.id}:${q}`,
      })));
    }
    rows.push([{ text: `💰 تسديد الكل (${fmt(balance)})`, callback_data: `amt:${cust.id}:${balance}` }]);
    rows.push([{ text: "❌ إلغاء", callback_data: "cancel:0" }]);
    await tgSend(cfg.token, chatId,
      `👤 <b>${esc(cust.name)}</b>\nالدين الحالي: <b>${fmt(balance)} د.ع</b>\n\nاختار المبلغ أو اكتبه:`,
      { inline_keyboard: rows });
    return;
  }

  if (amount > balance) {
    await tgSend(cfg.token, chatId,
      `⚠️ المبلغ أكبر من الدين\nالدين: ${fmt(balance)} د.ع\nطلبت: ${fmt(amount)} د.ع`);
    return;
  }

  const strict = Number(settings?.strict_threshold ?? 200000);
  const tk = token();
  const remaining = balance - amount;

  await db.rpc("bot_create_pending", {
    p_token: tk, p_telegram_id: userId, p_chat_id: chatId, p_action: "pay",
    p_payload: { customer_id: cust.id, customer_name: cust.name, amount, balance, strict: amount >= strict },
  });

  const head =
    `🔍 <b>تأكيد التسديد</b>\n` +
    `الزبون: ${esc(cust.name)}\n` +
    `الدين الحالي: ${fmt(balance)} د.ع\n` +
    `التسديد: <b>${fmt(amount)} د.ع</b>\n` +
    `────────────\n` +
    `المتبقي: <b>${fmt(remaining)} د.ع</b>` +
    (remaining === 0 ? "\n✨ راح يتصفر الحساب" : "");

  if (amount >= strict) {
    await tgSend(cfg.token, chatId,
      head + `\n\n⚠️ <b>مبلغ كبير — تأكيد مشدد</b>\nاكتب المبلغ مرة ثانية للتأكيد:\n<code>${fmt(amount)}</code>`,
      { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: `cancel:${tk}` }]] });
  } else {
    await tgSend(cfg.token, chatId, head, {
      inline_keyboard: [[
        { text: "✅ تأكيد", callback_data: `ok:${tk}` },
        { text: "❌ إلغاء", callback_data: `cancel:${tk}` },
      ]],
    });
  }
}

async function executePayment(cfg: any, chatId: string, userId: number, payload: any) {
  const { data, error } = await db.rpc("bot_record_debt_payment", {
    p_telegram_id: userId, p_customer_id: payload.customer_id,
    p_amount: payload.amount, p_source: "تلغرام",
  });
  if (error) {
    console.error("payment rpc error:", error.message);
    await tgSend(cfg.token, chatId, "❌ فشل التسجيل: " + esc(error.message));
    return;
  }
  if (!data?.ok) {
    await tgSend(cfg.token, chatId, "❌ " + esc(data?.error ?? "فشل غير معروف"));
    return;
  }
  await tgSend(cfg.token, chatId,
    `✅ <b>تم التسجيل</b>\n` +
    `الزبون: ${esc(data.customer)}\n` +
    `المبلغ: ${fmt(data.amount)} د.ع\n` +
    `الدين قبل: ${fmt(data.previous)} د.ع\n` +
    `المتبقي: <b>${fmt(data.remaining)} د.ع</b>` +
    (data.zeroed ? "\n✨ الحساب مصفّر" : "") +
    `\n────────────\n` +
    `سجّله: ${esc(data.actor)}\nمن: الهاتف (تلغرام)\nالوقت: ${baghdadTime(String(data.at))}`);
}

// ==================== router ====================

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  let cfg;
  try { cfg = await getConfig(); }
  catch (e) {
    console.error("config error", String(e));
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }

  const okJson = () => new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });

  // ---------- buttons ----------
  if (body?.callback_query) {
    if (!cfg.webhookSecret || req.headers.get("x-telegram-bot-api-secret-token") !== cfg.webhookSecret) {
      return new Response("forbidden", { status: 403 });
    }
    const cq = body.callback_query;
    const userId = Number(cq.from?.id ?? 0);
    const chatId = String(cq.message?.chat?.id ?? "");
    const dataStr = String(cq.data ?? "");

    const { data: id } = await db.rpc("bot_identify", { p_telegram_id: userId });
    if (!id?.can_read) { await tgAnswerCallback(cfg.token, cq.id); return okJson(); }

    await tgAnswerCallback(cfg.token, cq.id);
    if (cq.message?.message_id) await tgEditMarkup(cfg.token, chatId, cq.message.message_id);

    try {
      const [kind, a, b] = dataStr.split(":");
      if (kind === "cancel") {
        if (a && a !== "0") await db.rpc("bot_cancel_pending", { p_token: a, p_telegram_id: userId });
        await tgSend(cfg.token, chatId, "❌ انلغى الطلب");
      } else if (kind === "amt") {
        if (!id.can_write) { await tgSend(cfg.token, chatId, "⛔ ما عندك صلاحية تسديد"); return okJson(); }
        const cust = await loadCustomer(a);
        if (cust) await proposePayment(cfg, chatId, userId, cust, Number(b) || null);
      } else if (kind === "ok") {
        const { data: taken } = await db.rpc("bot_take_pending", { p_token: a, p_telegram_id: userId });
        if (!taken?.ok) { await tgSend(cfg.token, chatId, "❌ " + esc(taken?.error ?? "فشل")); return okJson(); }
        await executePayment(cfg, chatId, userId, taken.payload);
      }
    } catch (e) {
      console.error("callback error:", String(e));
      await tgSend(cfg.token, chatId, "❌ خطأ: " + esc(String(e).slice(0, 200)));
    }
    return okJson();
  }

  // ---------- messages ----------
  if (body?.message || body?.edited_message) {
    if (!cfg.webhookSecret || req.headers.get("x-telegram-bot-api-secret-token") !== cfg.webhookSecret) {
      return new Response("forbidden", { status: 403 });
    }

    const msg = body.message ?? body.edited_message;
    const chatId = String(msg.chat?.id ?? "");
    const from = msg.from ?? {};
    const userId = Number(from.id ?? 0);
    const text: string = (msg.text ?? "").trim();

    const { data: id } = await db.rpc("bot_identify", { p_telegram_id: userId });
    if (!id?.can_read) {
      await db.rpc("bot_log_unknown", {
        p_telegram_id: userId, p_username: from.username ?? null,
        p_first: from.first_name ?? null, p_last: from.last_name ?? null,
      });
      console.log("blocked unknown user:", userId, from.username ?? "");
      return okJson();
    }

    if (!text) return okJson();
    console.log("msg from", id.label, ":", text.slice(0, 100));

    const cmd = text.split(/[\s@]/)[0].toLowerCase();

    try {
      if (cmd === "/id") {
        await tgSend(cfg.token, chatId,
          `🆔 رقمك: <code>${userId}</code>\nالاسم: ${esc(id.employee_name ?? id.label)}`);
      } else if (cmd === "/ping") {
        await tgSend(cfg.token, chatId, `🏓 شغال — أهلاً ${esc(id.employee_name ?? id.label)}`);
      } else if (cmd === "/start" || cmd === "/help" || cmd === "/مساعدة") {
        await tgSend(cfg.token, chatId, welcomeFor(id));
      } else if (cmd === "/ai") {
        const preset = DEFAULTS[cfg.aiProvider] ?? DEFAULTS.openai;
        await tgSend(cfg.token, chatId,
          `🧠 <b>النموذج</b>\nالمزود: ${cfg.aiProvider}\nالنموذج: ${cfg.aiModel || preset.model}`);
      } else if (cmd === "/debts" || cmd === "/ديون") {
        const { data: txt, error } = await db.rpc("overdue_debts_text");
        if (error) {
          console.error("overdue_debts_text:", error.message);
          await tgSend(cfg.token, chatId, "❌ ما قدرت أجيب الديون المتأخرة");
        } else {
          await tgSend(cfg.token, chatId, String(txt ?? "ماكو نتيجة."));
        }
      } else if (cmd === "/backup" || cmd === "/نسخة") {
        await tgSend(cfg.token, chatId, "⏳ جاري تجهيز النسخة...");
        await sendBackup(cfg, [chatId]);
      } else if (cmd === "/pending") {
        if (!["ADMIN", "MANAGER"].includes(id.employee_role ?? "")) {
          await tgSend(cfg.token, chatId, "⛔ للإدارة فقط"); return okJson();
        }
        const { data: pend } = await db.rpc("bot_list_pending_users");
        const rows = (pend ?? []) as any[];
        if (!rows.length) { await tgSend(cfg.token, chatId, "✅ ماكو طلبات انتظار"); return okJson(); }
        const lines = rows.map((r) =>
          `<code>${r.telegram_id}</code> — ${esc(r.first_name ?? "")} ${esc(r.last_name ?? "")}` +
          (r.username ? ` (@${esc(r.username)})` : "") + ` — ${r.attempts} محاولة`);
        await tgSend(cfg.token, chatId,
          "🕐 <b>بانتظار الموافقة</b>\n\n" + lines.join("\n") +
          "\n\nللموافقة:\n<code>/approve الرقم اسم_الموظف</code>");
      } else if (cmd === "/approve") {
        if (!["ADMIN", "MANAGER"].includes(id.employee_role ?? "")) {
          await tgSend(cfg.token, chatId, "⛔ للإدارة فقط"); return okJson();
        }
        const parts = text.split(/\s+/).slice(1);
        if (parts.length < 2) {
          await tgSend(cfg.token, chatId,
            "الصيغة:\n<code>/approve 123456789 محمود</code>\n\nالصلاحية الافتراضية قراءة وتسديد.\nللقراءة فقط ضيف كلمة read بالآخر.");
          return okJson();
        }
        const targetId = Number(parts[0]);
        const last = parts[parts.length - 1].toLowerCase();
        const explicit = last === "read" || last === "write";
        const canWrite = explicit ? last === "write" : true;
        const empName = (explicit ? parts.slice(1, -1) : parts.slice(1)).join(" ");

        const { data: res } = await db.rpc("bot_approve_user", {
          p_admin_id: userId, p_telegram_id: targetId,
          p_employee: empName, p_can_write: canWrite,
        });

        if (res?.ok) {
          await tgSend(cfg.token, chatId,
            `✅ انضاف <b>${esc(res.employee)}</b>\nالصلاحية: ${res.can_write ? "قراءة وتسديد" : "قراءة فقط"}\n✉️ اندزتله رسالة ترحيب`);
          // welcome the new member personally
          const { data: newId } = await db.rpc("bot_identify", { p_telegram_id: targetId });
          if (newId?.can_read) {
            await tgSend(cfg.token, String(targetId), welcomeFor(newId));
          }
        } else {
          await tgSend(cfg.token, chatId, `❌ ${esc(res?.error ?? "فشل")}`);
        }
      } else if (cmd.startsWith("/")) {
        await tgSend(cfg.token, chatId, "ما أعرف هالأمر. اكتب /help");
      } else {
        const { data: open } = await db.rpc("bot_get_open_pending", { p_telegram_id: userId });
        if (open && open.payload?.strict) {
          const typed = parseAmount(text);
          if (typed !== null) {
            if (typed === Number(open.payload.amount)) {
              const { data: taken } = await db.rpc("bot_take_pending", { p_token: open.token, p_telegram_id: userId });
              if (taken?.ok) await executePayment(cfg, chatId, userId, taken.payload);
              else await tgSend(cfg.token, chatId, "❌ " + esc(taken?.error ?? "فشل"));
            } else {
              await db.rpc("bot_cancel_pending", { p_token: open.token, p_telegram_id: userId });
              await tgSend(cfg.token, chatId,
                `❌ المبلغ ما تطابق — انلغى الطلب للأمان.\nالمطلوب: ${fmt(open.payload.amount)}\nكتبت: ${fmt(typed)}`);
            }
            return okJson();
          }
        }

        await tgTyping(cfg.token, chatId);
        if (!cfg.aiKey) { await tgSend(cfg.token, chatId, "⚠️ مفتاح الذكاء مو مضبوط"); return okJson(); }

        let intent: any = { action: "ask" };
        try { intent = parseJsonLoose(await llm(cfg, INTENT_SYSTEM, text, 400)); }
        catch { intent = { action: "ask" }; }

        if (intent.action === "pay") {
          if (!id.can_write) {
            await tgSend(cfg.token, chatId, "⛔ ما عندك صلاحية تسديد — قراءة بس");
            return okJson();
          }
          await startPayment(cfg, chatId, userId, String(intent.customer ?? ""),
                             intent.amount ? Number(intent.amount) : null);
        } else if (intent.action === "chat" && intent.answer) {
          await tgSend(cfg.token, chatId, sanitize(String(intent.answer)));
        } else {
          await tgSend(cfg.token, chatId, await answerQuestion(cfg, text));
        }
      }
    } catch (e) {
      console.error("handler error:", String(e));
      await tgSend(cfg.token, chatId, "❌ خطأ: " + esc(String(e).slice(0, 250))).catch(() => {});
    }
    return okJson();
  }

  // ---------- cron ----------
  if (!cfg.webhookSecret || req.headers.get("x-cron-secret") !== cfg.webhookSecret) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const result = await sendBackup(cfg);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
