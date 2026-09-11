/**
 * محاكي شاشة الكاشير.
 *
 * الغرض منه إثبات أن الربط اللحظي يعمل فعلًا: كل نقرة هنا تصل إلى شاشة الزبون
 * خلال أجزاء من الثانية عبر القناة نفسها التي سيستخدمها نظام البيع الحقيقي.
 * عند ربط نظام الكاشير الفعلي يُستبدل هذا الملف — وشاشة الزبون لا تتغيّر إطلاقًا.
 */

import { CONFIG, applyUrlOverrides } from '../config.js';
import { configureFormatting, createAmountEl, formatQty } from '../core/format.js';
import { el, svg, setText } from '../core/dom.js';
import { summarize } from '../core/selectors.js';
import { createThemeSync } from '../theme/theme.js';
import { createTransport } from '../realtime/transport.js';
import { createSaleEngine } from './sale-engine.js';
import { DEMO_CATALOG } from '../data/demo-data.js';
import { ICONS, LOGO_SVG } from '../ui/icons.js';

const config = applyUrlOverrides(CONFIG);
configureFormatting(config.currency);

const theme = createThemeSync(config.theme).init();

// الكاشير يبثّ فقط؛ لا يحتاج استقبال جلسات من غيره.
const transport = createTransport(config.transport, {
  onSession() {},
  onPatch() {},
  onConnection(status) {
    setText(connectionLabel, CONNECTION_LABELS[status] ?? status);
  },
});

const CONNECTION_LABELS = {
  connecting: 'جارٍ الاتصال…',
  connected: 'متصل بشاشة الزبون',
  reconnecting: 'إعادة الاتصال…',
  disconnected: 'انقطع الاتصال',
  offline: 'لا يوجد ناقل متاح',
  error: 'خطأ في الاتصال',
};

const engine = createSaleEngine({
  onChange(session) {
    transport.send('session', session);
    renderTicket(session);
  },
});

// ---------------------------------------------------------------------------
// الرأس
// ---------------------------------------------------------------------------
const connectionLabel = el('span', { text: 'جارٍ الاتصال…' });

const openDisplayButton = el('button', { class: 'btn btn--primary', type: 'button' }, [
  svg(ICONS.link),
  el('span', { text: 'فتح شاشة الزبون' }),
]);
openDisplayButton.addEventListener('click', () => {
  globalThis.open('index.html', 'yaqoot-customer-display', 'width=1280,height=720');
});

