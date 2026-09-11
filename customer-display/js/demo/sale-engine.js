/**
 * محرّك عملية بيع — يحاكي ما يفعله الكاشير الحقيقي.
 *
 * يستخدمه كلٌّ من الوضع التجريبي داخل الشاشة ومحاكي الكاشير، فيبقى السلوك
 * واحدًا في الاثنين. في الإنتاج يُستبدل هذا الملف بنظام الكاشير الفعلي، بينما
 * تبقى شاشة الزبون كما هي تمامًا لأنها تتعامل مع الجلسة لا مع المحرّك.
 */

import { createEmptySession, normalizeSession } from '../data/session-schema.js';
import { generateInvoiceNumber } from '../core/format.js';
import { summarize } from '../core/selectors.js';
import { DEMO_BASKET, DEMO_CATALOG, findProduct } from '../data/demo-data.js';

let lineCounter = 0;

export function createSaleEngine({ onChange } = {}) {
  let session = createEmptySession();

  function commit(next) {
    session = normalizeSession(next);
    onChange?.(session);
    return session;
  }

  function withItems(items, extra = {}) {
    return commit({ ...session, items, ...extra });
  }

  const api = {
    get session() {
      return session;
    },

    /** يضيف صنفًا. إذا كان موجودًا أصلًا تزيد كميته بدل تكرار السطر. */
    addProduct(sku, qty = 1) {
      const product = findProduct(sku);
      if (!product) return session;

      const existing = session.items.find((item) => item.id.startsWith(`${sku}#`));
      if (existing) return api.setQty(existing.id, existing.qty + qty);

      const item = {
        id: `${sku}#${++lineCounter}`,
        name: product.name,
        variant: product.variant,
        qty,
        unitPrice: product.unitPrice,
        lineDiscount: 0,
        imageUrl: product.imageUrl ?? null,
      };
      return withItems([...session.items, item], { status: 'browsing' });
    },

    /** يضيف صنفًا عشوائيًا من الكتالوج — زر واحد في الوضع التجريبي. */
    addRandomProduct() {
      const pool = DEMO_CATALOG.filter(
        (product) => !session.items.some((item) => item.id.startsWith(`${product.sku}#`)),
      );
      const source = pool.length > 0 ? pool : DEMO_CATALOG;
      const pick = source[Math.floor(Math.random() * source.length)];
      return api.addProduct(pick.sku);
    },

    removeItem(id) {
      return withItems(session.items.filter((item) => item.id !== id));
    },

    /** يحذف آخر صنف — اختصار مفيد في العرض التجريبي. */
    removeLast() {
      if (session.items.length === 0) return session;
      return api.removeItem(session.items.at(-1).id);
    },

    setQty(id, qty) {
      const next = Math.max(0, Math.round(qty));
      if (next === 0) return api.removeItem(id);
      return withItems(
        session.items.map((item) => (item.id === id ? { ...item, qty: next } : item)),
      );
    },

    bumpQty(id, delta) {
      const item = session.items.find((entry) => entry.id === id);
      if (!item) return session;
      return api.setQty(id, item.qty + delta);
    },

    /** خصم على مستوى الفاتورة (بالمبلغ). */
    setDiscount(amount) {
      return commit({ ...session, discount: Math.max(0, Number(amount) || 0) });
    },

    /** خصم بنسبة مئوية من المجموع الفرعي. */
    setDiscountPercent(percent) {
      const { subtotal } = summarize(session);
      return api.setDiscount(Math.round((subtotal * Math.max(0, percent)) / 100));
    },

    setTaxRate(rate) {
      const value = rate === null || rate === '' ? null : Math.max(0, Number(rate) || 0);
      return commit({ ...session, taxRate: value });
    },

    setPaid(amount) {
      return commit({ ...session, paid: Math.max(0, Number(amount) || 0) });
    },

    /** بدء الدفع — الشاشة تنتقل إلى حالة «جاري إتمام عملية الدفع». */
    startPayment() {
      if (session.items.length === 0) return session;
      return commit({
        ...session,
        status: 'paying',
        invoiceNumber: session.invoiceNumber ?? generateInvoiceNumber(),
      });
    },

    /** إتمام الدفع. عند عدم تمرير مبلغ يُعتبر المدفوع مساويًا للإجمالي. */
    completePayment(paidAmount) {
      if (session.items.length === 0) return session;
      const { total } = summarize(session);
      const paid = paidAmount === undefined ? Math.max(session.paid, total) : Number(paidAmount);
      return commit({
        ...session,
        status: 'paid',
        paid,
        invoiceNumber: session.invoiceNumber ?? generateInvoiceNumber(),
      });
    },

    /** تعليق العملية — تبقى محفوظة بانتظار إتمام الدفع. */
    holdPayment() {
      if (session.items.length === 0) return session;
      return commit({
        ...session,
        status: 'held',
        invoiceNumber: session.invoiceNumber ?? generateInvoiceNumber(),
      });
    },

    cancelPayment(message) {
      return commit({ ...session, status: 'cancelled', paid: 0, message: message ?? null });
    },

    raiseError(message) {
      return commit({ ...session, status: 'error', message: message ?? 'خطأ غير متوقّع' });
    },

    setStatus(status, message) {
      return commit({ ...session, status, message: message ?? null });
    },

    /** يملأ فاتورة جاهزة لعرض الشاشة بسرعة. */
    loadSampleBasket() {
      commit(createEmptySession());
      for (const entry of DEMO_BASKET) api.addProduct(entry.sku, entry.qty);
      return api.setDiscount(20_000);
    },

    reset() {
      lineCounter = 0;
      return commit(createEmptySession());
    },

    /** يستبدل الجلسة بالكامل — يُستخدم عند مزامنة محاكي الكاشير مع شاشة أخرى. */
    load(next) {
      return commit(next);
    },
  };

  return api;
}

/**
 * عرض تلقائي مُخرَج بالكامل: يضيف أصنافًا، يعدّل كمية، يطبّق خصمًا،
 * يبدأ الدفع، ثم ينهيه — ثم يعيد الكرّة. مفيد لشاشة عرض في المعرض.
 * @returns {() => void} دالة إيقاف
 */
export function runScriptedDemo(engine, { loop = true } = {}) {
  let cancelled = false;
  /** @type {number[]} */
  const timers = [];

  const wait = (ms) =>
    new Promise((resolve) => {
      timers.push(globalThis.setTimeout(resolve, ms));
    });

  (async function play() {
    while (!cancelled) {
      engine.reset();
      await wait(2200);
      if (cancelled) return;

      engine.addProduct('p002');
      await wait(1600);
      engine.addProduct('c001', 2);
      await wait(1500);
      engine.addProduct('a007');
      await wait(1700);

      engine.setDiscountPercent(2);
      await wait(1800);

      engine.startPayment();
      await wait(2600);

      engine.completePayment();
      await wait(6000);

      if (!loop) return;
    }
  })();

  return () => {
    cancelled = true;
    for (const timer of timers) globalThis.clearTimeout(timer);
  };
}
