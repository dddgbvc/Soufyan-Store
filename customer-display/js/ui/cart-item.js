/**
 * بطاقة منتج واحد داخل السلة.
 * تُنشأ مرة واحدة لكل سطر ثم تُحدَّث موضعيًا — لا إعادة رسم للقائمة كلها،
 * حتى تبقى الحركات هادئة ولا يومض شيء عند كل تحديث.
 */

import { el, svg, setText, setData, playOnce } from '../core/dom.js';
import { createAmountEl, formatQty } from '../core/format.js';
import { PRODUCT_PLACEHOLDER } from './icons.js';
import { tickTo } from './ticker.js';
import { lineGross, lineNet } from '../core/selectors.js';

export function createCartItem(item, { tickerMs = 520 } = {}) {
  const media = el('div', { class: 'line-item__media' });

  const nameEl = el('div', { class: 'line-item__name' });
  const variantEl = el('div', { class: 'line-item__variant' });

  const unitAmount = createAmountEl(0);
  const qtyEl = el('span', { class: 'line-item__qty' }, [
    el('span', { class: 'line-item__qty-value' }),
    el('span', { text: 'قطعة' }),
  ]);
  const qtyValue = qtyEl.querySelector('.line-item__qty-value');
  const discountEl = el('span', { class: 'line-item__discount' });

  const unitRow = el('div', { class: 'line-item__unit' }, [
    qtyEl,
    el('span', { text: '×' }),
    unitAmount,
    discountEl,
  ]);

  const totalAmount = createAmountEl(0, { className: 'line-item__total' });
  const struckEl = el('span', { class: 'line-item__struck' });

  const root = el('li', { class: 'line-item' }, [
    media,
    el('div', { class: 'line-item__body' }, [nameEl, variantEl, unitRow]),
    el('div', { class: 'line-item__totals' }, [totalAmount, struckEl]),
  ]);

  /** @type {any} */
  let previous = null;
  /** `undefined` تعني «لم يُرسم شيء بعد» — وإلا لن يظهر الرمز البديل للمنتجات بلا صورة. */
  let currentImage;

  function renderMedia(imageUrl) {
    const next = imageUrl ?? null;
    if (currentImage !== undefined && next === currentImage) return;
    currentImage = next;

    if (!imageUrl) {
      media.replaceChildren(svg(PRODUCT_PLACEHOLDER));
      return;
    }

    const img = el('img', { src: imageUrl, alt: '', loading: 'lazy', decoding: 'async' });
    // صورة مكسورة ⇒ نعود للرمز البديل بدل أيقونة الخطأ الافتراضية للمتصفّح
    img.addEventListener('error', () => {
      if (currentImage === imageUrl) media.replaceChildren(svg(PRODUCT_PLACEHOLDER));
    });
    media.replaceChildren(img);
  }

  function update(next, { animate = true } = {}) {
    renderMedia(next.imageUrl);
    setText(nameEl, next.name);

    setText(variantEl, next.variant ?? '');
    variantEl.hidden = !next.variant;

    // الكمية: نبضة صغيرة عند التغيّر حتى يلاحظها الزبون دون إزعاج
    const qtyChanged = previous && previous.qty !== next.qty;
    setText(qtyValue, formatQty(next.qty));
    if (qtyChanged && animate) playOnce(qtyEl, 'bumped', 260);

    tickTo(unitAmount, next.unitPrice, { duration: tickerMs, immediate: !previous || !animate });

    const gross = lineGross(next);
    const net = lineNet(next);
    const hasDiscount = (next.lineDiscount || 0) > 0;

    setText(discountEl, hasDiscount ? `خصم ${formatQty(next.lineDiscount)}` : '');
    discountEl.hidden = !hasDiscount;

    struckEl.hidden = !hasDiscount;
    if (hasDiscount) {
      struckEl.replaceChildren(createAmountEl(gross));
    }

    tickTo(totalAmount, net, { duration: tickerMs, immediate: !previous || !animate });

    // إبراز هادئ للسطر الذي تغيّر
    const changed =
      previous &&
      animate &&
      (previous.qty !== next.qty ||
        previous.unitPrice !== next.unitPrice ||
        previous.lineDiscount !== next.lineDiscount);
    if (changed) playOnce(root, 'changed', 900);

    // وصف واحد للسطر لقارئات الشاشة بدل قراءة أجزائه متفرّقة
    root.setAttribute(
      'aria-label',
      `${next.name}${next.variant ? `، ${next.variant}` : ''}، الكمية ${formatQty(next.qty)}، الإجمالي ${formatQty(net)}`,
    );

    previous = next;
  }

  update(item, { animate: false });

  return {
    root,
    update,
    /** حركة الظهور — تُستدعى فقط عند إضافة السطر لأول مرة. */
    playEnter() {
      playOnce(root, 'enter', 520);
    },
    /** حركة الاختفاء ثم الإزالة من الشجرة. */
    remove(onDone) {
      setData(root, 'exit', true);
      const finish = () => {
        root.remove();
        onDone?.();
      };
      const timer = setTimeout(finish, 360);
      root.addEventListener(
        'animationend',
        () => {
          clearTimeout(timer);
          finish();
        },
        { once: true },
      );
    },
  };
}
