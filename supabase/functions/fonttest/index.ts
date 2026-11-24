// معطّلة عمداً — مراجعة أمنية ٢٠٢٦-٠٨-٢٥
//
// كانت نقطة تجريبية متروكة لفحص تشكيل الخط العربي بـPDF: بلا مصادقة، وكل
// نداء ينزّل خطاً من Google Fonts ويبني PDF. ما تلمس بيانات، بس هي حساب
// وترافيك مجاني للعامة بلا غرض إنتاجي. الاختبار المكافئ موجود بـ docgen/selftest.
//
// للحذف النهائي:
//   supabase functions delete fonttest

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  Response.json(
    { ok: false, error: "gone", detail: "نقطة تجريبية معطّلة بمراجعة أمنية — استعمل docgen/selftest." },
    { status: 410 },
  )
);
