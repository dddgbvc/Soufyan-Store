// ============================================================================
// setup-invoice — معاينة قالب الفاتورة الموجود، مملوءة ببيانات معالج الإعداد
// ----------------------------------------------------------------------------
// هذه الدالة **لا تصمّم فاتورة جديدة**. هي تستورد قالب الفاتورة نفسه الذي
// يستعمله `docgen` في الإنتاج — `buildInvoice` من documents.ts و
// `buildDocumentPdf` من pdf.ts — مثبّتين على نفس الـ commit الذي نُشر منه
// docgen، فيبقى القالب مصدر الحقيقة الوحيد وأي تعديل عليه ينعكس هنا.
//
//   POST { store, invoice, items }  ⇒  application/pdf
//
// لا تقرأ الدالة أي بيانات ولا تكتب أي شيء: هي دالة عرض صِرفة، بلا مفتاح
// خدمة وبلا وصول إلى قاعدة البيانات.
//
// ما تغيّر في V7 (عقد POST لم يتغيّر بأي حرف):
//   1) CORS بقائمة سماح صريحة بدل "*".
//   2) حُذف مسار GET التشخيصي الذي كان يُصدر PDF نموذجيًا لأي مستدعٍ.
//   3) لم يعد نصّ الاستثناء الداخلي يُعاد إلى العميل.
//   4) حدّ صريح لحجم الحمولة قبل تحليلها.
// ============================================================================

import {
  buildInvoice,
  type BuiltDocument,
} from "https://raw.githubusercontent.com/dddgbvc/Soufyan-Store/810bde88726bdede3e99278227e2bc1697eb2f12/supabase/functions/docgen/documents.ts";
import {
  buildDocumentPdf,
  type StoreInfo,
} from "https://raw.githubusercontent.com/dddgbvc/Soufyan-Store/810bde88726bdede3e99278227e2bc1697eb2f12/supabase/functions/docgen/pdf.ts";

// ---------------------------------------------------------------------------
// CORS — قائمة سماح. اضبط SETUP_ALLOWED_ORIGINS بنطاق التشغيل الحقيقي.
// افتراضيًا تُسمح عناوين التطوير المحلية وحدها؛ فتح index.html من file://
// يرسل Origin: null ولا يُسمح به، وتظهر حالة الخطأ المصمَّمة مع إعادة محاولة.
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
  const ok = origin !== "" && origin !== "null" && allow.includes(origin);
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "content-type,authorization,apikey,x-client-info,x-terminal-id",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

const SEC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

const fail = (req: Request, error: string, status: number) =>
  Response.json({ ok: false, error }, {
    status,
    headers: { ...corsFor(req), ...SEC_HEADERS },
  });

/** القالب المرجعي — يُستعمل عندما لا يرسل المعالج قيمة لحقل ما. */
const TEMPLATE_STORE: StoreInfo = {
  name: "مكتب سفيان للموبايل",
  subtitle: "قسم المحاسبة والمالية",
  address: "صلاح الدين — سامراء — الحويش — الشارع الرئيسي",
  phones: ["07731644450", "07744485771"],
  internetPhone: "07729096991",
  footer: "مكتب سفيان للموبايل · نظام إدارة المحل",
};

/** حدود تحمي الدالة من حمولة ضخمة — المعاينة لا تحتاج أكثر من ذلك. */
const MAX_ITEMS = 40;
const MAX_LEN = 220;
const MAX_BODY_BYTES = 64 * 1024;

const text = (v: unknown, fallback = ""): string => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, MAX_LEN) : fallback;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-1e12, Math.min(1e12, n)) : 0;
};

function storeFrom(raw: any): StoreInfo {
  const phones = Array.isArray(raw?.phones)
    ? raw.phones.map((p: unknown) => text(p)).filter(Boolean).slice(0, 4)
    : [];
  return {
    name: text(raw?.name, TEMPLATE_STORE.name),
    subtitle: text(raw?.subtitle, TEMPLATE_STORE.subtitle),
    address: text(raw?.address, TEMPLATE_STORE.address),
    phones: phones.length ? phones : TEMPLATE_STORE.phones,
    internetPhone: text(raw?.internetPhone) || undefined,
    footer: text(raw?.footer, TEMPLATE_STORE.footer),
  };
}

function invoiceDataFrom(body: any) {
  const items = (Array.isArray(body?.items) ? body.items : []).slice(0, MAX_ITEMS).map((x: any) => ({
    name: text(x?.name, "—"),
    serials: text(x?.serials),
    qty: num(x?.qty),
    unit_price: num(x?.unit_price),
    discount: num(x?.discount),
    total: num(x?.total),
  }));
  const inv = body?.invoice ?? {};
  return {
    ok: true,
    invoice: {
      number: text(inv.number, "—"),
      customer_name: text(inv.customer_name),
      customer_phone: text(inv.customer_phone),
      payment_type: text(inv.payment_type, "CASH"),
      province: text(inv.province),
      notes: text(inv.notes),
      actor: text(inv.actor),
      created_at: text(inv.created_at) || new Date().toISOString(),
      created_time: text(inv.created_time) || new Date().toISOString(),
      total: num(inv.total),
      paid: num(inv.paid),
      delivery: num(inv.delivery),
    },
    items,
    meta: { actor: text(body?.meta?.actor) || text(inv.actor) },
  };
}

async function render(req: Request, built: BuiltDocument, store: StoreInfo, filename: string): Promise<Response> {
  const pdf = await buildDocumentPdf(built.pdf, store);
  return new Response(pdf, {
    headers: {
      ...corsFor(req),
      ...SEC_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(req) });

  // مسار GET التشخيصي أُزيل: كان يُصدر PDF لأي مستدعٍ بلا حمولة.
  if (req.method !== "POST") return fail(req, "method_not_allowed", 405);

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return fail(req, "payload_too_large", 413);

    let body: unknown;
    try { body = JSON.parse(raw || "{}"); } catch { return fail(req, "bad_json", 400); }

    const b = body as any;
    const store = storeFrom(b?.store);
    const built = buildInvoice(invoiceDataFrom(b));
    return await render(req, built, store, "setup-invoice-preview.pdf");
  } catch (e) {
    // التفصيل يبقى في سجلّ الدالة. العميل يرى رمزًا مغلقًا فقط.
    console.error("setup-invoice:", e);
    return fail(req, "render_failed", 500);
  }
});
