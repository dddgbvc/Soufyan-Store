// اختبارات حلقة الوكيل مقابل خادم وهمي يحاكي صيغ المزوّدين.
// شغّلها بـ: deno test --allow-net supabase/functions/miniapp/agent_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractSql, guardSql, normalizeQuestion, runAgent, type SqlOutcome } from "./agent.ts";

type Scripted = (body: any, turn: number) => { status: number; json: unknown };

/** خادم وهمي يسجّل الطلبات ويردّ حسب سيناريو. */
function mockProvider(script: Scripted) {
  const seen: any[] = [];
  let turn = 0;
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const body = await req.json().catch(() => ({}));
    seen.push({ url: req.url, body });
    const out = script(body, turn++);
    return Response.json(out.json, { status: out.status });
  });
  const port = (server.addr as Deno.NetAddr).port;
  return { seen, base: `http://127.0.0.1:${port}`, close: () => server.shutdown() };
}

const SYSTEM = "أنت سفيان.";
const DEBTORS = [
  { name: "علي حسن الدليمي", balance: 450000 },
  { name: "أحمد الجبوري", balance: 300000 },
];

function recordingRunSql() {
  const calls: string[] = [];
  const run = async (sql: string): Promise<SqlOutcome> => {
    calls.push(sql);
    if (/broken_table/i.test(sql)) return { error: 'relation "broken_table" does not exist' };
    return { rows: /customers/i.test(sql) ? DEBTORS : [] };
  };
  return { calls, run };
}

function toolCall(id: string, sql: string) {
  return {
    choices: [{
      message: {
        content: "",
        tool_calls: [{
          id,
          type: "function",
          function: { name: "run_sql", arguments: JSON.stringify({ sql }) },
        }],
      },
    }],
  };
}

const say = (text: string) => ({ choices: [{ message: { content: text } }] });

Deno.test("OpenAI: يستعلم ثم يجيب، والحارس يمنع الاسم المستعار المحجوب", async () => {
  const db = recordingRunSql();
  const mock = mockProvider((_body, turn) => {
    if (turn === 0) return { status: 200, json: toolCall("c1", "SELECT name FROM customers net") };
    if (turn === 1) {
      return {
        status: 200,
        json: toolCall("c2", "SELECT name, balance FROM customers WHERE balance > 0 ORDER BY balance DESC LIMIT 5"),
      };
    }
    return { status: 200, json: say("أكبر مدين علي حسن الدليمي عليه 450,000 د.ع.") };
  });

  try {
    const result = await runAgent(
      { provider: "openai", key: "k", baseUrl: mock.base, model: "test" },
      SYSTEM,
      [],
      "منو أكثر زبون عليه دين؟",
      db.run,
    );

    assert(result.answer.includes("450,000"));
    assertEquals(result.mode, "data");
    assert(result.steps[0].error, "الحارس لازم يرفض الاسم المستعار net");
    assertEquals(db.calls.length, 1, "الاستعلام المرفوض ما يوصل لقاعدة البيانات");
    assertEquals(result.steps[1].rows, 2);
    assertEquals(result.rows.length, 2);

    const toolMessages = mock.seen[2].body.messages.filter((m: any) => m.role === "tool");
    assertEquals(toolMessages.map((m: any) => m.tool_call_id), ["c1", "c2"]);
  } finally {
    await mock.close();
  }
});

Deno.test("Anthropic: كتل tool_use / tool_result بالصيغة الصحيحة", async () => {
  const db = recordingRunSql();
  const mock = mockProvider((_body, turn) => {
    if (turn === 0) {
      return {
        status: 200,
        json: {
          content: [
            { type: "text", text: "أشوفلك" },
            { type: "tool_use", id: "tu1", name: "run_sql", input: { sql: "SELECT name FROM customers LIMIT 5" } },
          ],
        },
      };
    }
    return { status: 200, json: { content: [{ type: "text", text: "عدنا زبونين بديون." }] } };
  });

  try {
    const result = await runAgent(
      { provider: "anthropic", key: "k", baseUrl: mock.base, model: "test" },
      SYSTEM,
      [],
      "شكد زبون عليه دين؟",
      db.run,
    );
    assert(result.answer.includes("زبونين"));
    const messages = mock.seen[1].body.messages;
    const block = messages[messages.length - 1].content[0];
    assertEquals(block.type, "tool_result");
    assertEquals(block.tool_use_id, "tu1");
    assertEquals(mock.seen[0].body.tools[0].input_schema.type, "object");
  } finally {
    await mock.close();
  }
});

Deno.test("Gemini: functionCall / functionResponse بالصيغة الصحيحة", async () => {
  const db = recordingRunSql();
  const mock = mockProvider((_body, turn) => {
    if (turn === 0) {
      return {
        status: 200,
        json: {
          candidates: [{
            content: {
              parts: [{ functionCall: { name: "run_sql", args: { sql: "SELECT name FROM customers LIMIT 3" } } }],
            },
          }],
        },
      };
    }
    return { status: 200, json: { candidates: [{ content: { parts: [{ text: "تمام، عدنا اثنين." }] } }] } };
  });

  try {
    const result = await runAgent(
      { provider: "gemini", key: "k", baseUrl: mock.base, model: "test" },
      SYSTEM,
      [],
      "عدد المدينين؟",
      db.run,
    );
    assert(result.answer.includes("اثنين"));
    assert(mock.seen[1].body.contents.at(-1).parts[0].functionResponse);
    assertEquals(mock.seen[0].body.tools[0].functionDeclarations[0].name, "run_sql");
  } finally {
    await mock.close();
  }
});

