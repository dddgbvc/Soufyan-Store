/**
 * لوحة التحكّم التجريبية داخل شاشة الزبون.
 *
 * مخفية افتراضيًا — ليست جزءًا من تجربة الزبون. تُفتح بمفتاح D أو بالرابط
 * ‎?demo=1‎ وتتيح تجربة كل الحالات دون أي واجهة خلفية.
 * كل تغيير يُبثّ أيضًا على القناة، فتتحدّث أي شاشة أخرى مفتوحة في الوقت نفسه.
 */

import { el, svg, setData } from '../core/dom.js';
import { ICONS } from '../ui/icons.js';
import { createSaleEngine, runScriptedDemo } from './sale-engine.js';

export function createDemoDock({ store, transport, theme, config, autoplay = false }) {
  const engine = createSaleEngine({
    onChange(session) {
      store.replace(session);
      transport.send('session', session);
    },
  });

  let stopScript = null;

  const button = (label, iconName, onClick, variant = '') =>
    el(
      'button',
      { class: `btn btn--sm ${variant}`.trim(), type: 'button', onClick },
      [iconName ? svg(ICONS[iconName]) : null, el('span', { text: label })],
    );

  // --- صف السلة -----------------------------------------------------------
  const cartRow = el('div', { class: 'demo-row' }, [
    el('span', { class: 'demo-row__label', text: 'السلة' }),
    button('إضافة منتج', 'plus', () => engine.addRandomProduct(), 'btn--primary'),
    button('حذف آخر منتج', null, () => engine.removeLast()),
    button('+ كمية', null, () => bumpLast(+1)),
    button('− كمية', null, () => bumpLast(-1)),
    button('فاتورة جاهزة', 'cart', () => engine.loadSampleBasket()),
  ]);

  function bumpLast(delta) {
    const last = engine.session.items.at(-1);
    if (last) engine.bumpQty(last.id, delta);
  }

  // --- صف المبالغ ---------------------------------------------------------
  const discountInput = el('input', {
    type: 'number',
    min: '0',
    step: '1000',
    value: '0',
    'aria-label': 'قيمة الخصم',
  });
  discountInput.addEventListener('input', () => engine.setDiscount(discountInput.value));

  const paidInput = el('input', {
    type: 'number',
    min: '0',
    step: '5000',
    value: '0',
    'aria-label': 'المبلغ المدفوع',
  });
  paidInput.addEventListener('input', () => engine.setPaid(paidInput.value));

  const taxToggle = el('button', { class: 'btn btn--sm', type: 'button' }, [
    el('span', { text: 'تفعيل الضريبة ١٥٪' }),
  ]);
  taxToggle.addEventListener('click', () => {
    const enabled = engine.session.taxRate !== null;
    engine.setTaxRate(enabled ? null : 15);
    taxToggle.querySelector('span').textContent = enabled ? 'تفعيل الضريبة ١٥٪' : 'إلغاء الضريبة';
  });

  const amountsRow = el('div', { class: 'demo-row' }, [
    el('span', { class: 'demo-row__label', text: 'المبالغ' }),
    el('label', { class: 'field' }, [el('span', { text: 'خصم' }), discountInput]),
    button('خصم ٥٪', null, () => {
      engine.setDiscountPercent(5);
      discountInput.value = String(engine.session.discount);
    }, 'btn--gold'),
    el('label', { class: 'field' }, [el('span', { text: 'مدفوع' }), paidInput]),
    taxToggle,
  ]);

  // --- صف الحالات ---------------------------------------------------------
  const statesRow = el('div', { class: 'demo-row' }, [
    el('span', { class: 'demo-row__label', text: 'الحالة' }),
    button('بدء الدفع', 'card', () => engine.startPayment(), 'btn--primary'),
    button('إتمام الدفع', 'check', () => {
      engine.completePayment(Number(paidInput.value) || undefined);
    }, 'btn--primary'),
    button('تعليق', 'pause', () => engine.holdPayment()),
    button('إلغاء', 'slash', () => engine.cancelPayment(), 'btn--danger'),
    button('خطأ', 'alert', () => engine.raiseError('انقطع الاتصال بخادم نقطة البيع'), 'btn--danger'),
    button('اتصال', 'link', () => engine.setStatus('loading')),
    button('إعادة ضبط', 'refresh', () => {
      discountInput.value = '0';
      paidInput.value = '0';
      engine.reset();
    }),
  ]);

  // --- صف العرض -----------------------------------------------------------
  const themeButton = el('button', { class: 'btn btn--sm', type: 'button' }, [
    svg(ICONS.moon),
    el('span', { text: 'تبديل المظهر' }),
  ]);
  themeButton.addEventListener('click', () => {
    const resolved = theme.toggle();
    themeButton.replaceChildren(
      svg(resolved === 'dark' ? ICONS.sun : ICONS.moon),
      el('span', { text: resolved === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن' }),
    );
  });

  const scriptButton = el('button', { class: 'btn btn--sm', type: 'button' }, [
    svg(ICONS.play),
    el('span', { text: 'عرض تلقائي' }),
  ]);
  scriptButton.addEventListener('click', () => toggleScript());

  function toggleScript(force) {
    const shouldRun = force ?? stopScript === null;
    if (!shouldRun) {
      stopScript?.();
      stopScript = null;
      scriptButton.replaceChildren(svg(ICONS.play), el('span', { text: 'عرض تلقائي' }));
      return;
    }
    stopScript = runScriptedDemo(engine);
    scriptButton.replaceChildren(svg(ICONS.pause), el('span', { text: 'إيقاف العرض' }));
  }

  const viewRow = el('div', { class: 'demo-row' }, [
    el('span', { class: 'demo-row__label', text: 'العرض' }),
    themeButton,
    scriptButton,
    el('a', { class: 'btn btn--sm', href: 'cashier-demo.html', target: '_blank', rel: 'noopener' }, [
      svg(ICONS.sliders),
      el('span', { text: 'فتح محاكي الكاشير' }),
    ]),
  ]);

  // --- الهيكل -------------------------------------------------------------
  const closeButton = el('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, [
    el('span', { text: 'إخفاء (D)' }),
  ]);

  const root = el('div', { class: 'demo-dock', role: 'region', 'aria-label': 'لوحة التحكّم التجريبية' }, [
    el('div', { class: 'demo-dock__head' }, [
      el('div', { class: 'demo-dock__title' }, [svg(ICONS.sliders), el('span', { text: 'الوضع التجريبي' })]),
      closeButton,
    ]),
    el('div', { class: 'demo-dock__rows' }, [cartRow, amountsRow, statesRow, viewRow]),
  ]);

  closeButton.addEventListener('click', () => setOpen(false));

  let open = false;

  function setOpen(next) {
    open = next;
    setData(root, 'open', open);
    root.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  setOpen(false);

  // مفتاح D للفتح/الإغلاق — يُتجاهل أثناء الكتابة داخل الحقول
  globalThis.addEventListener('keydown', (event) => {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (event.key === 'd' || event.key === 'D' || event.key === 'د') {
      event.preventDefault();
      setOpen(!open);
    } else if (event.key === 'Escape' && open) {
      setOpen(false);
    }
  });

  if (autoplay) toggleScript(true);

  return {
    root,
    engine,
    open: () => setOpen(true),
    close: () => setOpen(false),
    get isOpen() {
      return open;
    },
  };
}
