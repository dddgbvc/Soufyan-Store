/**
 * تحويل `PrintableDoc` إلى مستند كامل، وطباعته في المتصفّح.
 *
 * `renderDocument` لا يحتاج متصفّحًا — يعمل على الخادم أيضًا، فتقدر تحفظ
 * الناتج ملفًا أو تمرّره لمولّد PDF. `printDocument` هو الذي يحتاج DOM.
 */

import { FONT_LINKS, BASE_CSS } from './shop.js';
import type { PrintableDoc } from './types.js';

/** يبني مستند HTML كاملًا من جسم ومقاس. */
export function renderDocument(doc: PrintableDoc, title = 'مكتب سفيان للموبايل'): string {
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    `<title>${title}</title>` + FONT_LINKS +
    `<style>${BASE_CSS}${doc.css}</style></head><body>${doc.html}</body></html>`;
}

/**
 * يطبع المستند عبر إطار مخفي.
 *
 * ينتظر `document.fonts.ready` قبل الطباعة — بدونها تُطبع الصفحة أحيانًا
 * بخط بديل فتنكسر المقاسات المحسوبة بالمليمتر.
 *
 * @throws إذا استُدعيت خارج المتصفّح.
 */
export function printDocument(doc: PrintableDoc, frameId = 'sfnPrintFrame'): void {
  if (typeof document === 'undefined') {
    throw new Error('printDocument تحتاج متصفّحًا. على الخادم استعمل renderDocument.');
  }

  document.getElementById(frameId)?.remove();

  const frame = document.createElement('iframe');
  frame.id = frameId;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;border:0';

  const boot =
    '<scr' + 'ipt>window.addEventListener("load",function(){' +
    '(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){' +
    'setTimeout(function(){window.focus();window.print();},120);});});</scr' + 'ipt>';

  frame.srcdoc = renderDocument(doc).replace('</body>', boot + '</body>');
  document.body.appendChild(frame);
}
