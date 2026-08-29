// ============================================================================
// setup-invoice — معاينة قالب الفاتورة الموجود، مملوءة ببيانات معالج الإعداد
// ----------------------------------------------------------------------------
// هذه الدالة **لا تصمّم فاتورة جديدة**. هي تستورد قالب الفاتورة نفسه الذي
// يستعمله `docgen` في الإنتاج — `buildInvoice` من documents.ts و
// `buildDocumentPdf` من pdf.ts — مثبّتين على نفس الـ commit الذي نُشر منه
// docgen، فيبقى القالب مصدر الحقيقة الوحيد وأي تعديل عليه ينعكس هنا.
//
//   POST { store, invoice, items }  ⇒  application/pdf
//   GET  /                          ⇒  نفس القالب بالنموذج الثابت (تشخيص)
//
// لا تقرأ الدالة أي بيانات ولا تكتب أي شيء: هي دالة عرض صِرفة، بلا مفتاح
// خدمة وبلا وصول إلى قاعدة البيانات.
// ============================================================================

import {
  buildInvoice,
  type BuiltDocument,
} from "https://raw.githubusercontent.com/dddgbvc/Soufyan-Store/810bde88726bdede3e99278227e2bc1697eb2f12/supabase/functions/docgen/documents.ts";
import {
  buildDocumentPdf,
  type StoreInfo,
} from "https://raw.githubusercontent.com/dddgbvc/Soufyan-Store/810bde88726bdede3e99278227e2bc1697eb2f12/supabase/functions/docgen/pdf.ts";
import { SAMPLE_INVOICE } from "https://raw.githubusercontent.com/dddgbvc/Soufyan-Store/810bde88726bdede3e99278227e2bc1697eb2f12/supabase/functions/docgen/sample.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,authorization,apikey,x-client-info",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

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

async function render(built: BuiltDocument, store: StoreInfo, filename: string): Promise<Response> {
  const pdf = await buildDocumentPdf(built.pdf, store);
  return new Response(pdf, {
    headers: {
      ...CORS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // تشخيص: القالب نفسه بالنموذج الثابت، بلا أي بيانات من المعالج.
    if (req.method === "GET") {
      return await render(buildInvoice(SAMPLE_INVOICE), TEMPLATE_STORE, "template-sample.pdf");
    }

    if (req.method !== "POST") {
      return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405, headers: CORS });
    }

    const body = await req.json().catch(() => ({}));
    const store = storeFrom(body?.store);
    const built = buildInvoice(invoiceDataFrom(body));
    return await render(built, store, "setup-invoice-preview.pdf");
  } catch (e) {
    console.error("setup-invoice:", e);
    return Response.json(
      { ok: false, error: "render_failed", detail: String(e).slice(0, 300) },
      { status: 500, headers: CORS },
    );
  }
});
