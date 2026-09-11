/**
 * عمود الملخّص — المجموع الفرعي، الخصم، الضريبة، ثم الإجمالي النهائي.
 * الإجمالي هو أضخم عنصر بصري في الشاشة، ويبقى ظاهرًا مهما طالت قائمة المنتجات.
 */

import { el, setText, setData, playOnce } from '../core/dom.js';
import { createAmountEl, formatAmountText } from '../core/format.js';
import { summarize } from '../core/selectors.js';
import { tickTo } from './ticker.js';

function sumRow(label, modifier = '') {
  const amount = createAmountEl(0);
  const root = el('div', { class: `sum-row ${modifier}`.trim() }, [
    el('span', { class: 'sum-row__label', text: label }),
    el('span', { class: 'sum-row__value' }, [amount]),
  ]);
  return { root, amount, label: root.querySelector('.sum-row__label') };
}

function payCell(label) {
  const amount = createAmountEl(0, { className: 'pay-cell__value-amount' });
  const labelEl = el('span', { class: 'pay-cell__label', text: label });
  const root = el('div', { class: 'pay-cell' }, [
    labelEl,
    el('span', { class: 'pay-cell__value' }, [amount]),
  ]);
  return { root, amount, labelEl };
}

export function createSummary(store, { config }) {
  const tickerMs = config.behavior.tickerMs;

  const subtotal = sumRow('المجموع الفرعي');
  const discount = sumRow('الخصم', 'sum-row--discount');
  const tax = sumRow(config.tax.label);

  const lines = el('div', { class: 'panel summary__lines' }, [
    subtotal.root,
    discount.root,
    el('div', { class: 'sum-divider' }),
    tax.root,
  ]);

  const totalAmount = createAmountEl(0);
  const totalNote = el('div', { class: 'total-card__note' });
  const totalCard = el(
    'div',
    { class: 'total-card', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    [
      el('div', { class: 'total-card__label', text: 'الإجمالي النهائي' }),
      el('div', { class: 'total-card__amount' }, [totalAmount]),
      totalNote,
    ],
  );

  const paidCell = payCell('المدفوع');
  const dueCell = payCell('المتبقي');
  const payGrid = el('div', { class: 'pay-grid' }, [paidCell.root, dueCell.root]);

  const foot = el('div', { class: 'summary__foot' }, [
    el('span', { text: 'شكرًا لتسوّقك في' }),
    el('strong', { text: config.store.name }),
  ]);

  const bottom = el('div', { class: 'summary__bottom' }, [payGrid, foot]);

  const root = el('aside', { class: 'summary', 'aria-label': 'ملخّص الفاتورة' }, [
    lines,
    totalCard,
    bottom,
  ]);

  let previousTotal = null;

  function render(session) {
    const s = summarize(session);

    tickTo(subtotal.amount, s.subtotal, { duration: tickerMs });
    tickTo(discount.amount, s.discountTotal, { duration: tickerMs });
    discount.root.classList.toggle('sum-row--hidden', s.discountTotal <= 0);

    const taxVisible = s.taxRate !== null && s.taxRate > 0;
    tax.root.classList.toggle('sum-row--hidden', !taxVisible);
    if (taxVisible) {
      setText(tax.label, `${config.tax.label} (${s.taxRate}٪)`);
      tickTo(tax.amount, s.taxAmount, { duration: tickerMs });
    }

    // الفاصل يظهر فقط عندما يكون فوقه وتحته صفوف مرئية
    lines.querySelector('.sum-divider').style.display = taxVisible ? '' : 'none';

    tickTo(totalAmount, s.total, { duration: tickerMs });
    if (previousTotal !== null && previousTotal !== s.total) playOnce(totalCard, 'flash', 760);
    previousTotal = s.total;

    setText(
      totalNote,
      s.count === 0
        ? 'لم تُضف أصناف بعد'
        : s.discountTotal > 0
          ? `وفّرت ${formatAmountText(s.discountTotal, config.currency.symbol)}`
          : `${s.count} صنف · ${s.units} قطعة`,
    );

    // صفوف الدفع: تظهر عند وجود دفعة أو أثناء/بعد الدفع
    const showPayment = s.paid > 0 || ['paying', 'paid', 'held'].includes(session.status);
    payGrid.style.display = showPayment ? '' : 'none';
    // تستعمله الأنماط لإخفاء الحاوية كاملة في التخطيط المضغوط
    setData(bottom, 'payment', showPayment);

    if (showPayment) {
      tickTo(paidCell.amount, s.paid, { duration: tickerMs });
      paidCell.root.className = `pay-cell${s.isSettled ? ' pay-cell--settled' : ''}`;

      if (s.change > 0) {
        setText(dueCell.labelEl, 'الباقي للزبون');
        tickTo(dueCell.amount, s.change, { duration: tickerMs });
        dueCell.root.className = 'pay-cell pay-cell--change';
      } else {
        setText(dueCell.labelEl, 'المتبقي');
        tickTo(dueCell.amount, s.due, { duration: tickerMs });
        dueCell.root.className = `pay-cell${s.due > 0 ? ' pay-cell--due' : ' pay-cell--settled'}`;
      }
    }

    setData(root, 'status', session.status);
  }

  store.subscribe(render);

  return { root };
}
