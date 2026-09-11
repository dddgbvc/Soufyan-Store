/**
 * انتقال ناعم للأرقام.
 *
 * المبالغ لا تقفز من قيمة إلى أخرى؛ تنتقل خلال ~نصف ثانية بمنحنى ease-out.
 * مع `tabular-nums` في الأنماط، عرض كل رقم ثابت فلا يهتزّ التخطيط أثناء العدّ.
 */

import { formatNumber } from '../core/format.js';
import { prefersReducedMotion } from '../core/dom.js';

const easeOut = (t) => 1 - (1 - t) ** 3;

/** @type {WeakMap<Element, {value:number, frame:number}>} */
const registry = new WeakMap();

/**
 * يحرّك محتوى العنصر من قيمته الحالية إلى القيمة الجديدة.
 * @param {Element|null} node عنصر يحتوي `.amount__value` أو عنصر النص نفسه
 * @param {number} nextValue
 * @param {{ duration?:number, immediate?:boolean }} [options]
 * @returns {boolean} هل تغيّرت القيمة فعلًا
 */
export function tickTo(node, nextValue, { duration = 520, immediate = false } = {}) {
  if (!node) return false;
  const target = node.querySelector?.('.amount__value') ?? node;

  const record = registry.get(target) ?? { value: readCurrent(target), frame: 0 };
  const from = record.value;
  const to = Number(nextValue) || 0;

  if (from === to) {
    registry.set(target, { ...record, value: to });
    return false;
  }

  cancelAnimationFrame(record.frame);

  if (immediate || prefersReducedMotion() || duration <= 0) {
    target.textContent = formatNumber(to);
    registry.set(target, { value: to, frame: 0 });
    syncAriaLabel(node, to);
    return true;
  }

  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const current = from + (to - from) * easeOut(progress);
    target.textContent = formatNumber(progress === 1 ? to : current);

    if (progress < 1) {
      registry.set(target, { value: to, frame: requestAnimationFrame(step) });
    } else {
      registry.set(target, { value: to, frame: 0 });
      syncAriaLabel(node, to);
    }
  };

  registry.set(target, { value: to, frame: requestAnimationFrame(step) });
  return true;
}

function readCurrent(target) {
  const parsed = Number(String(target.textContent ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function syncAriaLabel(node, value) {
  if (!node.classList?.contains('amount')) return;
  const currency = node.querySelector('.amount__currency')?.textContent ?? '';
  node.setAttribute('aria-label', `${formatNumber(value)} ${currency}`.trim());
}
