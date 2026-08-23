// اختبارات محرّك الاتجاه.
// شغّلها بـ: deno test --allow-net supabase/functions/docgen/rtl_test.ts
//
// الفكرة: نقارن ما سيُرسم فعلاً بالمرجع القياسي getReorderedString من bidi-js
// (الذي ينفّذ إعادة الترتيب L2 وقاعدة المرآة L4 معاً). إن تطابقا فالسطر
// سيظهر في الـ PDF كما يظهر في أي متصفّح.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import bidiFactory from "https://esm.sh/bidi-js@1.0.3";
import { visualRuns } from "./rtl.ts";

const bidi = (bidiFactory as unknown as () => any)();

/** نفس الشرط الذي يجعل fontkit يعكس المقطع داخل pdf-lib. */
const FONTKIT_RTL =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const CONTROLS = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

const reverse = (s: string) => Array.from(s).reverse().join("");

/** الترتيب البصري الفعلي بعد أن يعكس fontkit المقاطع اليمينية. */
function rendered(text: string): string {
  return visualRuns(text)
    .map((run) => (FONTKIT_RTL.test(run.text) ? reverse(run.text) : run.text))
    .join("");
}

function reference(text: string): string {
  const levels = bidi.getEmbeddingLevels(text, "rtl");
  return bidi.getReorderedString(text, levels).replace(CONTROLS, "");
}

const CASES = [
  "الرصيد 1,750,000 د.ع",
  "الرصيد 1,750,000 IQD",
  "فاتورة بيع رقم 700113",
  "iPhone 15 Pro Max 256GB (أسود تيتانيوم)",
  "سماعة بلوتوث JBL Tune 510",
  "كيبل Type-C سريع 1م",
  "نوع الدفع: آجل (دين)",
  "07731644450  /  07744485771",
  "الهاتف: 07703099300",
  "\u2066-238,000\u2069",
  "صفحة 2 من 3",
  "التاريخ 2026/08/20",
  "واقي شاشة زجاجي مقاوم للكسر — تركيب مجاني داخل المحل",
  "أنجز بواسطة: سفيان (مدير عام)",
  "خدمة الإنترنت: 07729096991",
  "Samsung Galaxy A55 256GB",
  "المتبقي 1,345,000 د.ع",
  "بذمّته 450,000 د.ع",
  "٤٥٠٫٠٠٠ دينار",
  "مكتب سفيان للموبايل · نظام إدارة المحل",
];

Deno.test("الترتيب البصري يطابق مرجع UAX#9", () => {
  for (const text of CASES) {
    assertEquals(rendered(text), reference(text), `فشل على: ${text}`);
  }
});

Deno.test("الأرقام لا تنقلب داخل النص العربي", () => {
  // كانت هذه بالضبط علّة النسخة السابقة: 1,750,000 تُرسم 000,057,1
  const runs = visualRuns("الرصيد 1,750,000 د.ع");
  const digits = runs.find((r) => /\d/.test(r.text));
  assertEquals(digits?.text, "1,750,000");
  assertEquals(digits?.rtl, false);
});

Deno.test("الإشارة السالبة تبقى يسار الرقم داخل عازل LTR", () => {
  const runs = visualRuns("\u2066-238,000\u2069");
  assertEquals(runs.length, 1);
  assertEquals(runs[0].text, "-238,000");
});

Deno.test("الأقواس تنعكس حسب القاعدة L4", () => {
  assertEquals(rendered("(دين)"), reference("(دين)"));
});

Deno.test("عشوائي: 5000 سلسلة مختلطة تطابق المرجع", () => {
  const alphabet = [
    ...("ابتثجحخدذرزسشصضطظعغفقكلمنهوي"),
    ...("abcXYZ"),
    ...("0123456789"),
    ...("٠١٢٣٤٥٦٧٨٩"),
    " ", " ", ".", ",", ":", "-", "/", "(", ")", "[", "]", "«", "»", "—", "%", "+", "#",
    "\u200F", "\u2066", "\u2069", "\u202B", "\u202C",
  ];
  for (let i = 0; i < 5000; i++) {
    const length = 1 + Math.floor(Math.random() * 24);
    let s = "";
    for (let j = 0; j < length; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    assertEquals(rendered(s), reference(s), `فشل على: ${JSON.stringify(s)}`);
  }
});
