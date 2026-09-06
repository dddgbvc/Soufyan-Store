/**
 * ملصقات الباركود.
 *
 * نوعان بمقاسين معتمدين:
 *
 * - **ملصق الإكسسوارات — 50 × 30 مم**: اسم وسعر وباركود فقط. مقاسه ثابت
 *   ولا يحمل حقول جهاز.
 * - **ملصق الهاتف — 75 × 50 مم**: يحمل فوق ذلك النموذج والـIMEI والذاكرة
 *   واللون وصحة البطارية والحالة والأعطال والملاحظات.
 *
 * المقاسات الأربعة كلها متاحة لأي نوع، لكن الافتراض أعلاه هو المعتمد في المحل.
 */

import * as Code128 from './code128.js';
import { MARK, COLORS, esc, n } from './shop.js';
import type { LabelSize, LabelSizeKey, ProductLabel, PhoneLabel, PrintableDoc } from './types.js';

/**
 * جدول المقاسات.
 *
 * `phone` هي البدائل التي تُستعمل حين يحمل الملصق مواصفات جهاز: الاسم
 * والسعر والباركود تصغر لتفسح مجال المواصفات.
 */
export const SIZES: Readonly<Record<LabelSizeKey, LabelSize>> = {
  '75x50': { w: 75, h: 50, nameMm: 4.4, priceMm: 7.4, barcodeMm: 14, barcodeModule: 0.40, specMm: 2.5,
             phone: { nameMm: 3.8, priceMm: 5.6, barcodeMm: 9 } },
  '60x40': { w: 60, h: 40, nameMm: 3.6, priceMm: 6, barcodeMm: 11, barcodeModule: 0.34, specMm: 2,
             phone: { nameMm: 3, priceMm: 4.4, barcodeMm: 7 } },
  '50x30': { w: 50, h: 30, nameMm: 3.1, priceMm: 4.8, barcodeMm: 8.5, barcodeModule: 0.28, specMm: 1.7,
             phone: { nameMm: 2.5, priceMm: 3.4, barcodeMm: 5.5 } },
  '40x25': { w: 40, h: 25, nameMm: 2.7, priceMm: 4, barcodeMm: 7, barcodeModule: 0.22, specMm: 1.5,
             phone: { nameMm: 2.2, priceMm: 3, barcodeMm: 4.6 } },
};

/** المقاس المعتمد لكل نوع ملصق. */
export const DEFAULT_SIZE: Readonly<Record<ProductLabel['kind'], LabelSizeKey>> = {
  phone: '75x50',
  accessory: '50x30',
};

/** المقاسات الفعلية بعد تطبيق بدائل الهاتف عند الحاجة. */
interface Metrics { nameMm: number; priceMm: number; barcodeMm: number; specMm: number; module: number; w: number; h: number }

function metrics(size: LabelSizeKey, isPhone: boolean): Metrics {
  const s = SIZES[size];
  const p = isPhone ? s.phone : s;
  return { nameMm: p.nameMm, priceMm: p.priceMm, barcodeMm: p.barcodeMm,
           specMm: s.specMm, module: s.barcodeModule, w: s.w, h: s.h };
}

function specRow(label: string, value: string | undefined, mono = false): string {
  if (!value) return '';
  return `<div class="sp"><i>${label}</i> <em${mono ? ' class="mono"' : ''}>${esc(value)}</em></div>`;
}

/** كتلة مواصفات الجهاز — تعود فارغة إذا لم تُملأ أي حقل. */
export function specsBlock(p: PhoneLabel): string {
  const duo1 = specRow('الذاكرة', p.storage, true) + specRow('اللون', p.color);
  const duo2 = specRow('البطارية', p.battery, true) + specRow('الحالة', p.condition);
  const rows =
    (duo1 ? `<div class="duo">${duo1}</div>` : '') +
    specRow('النموذج', p.model, true) +
    specRow('IMEI', p.imei, true) +
    (duo2 ? `<div class="duo">${duo2}</div>` : '') +
    specRow('الأعطال', p.fault) +
    specRow('ملاحظات', p.notes);
  return rows ? `<div class="sp-box">${rows}</div>` : '';
}

