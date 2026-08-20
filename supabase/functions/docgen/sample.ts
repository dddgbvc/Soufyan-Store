// نموذج ثابت للاختبار الذاتي (/docgen/selftest).
// اختير محتواه عمداً ليغطّي كل الحالات التي كانت تنكسر سابقاً:
// أسماء عربية، أسماء منتجات مختلطة عربي/لاتيني/أرقام، أقواس، مبالغ كبيرة،
// أرقام هواتف، ونص طويل يحتاج لفّاً على سطرين.

export const SAMPLE_INVOICE = {
  ok: true,
  invoice: {
    number: "700113",
    customer_name: "محمد إبراهيم محمود",
    customer_phone: "07703099300",
    total: 2_845_000,
    paid: 1_500_000,
    delivery: 15_000,
    province: "صلاح الدين",
    payment_type: "DEBT",
    actor: "حسام",
    created_at: "2026/08/20",
    created_time: "08:47 PM",
  },
  items: [
    { name: "iPhone 15 Pro Max 256GB (أسود تيتانيوم)", qty: 1, unit_price: 1_850_000, discount: 0, total: 1_850_000 },
    { name: "Samsung Galaxy A55 256GB", qty: 1, unit_price: 565_000, discount: 15_000, total: 550_000 },
    { name: "سماعة بلوتوث JBL Tune 510", qty: 2, unit_price: 75_000, discount: 0, total: 150_000 },
    { name: "كيبل Type-C سريع 1م", qty: 5, unit_price: 10_000, discount: 0, total: 50_000 },
    { name: "شاحن سريع 65W", qty: 3, unit_price: 45_000, discount: 5_000, total: 130_000 },
    { name: "واقي شاشة زجاجي مقاوم للكسر — تركيب مجاني داخل المحل", qty: 5, unit_price: 5_000, discount: 0, total: 25_000 },
    { name: "باور بانك 20000mAh", qty: 1, unit_price: 55_000, discount: 0, total: 55_000 },
    { name: "كفر سيليكون iPhone 15", qty: 5, unit_price: 8_000, discount: 0, total: 40_000 },
    { name: "Nokia 106 كيبورد", qty: 1, unit_price: 42_000, discount: 0, total: 42_000 },
  ],
  meta: {
    generated_at: "2026/08/20",
    generated_time: "08:50 PM",
    actor: "سفيان (مدير عام)",
  },
};

export const SAMPLE_STATEMENT = {
  ok: true,
  customer: {
    id: "00000000-0000-0000-0000-000000000000",
    name: "علي حسن الدليمي",
    phone: "07701234501",
    address: "سامراء — الحويش — قرب جامع الإمام",
    balance: 450_000,
  },
  transactions: [
    { dt: "2026-08-18T17:47:47Z", kind: "بيع دين", details: "فاتورة 700112", amount: 348_000, actor: "سفيان" },
    { dt: "2026-08-14T10:12:00Z", kind: "تسديد", details: "دفعة نقدية", amount: -200_000, actor: "حسام" },
    { dt: "2026-08-09T13:05:00Z", kind: "بيع دين", details: "فاتورة 700104 — Samsung Galaxy A55 256GB", amount: 565_000, actor: "سفيان" },
    { dt: "2026-08-02T09:40:00Z", kind: "سماح مالي", details: "خصم مجاملة (زبون قديم)", amount: -25_000, actor: "سفيان" },
    { dt: "2026-07-28T18:20:00Z", kind: "تسديد كامل", details: "تصفير حساب شهر تموز", amount: -238_000, actor: "حسام" },
  ],
  meta: {
    generated_at: "2026/08/20",
    generated_time: "08:50 PM",
    actor: "سفيان (مدير عام)",
  },
};
