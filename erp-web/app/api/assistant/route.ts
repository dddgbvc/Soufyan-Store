import Anthropic from '@anthropic-ai/sdk';
import {env} from 'cloudflare:workers';
import {SESSION_COOKIE, ServerError, clearCookie, fail, json, sameOrigin, serviceRpc, sessionId} from '../../../lib/yaqoot/server';
export const dynamic = 'force-dynamic';

// المساعد الذكي: يجيب عن أسئلة المحل بأدوات قراءة فقط تمر عبر نفس دوال web_* في قاعدة البيانات،
// فيرى الموظف ما تسمح به صلاحياته فقط. لا توجد أي أداة كتابة أو عملية مالية.
// المفتاح ANTHROPIC_API_KEY سرّ في Cloudflare Worker ولا يصل للتطبيق.

const MODEL = 'claude-opus-5-5';

type ToolDef = {fn: string; description: string; properties: Record<string, unknown>; map?: (i: Record<string, unknown>) => Record<string, unknown>};

const TOOLS: Record<string, ToolDef> = {
  dashboard: {fn: 'web_dashboard', description: 'ملخص المحل اليوم والشهر: المبيعات، الربح، الديون، الخزنة، المصروفات، الصيانة، المخزون، ومبيعات آخر 7 أيام.', properties: {}},
  customers: {fn: 'web_customers_list', description: 'بحث في الزبائن وديونهم. debtors_only لعرض المدينين فقط مرتبين بالدين.',
    properties: {q: {type: 'string', description: 'اسم أو هاتف'}, debtors_only: {type: 'boolean'}, limit: {type: 'integer'}}},
  customer_statement: {fn: 'web_customer_statement', description: 'كشف حساب زبون: الرصيد وحركات الديون والتسديد والفواتير. يحتاج id الزبون من أداة customers.',
    properties: {id: {type: 'string'}}},
  invoices: {fn: 'web_invoices_list', description: 'فواتير البيع الأحدث أولاً. debt_only لغير المسددة.',
    properties: {q: {type: 'string'}, debt_only: {type: 'boolean'}, limit: {type: 'integer'}}},
  products: {fn: 'web_products_list', description: 'المنتجات والمخزون والأسعار. low_only لما تحت حد التنبيه.',
    properties: {q: {type: 'string'}, low_only: {type: 'boolean'}, limit: {type: 'integer'}}},
  shortages: {fn: 'web_shortages_list', description: 'النواقص المسجلة يدوياً والمنتجات تحت حد التنبيه.', properties: {}},
  isp: {fn: 'web_isp_overview', description: 'مشتركو الإنترنت: الانتهاء والحالة وربطهم بالزبائن. status: all|expired|soon|active|unlinked.',
    properties: {q: {type: 'string'}, status: {type: 'string'}, limit: {type: 'integer'}}},
  vault: {fn: 'web_vault', description: 'رصيد الخزنة وحركاتها الأخيرة.', properties: {limit: {type: 'integer'}}},
  expenses: {fn: 'web_expenses_list', description: 'المصروفات الأحدث أولاً.', properties: {limit: {type: 'integer'}}},
  repairs: {fn: 'web_repairs_list', description: 'تذاكر الصيانة. status: OPEN|READY|ALL.', properties: {q: {type: 'string'}, status: {type: 'string'}, limit: {type: 'integer'}}},
  activity: {fn: 'web_activity_feed', description: 'سجل العمليات (للمدير فقط): من فعل ماذا ومتى.', properties: {actor: {type: 'string'}, limit: {type: 'integer'}}},
};

const SYSTEM = `أنت «مساعد مكتب سفيان»، مساعد ذكي داخل تطبيق متابعة مكتب سفيان للموبايل (محل موبايلات وإنترنت في العراق).
- أجب بالعربية العراقية المفهومة وباختصار عملي. الأرقام بالدينار العراقي مع فواصل الآلاف.
- استعمل الأدوات لجلب الأرقام الحقيقية قبل الإجابة، ولا تخترع أرقاماً. إن رفضت أداة لعدم الصلاحية فقل ذلك بوضوح.
- أنت للقراءة والتحليل فقط: لا تستطيع إضافة دين أو قبض مال أو تعديل أي شيء. إن طُلب ذلك فوجّه المستخدم للقسم المناسب في التطبيق.
- عند التحليل قدّم ملاحظة أو اقتراحاً مفيداً واحداً أو اثنين (مثل الزبائن الأعلى ديناً، الاشتراكات المنتهية، النواقص المهمة).
- لا تكشف أرقام هواتف كاملة إلا إذا طُلبت صراحة.`;