Deno.test("نموذج بلا دعم أدوات: ارتداد إلى البروتوكول النصّي", async () => {
  const db = recordingRunSql();
  const mock = mockProvider((body, turn) => {
    if (body.tools) {
      return { status: 400, json: { error: { message: "tools is not supported by this model" } } };
    }
    if (turn === 1) {
      return { status: 200, json: say("```sql\nSELECT name, balance FROM customers LIMIT 5\n```") };
    }
    return { status: 200, json: say("أكو زبونين عليهم ديون.") };
  });

  try {
    const result = await runAgent(
      { provider: "groq", key: "k", baseUrl: mock.base, model: "test" },
      SYSTEM,
      [],
      "منو المدينين؟",
      db.run,
    );
    assertEquals(result.toolMode, "text");
    assertEquals(result.steps.length, 1);
    assertEquals(result.steps[0].rows, 2);
    assert(result.answer.includes("زبونين"));
    assert(String(mock.seen[1].body.messages[0].content).includes("```sql"));
  } finally {
    await mock.close();
  }
});

Deno.test("دردشة: لا استعلام ولا لمس لقاعدة البيانات", async () => {
  const db = recordingRunSql();
  const mock = mockProvider(() => ({ status: 200, json: say("هلا بيك، شنو تحتاج؟") }));
  try {
    const result = await runAgent(
      { provider: "openai", key: "k", baseUrl: mock.base, model: "test" },
      SYSTEM,
      [],
      "السلام عليكم",
      db.run,
    );
    assertEquals(result.mode, "chat");
    assertEquals(result.steps.length, 0);
    assertEquals(db.calls.length, 0);
  } finally {
    await mock.close();
  }
});

Deno.test("تصحيح ذاتي: خطأ SQL يعود للنموذج فيصلّحه", async () => {
  const db = recordingRunSql();
  const mock = mockProvider((_body, turn) => {
    if (turn === 0) return { status: 200, json: toolCall("e1", "SELECT * FROM broken_table") };
    if (turn === 1) return { status: 200, json: toolCall("e2", "SELECT name FROM customers LIMIT 2") };
    return { status: 200, json: say("تمام، لكيت النتيجة.") };
  });

  try {
    const result = await runAgent(
      { provider: "openai", key: "k", baseUrl: mock.base, model: "test" },
      SYSTEM,
      [],
      "جرّب",
      db.run,
    );
    assert(result.steps[0].error);
    assertEquals(result.steps[1].rows, 2);
    const toolMessage = mock.seen[1].body.messages.find((m: any) => m.role === "tool");
    assert(String(toolMessage.content).includes("broken_table"));
  } finally {
    await mock.close();
  }
});

Deno.test("سقف الخطوات: 4 استعلامات ثم جواب نهائي بلا أدوات", async () => {
  const db = recordingRunSql();
  const mock = mockProvider((_body, turn) =>
    turn < 4
      ? { status: 200, json: toolCall(`x${turn}`, "SELECT name FROM customers LIMIT 1") }
      : { status: 200, json: say("هذا اللي طلع عندي.") }
  );

  try {
    const result = await runAgent(
      { provider: "openai", key: "k", baseUrl: mock.base, model: "test" },
      SYSTEM,
      [],
      "دور بلا نهاية",
      db.run,
    );
    assertEquals(result.steps.length, 4);
    assert(result.answer.includes("طلع عندي"));
    assertEquals(mock.seen[4].body.tools, undefined);
  } finally {
    await mock.close();
  }
});

Deno.test("حارس الاستعلام يرفض كل ما هو خارج القراءة", () => {
  assert("reason" in guardSql("UPDATE customers SET balance = 0"));
  assert("reason" in guardSql("SELECT 1; DROP TABLE customers"));
  assert("reason" in guardSql("SELECT * FROM vault.secrets"));
  assert("reason" in guardSql("SELECT a FROM invoices net"));
  assert("reason" in guardSql("SELECT pin_hash FROM employees"));
  assert("reason" in guardSql(""));
  assertEquals((guardSql("SELECT 1;") as { sql: string }).sql, "SELECT 1");
  assert("sql" in guardSql("WITH t1 AS (SELECT 1) SELECT * FROM t1"));
});

Deno.test("تطبيع السؤال", () => {
  assertEquals(normalizeQuestion("مبيعات ١٥ اب"), "مبيعات 15 اب");
  assertEquals(normalizeQuestion("ســلام"), "سلام");
  assertEquals(normalizeQuestion("  شكد   عليه  "), "شكد عليه");
});

Deno.test("التقاط SQL من النص", () => {
  assertEquals(extractSql("```sql\nSELECT 1\n```"), "SELECT 1");
  assertEquals(extractSql('{"sql":"SELECT 2"}'), "SELECT 2");
  assertEquals(extractSql("مبيعات اليوم 500,000 د.ع"), null);
});