/** محتوى ملصق واحد. */
function labelInner(p: ProductLabel, m: Metrics): string {
  return `<div class="lt">${MARK}<span class="ln">${esc(p.name)}</span></div>` +
    `<div class="lp"><span dir="ltr">${n(p.price)}</span> <small>د.ع</small></div>` +
    (p.kind === 'phone' ? specsBlock(p) : '') +
    `<div class="lb">${Code128.svg(p.sku, {
      height: Math.round(m.barcodeMm * 4),
      module: Math.max(1, Math.round(m.module * 4)),
      fontSize: 11,
    })}</div>`;
}

function labelCss(m: Metrics, sheet: boolean): string {
  return (sheet
    ? '@page{size:A4;margin:8mm}' +
      'body{display:flex;flex-wrap:wrap;gap:3mm;align-content:flex-start}' +
      `.l{width:${m.w}mm;height:${m.h}mm;border:.2mm dashed #c9c2b4;border-radius:1.5mm;`
    : `@page{size:${m.w}mm ${m.h}mm;margin:0}body{margin:0}` +
      `.l{width:${m.w}mm;height:${m.h}mm;border:0;border-radius:0;`) +
    'background:#fff;padding:1.8mm 2.2mm;display:flex;flex-direction:column;overflow:hidden}' +
    '.lt{display:flex;align-items:center;justify-content:space-between;gap:1.5mm}' +
    `.lt svg.m{width:${m.nameMm * 1.3}mm;flex:none}` +
    `.ln{font-weight:700;font-size:${m.nameMm}mm;line-height:1.2;color:${COLORS.deep};overflow:hidden;` +
    'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}' +
    `.lp{font-family:'El Messiri',serif;font-weight:700;font-size:${m.priceMm}mm;color:${COLORS.deep};` +
    'line-height:1;margin-top:1mm;white-space:nowrap}' +
    `.lp small{font-family:'Cairo',sans-serif;font-size:${m.priceMm * 0.42}mm;opacity:.55;font-weight:600}` +
    '.sp-box{margin-top:.8mm;border-top:.2mm solid rgba(20,52,63,.45);' +
    'border-bottom:.2mm solid rgba(20,52,63,.45);padding:.6mm 0;display:flex;' +
    `flex-direction:column;gap:.15mm;font-size:${m.specMm}mm;line-height:1.3;color:${COLORS.deep}}` +
    '.sp-box .duo{display:flex;gap:2mm}' +
    '.sp-box .duo>*{flex:1;min-width:0}' +
    '.sp-box .sp{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.sp-box i{font-style:normal;font-weight:700;opacity:.6}' +
    '.sp-box em{font-style:normal;font-weight:700}' +
    '.sp-box em.mono{font-family:monospace;direction:ltr;unicode-bidi:isolate}' +
    '.lb{margin-top:auto;display:flex;justify-content:center}' +
    `.lb svg{display:block;max-width:100%;height:${m.barcodeMm}mm;width:auto}`;
}

/**
 * شيت ملصقات على ورقة A4.
 *
 * @param label المنتج.
 * @param qty عدد النسخ — يُحصَر بين 1 و120.
 * @param size المقاس، أو المعتمد لنوع الملصق إن تُرك.
 */
export function labelSheet(label: ProductLabel, qty: number, size?: LabelSizeKey): PrintableDoc {
  const key = size ?? DEFAULT_SIZE[label.kind];
  const m = metrics(key, label.kind === 'phone');
  const count = Math.min(120, Math.max(1, Math.floor(qty) || 1));
  const one = `<div class="l">${labelInner(label, m)}</div>`;
  return { html: one.repeat(count), css: labelCss(m, true), paper: `A4 — ${count} ملصق ${key} مم` };
}

/**
 * ملصق مفرد بمقاس الملصق نفسه — هذا ما يتوقّعه رول الطابعة الحرارية.
 *
 * على الرول اطبع أسود على أبيض؛ الطابعة أحادية اللون ولا تعطي التدرّجات.
 */
export function singleLabel(label: ProductLabel, size?: LabelSizeKey): PrintableDoc {
  const key = size ?? DEFAULT_SIZE[label.kind];
  const m = metrics(key, label.kind === 'phone');
  return {
    html: `<div class="l">${labelInner(label, m)}</div>`,
    css: labelCss(m, false),
    paper: `${m.w} × ${m.h} مم`,
  };
}