function toolList(): Anthropic.Beta.BetaTool[] {
  return Object.entries(TOOLS).map(([name, t]) => ({
    name,
    description: t.description,
    input_schema: {type: 'object', properties: t.properties, additionalProperties: false},
  }));
}

async function runTool(sid: string, name: string, input: unknown): Promise<string> {
  const t = TOOLS[name];
  if (!t) return JSON.stringify({error: 'أداة غير معروفة'});
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'limit') params.limit = Math.min(Math.max(Number(v) || 20, 1), 50);
    else if (typeof v === 'string') params[k] = v.slice(0, 100);
    else if (typeof v === 'boolean') params[k] = v;
  }
  if (t.fn !== 'web_dashboard' && t.fn !== 'web_shortages_list' && params.limit === undefined && 'limit' in t.properties) params.limit = 20;
  try {
    const data = await serviceRpc(t.fn, {p_session_id: sid, p_params: params});
    const text = JSON.stringify(data);
    return text.length > 24000 ? text.slice(0, 24000) + '…(مقتطع)' : text;
  } catch (err) {
    if (err instanceof ServerError && err.code === 'session_expired') throw err;
    const msg = err instanceof ServerError ? err.message || err.code : 'تعذر جلب البيانات';
    return JSON.stringify({error: msg});
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ok: false, reason: 'origin_not_allowed'}, 403);
  const sid = sessionId(req);
  if (!sid) return json({ok: false, reason: 'session_expired'}, 401);
  const key = (env as unknown as {ANTHROPIC_API_KEY?: string}).ANTHROPIC_API_KEY;
  if (!key) return json({ok: false, reason: 'assistant_not_configured', message: 'المساعد غير مفعّل: أضف المفتاح ANTHROPIC_API_KEY في إعدادات الخادم.'}, 503);

  let body: {messages?: {role: string; content: string}[]};
  try {
    const text = await req.text();
    if (text.length > 20000) return json({ok: false, reason: 'body_too_large'}, 413);
    body = JSON.parse(text);
  } catch {
    return json({ok: false, reason: 'invalid_json'}, 400);
  }
  const history = (body.messages || [])
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map(m => ({role: m.role as 'user' | 'assistant', content: m.content.slice(0, 2000)}));
  if (!history.length || history[history.length - 1].role !== 'user') return json({ok: false, reason: 'invalid_input'}, 400);
  while (history.length && history[0].role !== 'user') history.shift();

  const client = new Anthropic({apiKey: key});
  const messages: Anthropic.Beta.BetaMessageParam[] = history;
  const used: string[] = [];
  try {
    for (let step = 0; step < 8; step++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {effort: 'low'},
        system: SYSTEM,
        tools: toolList(),
        messages,
      });
      if (response.stop_reason === 'refusal') {
        return json({ok: true, reply: 'لا أستطيع المساعدة في هذا الطلب.', tools: used});
      }
      if (response.stop_reason === 'pause_turn') {
        messages.push({role: 'assistant', content: response.content});
        continue;
      }
      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || !calls.length) {
        const reply = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
        return json({ok: true, reply: reply || '—', tools: used});
      }
      messages.push({role: 'assistant', content: response.content});
      const results = await Promise.all(calls.map(async c => {
        used.push(c.name);
        return {type: 'tool_result' as const, tool_use_id: c.id, content: await runTool(sid, c.name, c.input)};
      }));
      messages.push({role: 'user', content: results});
    }
    return json({ok: true, reply: 'السؤال يحتاج خطوات كثيرة. جرّب سؤالاً أدق.', tools: used});
  } catch (err) {
    if (err instanceof ServerError && err.code === 'session_expired') {
      return json({ok: false, reason: 'session_expired'}, 401, {'Set-Cookie': clearCookie(req, SESSION_COOKIE)});
    }
    if (err instanceof Anthropic.RateLimitError) return json({ok: false, reason: 'rate_limited', message: 'المساعد مشغول. حاول بعد قليل.'}, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ok: false, reason: 'assistant_not_configured', message: 'مفتاح المساعد غير صالح.'}, 503);
    if (err instanceof Anthropic.APIError) return json({ok: false, reason: 'assistant_error', message: 'تعذر الحصول على إجابة من المساعد.'}, 502);
    return fail(err);
  }
}