const themeButton = el('button', { class: 'btn', type: 'button' }, [
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

const head = el('header', { class: 'pos__head' }, [
  el('div', { class: 'pos__title' }, [
    svg(LOGO_SVG),
    el('div', {}, [
      el('h1', { text: 'محاكي الكاشير' }),
      el('p', { text: `${config.store.name} — لوحة تجريبية لقيادة شاشة الزبون` }),
    ]),
  ]),
  el('div', { class: 'pos__actions' }, [openDisplayButton, themeButton]),
]);

// ---------------------------------------------------------------------------
// الكتالوج
// ---------------------------------------------------------------------------
const catalog = el(
  'div',
  { class: 'catalog' },
  DEMO_CATALOG.map((product) =>
    el('button', { class: 'product', type: 'button', onClick: () => engine.addProduct(product.sku) }, [
      el('span', { class: 'product__name', text: product.name }),
      el('span', { class: 'product__variant', text: product.variant }),
      el('span', { class: 'product__price' }, [createAmountEl(product.unitPrice)]),
    ]),
  ),
);

// ---------------------------------------------------------------------------
// الفاتورة
// ---------------------------------------------------------------------------
const ticket = el('div', { class: 'ticket' });

function renderTicket(session) {
  const s = summarize(session);

  if (session.items.length === 0) {
    ticket.replaceChildren(
      el('div', { class: 'ticket__empty', text: 'اضغط على أي منتج لإضافته إلى الفاتورة' }),
    );
  } else {
    ticket.replaceChildren(
      ...session.items.map((item) =>
        el('div', { class: 'ticket-row' }, [
          el('div', {}, [
            el('div', { class: 'ticket-row__name', text: item.name }),
            el('div', { class: 'ticket-row__variant', text: item.variant ?? '' }),
          ]),
          el('div', { class: 'ticket-row__stepper' }, [
            el('button', {
              class: 'stepper-btn',
              type: 'button',
              'aria-label': `إنقاص كمية ${item.name}`,
              text: '−',
              onClick: () => engine.bumpQty(item.id, -1),
            }),
            el('span', { class: 'ticket-row__qty', text: formatQty(item.qty) }),
            el('button', {
              class: 'stepper-btn',
              type: 'button',
              'aria-label': `زيادة كمية ${item.name}`,
              text: '+',
              onClick: () => engine.bumpQty(item.id, +1),
            }),
          ]),
          el('div', { class: 'ticket-row__total' }, [
            createAmountEl(item.qty * item.unitPrice - (item.lineDiscount || 0)),
          ]),
          el('button', {
            class: 'ticket-row__remove',
            type: 'button',
            'aria-label': `حذف ${item.name}`,
            text: 'حذف',
            onClick: () => engine.removeItem(item.id),
          }),
        ]),
      ),
    );
  }

  moneyRows.subtotal.replaceChildren(createAmountEl(s.subtotal));
  moneyRows.discount.replaceChildren(createAmountEl(s.discountTotal));
  moneyRows.tax.replaceChildren(createAmountEl(s.taxAmount));
  moneyRows.taxRow.hidden = !s.taxRate;
  moneyRows.total.replaceChildren(createAmountEl(s.total));
  moneyRows.due.replaceChildren(createAmountEl(s.change > 0 ? s.change : s.due));
  setText(moneyRows.dueLabel, s.change > 0 ? 'الباقي للزبون' : 'المتبقي');

  setText(statusLabel, STATUS_LABELS[session.status] ?? session.status);
}

const STATUS_LABELS = {
  loading: 'جارٍ الاتصال',
  idle: 'بانتظار عملية جديدة',
  browsing: 'الزبون يتصفّح مشترياته',
  paying: 'جاري إتمام الدفع',
  paid: 'تمت العملية بنجاح',
  held: 'العملية معلّقة',
  cancelled: 'أُلغيت العملية',
  error: 'حالة خطأ',
};

// ---------------------------------------------------------------------------
// المبالغ
// ---------------------------------------------------------------------------
function moneyRow(label, modifier = '') {
  const value = el('span', {});
  const labelEl = el('span', { class: 'money-row__label', text: label });
  const root = el('div', { class: `money-row ${modifier}`.trim() }, [labelEl, value]);
  return { root, value, labelEl };
}

const subtotalRow = moneyRow('المجموع الفرعي');
const discountRow = moneyRow('الخصم');
const taxRow = moneyRow(`${config.tax.label} (١٥٪)`);
const totalRow = moneyRow('الإجمالي', 'money-row--total');
const dueRow = moneyRow('المتبقي');

const moneyRows = {
  subtotal: subtotalRow.value,
  discount: discountRow.value,
  tax: taxRow.value,
  taxRow: taxRow.root,
  total: totalRow.value,
  due: dueRow.value,
  dueLabel: dueRow.labelEl,
};

const discountInput = el('input', { type: 'number', min: '0', step: '1000', value: '0' });
discountInput.addEventListener('input', () => engine.setDiscount(discountInput.value));

const paidInput = el('input', { type: 'number', min: '0', step: '5000', value: '0' });
paidInput.addEventListener('input', () => engine.setPaid(paidInput.value));

const taxButton = el('button', { class: 'btn', type: 'button' }, [el('span', { text: 'تفعيل الضريبة ١٥٪' })]);
taxButton.addEventListener('click', () => {
  const enabled = engine.session.taxRate !== null;
  engine.setTaxRate(enabled ? null : 15);
  taxButton.querySelector('span').textContent = enabled ? 'تفعيل الضريبة ١٥٪' : 'إلغاء الضريبة';
});

// ---------------------------------------------------------------------------
// الحالات
// ---------------------------------------------------------------------------
const statusLabel = el('span', { text: 'بانتظار عملية جديدة' });

const actionButton = (label, iconName, handler, variant = '') =>
  el('button', { class: `btn ${variant}`.trim(), type: 'button', onClick: handler }, [
    svg(ICONS[iconName]),
    el('span', { text: label }),
  ]);

const controls = el('div', { class: 'control-grid' }, [
  actionButton('بدء الدفع', 'card', () => engine.startPayment(), 'btn--primary'),
  actionButton('إتمام الدفع', 'check', () => {
    engine.completePayment(Number(paidInput.value) || undefined);
  }, 'btn--primary'),
  actionButton('تعليق العملية', 'pause', () => engine.holdPayment()),
  actionButton('إلغاء العملية', 'slash', () => engine.cancelPayment(), 'btn--danger'),
  actionButton('حالة خطأ', 'alert', () => engine.raiseError('انقطع الاتصال بخادم نقطة البيع'), 'btn--danger'),
  actionButton('فاتورة جديدة', 'refresh', () => {
    discountInput.value = '0';
    paidInput.value = '0';
    taxButton.querySelector('span').textContent = 'تفعيل الضريبة ١٥٪';
    engine.reset();
  }),
]);

// ---------------------------------------------------------------------------
// التجميع
// ---------------------------------------------------------------------------
const body = el('div', { class: 'pos__body' }, [
  el('div', {}, [
    el('section', { class: 'card' }, [
      el('h2', { class: 'card__title' }, [
        el('span', { text: 'الكتالوج' }),
        el('span', { class: 'pill pill--neutral' }, [
          el('span', { class: 'pill__icon' }, [svg(ICONS.link)]),
          connectionLabel,
        ]),
      ]),
      catalog,
    ]),
    el('section', { class: 'card' }, [
      el('h2', { class: 'card__title' }, [
        el('span', { text: 'الفاتورة' }),
        el('span', { class: 'pill pill--primary' }, [
          el('span', { class: 'pill__icon' }, [svg(ICONS.receipt)]),
          statusLabel,
        ]),
      ]),
      ticket,
    ]),
  ]),
  el('div', {}, [
    el('section', { class: 'card' }, [
      el('h2', { class: 'card__title', text: 'المبالغ' }),
      el('label', { class: 'field-block' }, [el('span', { text: 'خصم الفاتورة' }), discountInput]),
      el('label', { class: 'field-block' }, [el('span', { text: 'المبلغ المدفوع' }), paidInput]),
      taxButton,
      el('div', { style: { marginBlockStart: 'var(--spacing-4)' } }, [
        subtotalRow.root,
        discountRow.root,
        taxRow.root,
        totalRow.root,
        dueRow.root,
      ]),
    ]),
    el('section', { class: 'card' }, [
      el('h2', { class: 'card__title', text: 'حالة العملية' }),
      controls,
      el('div', { class: 'status-note' }, [
        svg(ICONS.link),
        el('span', {
          text: 'كل تغيير هنا يُبثّ فورًا إلى شاشة الزبون عبر القناة نفسها التي سيستخدمها نظام البيع الحقيقي.',
        }),
      ]),
    ]),
  ]),
]);

document.body.append(el('div', { class: 'pos' }, [head, body]));

transport.start();
renderTicket(engine.session);
