/**
 * قائمة المنتجات — تمرير ناعم داخل القائمة وحدها، والملخّص يبقى ثابتًا دائمًا.
 * التحديث تفاضلي بالمعرّف: إضافة، تحديث، حذف، وإعادة ترتيب — بلا إعادة بناء.
 */

import { el, svg, setText, setData } from '../core/dom.js';
import { ICONS } from './icons.js';
import { createCartItem } from './cart-item.js';
import { summarize } from '../core/selectors.js';
import { formatQty } from '../core/format.js';

export function createCartList(store, { config }) {
  const countEl = el('span', { class: 'pill pill--neutral' }, [
    el('span', { class: 'pill__icon' }, [svg(ICONS.cart)]),
    el('span', { class: 'cart__count', text: '0 قطعة' }),
  ]);
  const countText = countEl.querySelector('.cart__count');

  const list = el('ul', { class: 'cart__list' });
  const scroller = el('div', { class: 'cart__scroller scroll-area' }, [list]);

  const root = el('section', { class: 'cart', 'aria-label': 'قائمة مشترياتك' }, [
    el('div', { class: 'cart__head' }, [
      el('h2', { class: 'cart__title', text: 'مشترياتك' }),
      countEl,
    ]),
    scroller,
  ]);

  /** @type {Map<string, ReturnType<typeof createCartItem>>} */
  const nodes = new Map();
  let firstRender = true;

  function updateOverflowHint() {
    setData(scroller, 'overflowing', scroller.scrollHeight - scroller.clientHeight > 8);
  }

  function render(session) {
    const seen = new Set();
    let appended = 0;
    /** @type {ReturnType<typeof createCartItem>|null} */
    let lastAdded = null;

    for (const item of session.items) {
      seen.add(item.id);
      const existing = nodes.get(item.id);

      if (existing) {
        existing.update(item);
      } else {
        const node = createCartItem(item, { tickerMs: config.behavior.tickerMs });
        nodes.set(item.id, node);
        list.append(node.root);
        lastAdded = node;
        if (!firstRender) {
          // تتابع خفيف عند وصول عدة أصناف دفعة واحدة
          const delay = appended * 45;
          appended += 1;
          setTimeout(() => node.playEnter(), delay);
        }
      }
    }

    // حذف ما لم يعد موجودًا
    for (const [id, node] of nodes) {
      if (seen.has(id)) continue;
      nodes.delete(id);
      node.remove(updateOverflowHint);
    }

    // ضبط الترتيب ليطابق ترتيب الكاشير
    session.items.forEach((item, index) => {
      const node = nodes.get(item.id);
      if (!node) return;
      const atIndex = list.children[index];
      if (atIndex !== node.root) list.insertBefore(node.root, atIndex ?? null);
    });

    const { units, count } = summarize(session);
    setText(countText, count === 0 ? 'لا توجد أصناف' : `${formatQty(units)} قطعة · ${count} صنف`);

    const wasFirstRender = firstRender;
    firstRender = false;
    requestAnimationFrame(updateOverflowHint);

    // تمرير تلقائي للصنف الجديد فقط — لا نُحرّك القائمة عند تغيّر خصم أو سعر
    if (lastAdded && !wasFirstRender) {
      lastAdded.root.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  store.subscribe(render);
  globalThis.addEventListener('resize', updateOverflowHint);
  scroller.addEventListener('scroll', updateOverflowHint, { passive: true });

  return { root };
}
