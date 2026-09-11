/**
 * طبقة الحالات — كل ما ليس «الزبون يتصفّح مشترياته».
 *
 * الحالات:
 *   loading    جارٍ الاتصال بنقطة البيع
 *   idle       بانتظار عملية جديدة  (Empty State)
 *   paying     جاري إتمام عملية الدفع
 *   paid       تمت العملية بنجاح
 *   held       بانتظار إتمام الدفع
 *   cancelled  أُلغيت العملية
 *   error      تعذّر الاتصال / خطأ
 *
 * الانتقال بين الحالات crossfade فقط — بلا ارتداد ولا حركة صاخبة.
 */

import { el, svg, setData } from '../core/dom.js';
import {
  ART_CANCELLED,
  ART_ERROR,
  ART_HELD,
  ART_IDLE,
  ART_LOADING,
  ART_PAYING,
  ART_SUCCESS,
  ICONS,
} from './icons.js';
import { createAmountEl } from '../core/format.js';
import { summarize } from '../core/selectors.js';

export function createStage(store, { config }) {
  const root = el('div', { class: 'stage', 'aria-live': 'polite' });
  let currentStatus = null;

  /** مبلغ كبير مع تسمية صغيرة فوقه — بلا تسمية يصعب معرفة أي رقم هذا. */
  function bigAmount(label, value) {
    return el('div', { class: 'state__figure' }, [
      el('div', { class: 'state__amount-label', text: label }),
      el('div', { class: 'state__amount' }, [createAmountEl(value)]),
    ]);
  }

  /** @param {string} iconName @param {string} label @param {string|Node|null} [value] */
  function chip(iconName, label, value = null) {
    return el('span', { class: 'state__chip' }, [
      svg(ICONS[iconName]),
      el('span', { text: label }),
      value instanceof Node ? value : value ? el('b', { text: value }) : null,
    ]);
  }

  function buildState(session) {
    const s = summarize(session);

    switch (session.status) {
      case 'loading':
        return el('div', { class: 'state state--loading' }, [
          el('div', { class: 'state__art' }, [svg(ART_LOADING)]),
          el('h2', { class: 'state__title', text: 'جارٍ الاتصال بنقطة البيع' }),
          el('p', { class: 'state__subtitle', text: 'لحظة من فضلك…' }),
          el('div', { class: 'state__skeletons' }, [
            el('div', { class: 'skeleton-bar' }),
            el('div', { class: 'skeleton-bar' }),
            el('div', { class: 'skeleton-bar' }),
          ]),
        ]);

      case 'paying':
        return el('div', { class: 'state state--paying' }, [
          el('div', { class: 'state__art' }, [svg(ART_PAYING)]),
          el('h2', { class: 'state__title', text: 'جاري إتمام عملية الدفع…' }),
          el('p', {
            class: 'state__subtitle',
            text: session.message ?? 'يرجى الانتظار قليلًا حتى تكتمل العملية',
          }),
          bigAmount('الإجمالي', s.total),
          el('div', { class: 'state__meta' }, [
            s.paid > 0 ? chip('card', 'المدفوع', createAmountEl(s.paid)) : null,
          ]),
        ]);

      case 'paid':
        return el('div', { class: 'state state--paid' }, [
          el('div', { class: 'state__art' }, [svg(ART_SUCCESS)]),
          el('h2', { class: 'state__title', text: 'تمت العملية بنجاح' }),
          el('p', { class: 'state__subtitle', text: session.message ?? 'شكرًا لتسوّقك معنا' }),
          bigAmount('الإجمالي المدفوع', s.total),
          el('div', { class: 'state__meta' }, [
            session.invoiceNumber ? chip('receipt', 'رقم الفاتورة', session.invoiceNumber) : null,
            s.change > 0 ? chip('box', 'الباقي لك', createAmountEl(s.change)) : null,
          ]),
        ]);

      case 'held':
        return el('div', { class: 'state state--held' }, [
          el('div', { class: 'state__art' }, [svg(ART_HELD)]),
          el('h2', { class: 'state__title', text: 'بانتظار إتمام الدفع' }),
          el('p', {
            class: 'state__subtitle',
            text: session.message ?? 'العملية محفوظة، ويمكن إكمالها في أي وقت',
          }),
          bigAmount(s.due > 0 ? 'المتبقي' : 'الإجمالي', s.due > 0 ? s.due : s.total),
          el('div', { class: 'state__meta' }, [
            session.invoiceNumber ? chip('receipt', 'رقم الفاتورة', session.invoiceNumber) : null,
          ]),
        ]);

      case 'cancelled':
        return el('div', { class: 'state state--cancelled' }, [
          el('div', { class: 'state__art' }, [svg(ART_CANCELLED)]),
          el('h2', { class: 'state__title', text: 'تم إلغاء العملية' }),
          el('p', {
            class: 'state__subtitle',
            text: session.message ?? 'لم يُخصم أي مبلغ. يسعدنا خدمتك في أي وقت.',
          }),
        ]);

      case 'error':
        return el('div', { class: 'state state--error' }, [
          el('div', { class: 'state__art' }, [svg(ART_ERROR)]),
          el('h2', { class: 'state__title', text: 'تعذّر عرض العملية' }),
          el('p', {
            class: 'state__subtitle',
            text: 'يرجى مراجعة الكاشير — الشاشة تحاول إعادة الاتصال تلقائيًا.',
          }),
          session.message ? el('p', { class: 'state__error-detail', text: session.message }) : null,
        ]);

      case 'idle':
      default:
        return el('div', { class: 'state state--idle' }, [
          el('div', { class: 'state__art' }, [svg(ART_IDLE)]),
          el('h2', { class: 'state__title', text: 'بانتظار عملية الشراء' }),
          el('p', { class: 'state__subtitle', text: 'ستظهر مشترياتك هنا فور إضافتها' }),
          el('div', { class: 'state__meta' }, [
            el('span', { class: 'state__chip' }, [
              svg(ICONS.box),
              el('span', { text: config.store.name }),
            ]),
          ]),
        ]);
    }
  }

  function render(session) {
    const active = session.status !== 'browsing';
    setData(root, 'active', active);

    if (!active) {
      currentStatus = null;
      // نُبقي المحتوى لحظة حتى ينتهي التلاشي ثم نُفرغه
      setTimeout(() => {
        if (root.dataset.active !== 'true') root.replaceChildren();
      }, 480);
      return;
    }

    // نعيد البناء فقط عند تغيّر الحالة أو المحتوى المهم داخلها
    const s = summarize(session);
    const signature = [
      session.status,
      session.invoiceNumber ?? '',
      session.message ?? '',
      s.total,
      s.paid,
      s.due,
      s.change,
    ].join('|');

    if (signature === currentStatus) return;
    currentStatus = signature;

    const next = buildState(session);
    setData(next, 'enter', true);
    root.replaceChildren(next);
  }

  store.subscribe(render);

  return { root };
}
