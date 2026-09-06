/** بيانات المحل والعناصر المشتركة بين كل المطبوعات. */

import type { ShopInfo, InvoiceTotals, SaleInvoice } from './types.js';

/** بيانات مكتب سفيان للموبايل. */
export const SHOP: ShopInfo = {
  name: 'مكتب سفيان للموبايل',
  latin: 'SUFYAN MOBILE',
  address: 'سامراء — الحويش — الشارع الرئيسي',
  phones: ['0773 164 4450', '0774 448 5771'],
  internet: '0772 909 6991',
  tagline: 'شاشتك الجاية تبدأ من هنا',
};

/** ألوان الهوية. */
export const COLORS = {
  deep: '#14343F',
  teal: '#2F6F6B',
  mist: '#9CC0BB',
  sand: '#F2EDE4',
  gold: '#C8A96A',
  ink: '#101E24',
} as const;

/**
 * رمز الشعار كـ SVG متجه.
 *
 * `fill="none"` مكتوبة كخاصية عرض على كل مسار عمدًا: بعض المحوّلات
 * (كانفا مثلًا) لا تورّث `fill` من عنصر `<svg>` فتملأ منحنى القاعدة بالأسود.
 */
export const MARK =
  '<svg class="m" fill="none" viewBox="44 58 152 124">' +
  '<path fill="none" d="M180,134 C180,154 166,166 142,166 L60,166"/>' +
  '<path fill="none" d="M133,92 L133,158"/>' +
  '<path fill="none" d="M84,108 L84,158"/>' +
  '<path fill="none" class="acc" d="M180,74 L180,140"/></svg>';

/** وسوم تحميل خطّي الهوية من Google Fonts. */
export const FONT_LINKS =
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@600;700' +
  '&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">';

/** القواعد الأساسية المشتركة بين كل المستندات. */
export const BASE_CSS =
  '*{box-sizing:border-box;margin:0;padding:0}' +
  'body{font-family:"Cairo",system-ui,sans-serif;color:' + COLORS.ink + ';' +
  '-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
  'svg.m{fill:none;stroke-width:24;stroke-linecap:round;stroke-linejoin:round;display:block}' +
  'svg.m path{stroke:' + COLORS.deep + '}svg.m path.acc{stroke:' + COLORS.gold + '}';

const NUM = new Intl.NumberFormat('en-US');

/** يهرّب النص قبل إدراجه في HTML. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** يصيغ عددًا بفواصل الآلاف اللاتينية. */
export function n(value: number): string {
  return NUM.format(Math.round(value));
}

/** يصيغ مبلغًا بالدينار — أو شرطة إذا كان صفرًا أو غير محدَّد. */
export function money(value: number | undefined | null): string {
  return value ? `${n(value)} د.ع` : '—';
}

/** تاريخ اليوم بصيغة `YYYY-MM-DD`. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** الساعة والدقيقة من طابع زمني. */
export function clock(at?: number): string {
  const d = new Date(at ?? Date.now());
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** أرقام الهاتف في سطر واحد بفاصل نقطي. */
export function phonesLine(): string {
  return SHOP.phones.join('&nbsp;&nbsp;·&nbsp;&nbsp;');
}

/**
 * يحسب مجاميع الفاتورة من أسطرها.
 *
 * الخصم لا يتجاوز المجموع الفرعي، والمدفوع يساوي الإجمالي إذا لم يُحدَّد،
 * فتُطبع الفاتورة «مسدّدة بالكامل» بدل صفر مضلِّل.
 */
export function totals(inv: Pick<SaleInvoice, 'items' | 'discount' | 'paid'>): InvoiceTotals {
  const subtotal = inv.items.reduce((a, it) => a + it.qty * it.price, 0);
  const discount = Math.min(Math.max(inv.discount ?? 0, 0), subtotal);
  const grand = subtotal - discount;
  const paid = inv.paid == null ? grand : Math.max(inv.paid, 0);
  return {
    subtotal,
    discount,
    grand,
    paid,
    rest: Math.max(0, grand - paid),
    count: inv.items.reduce((a, it) => a + it.qty, 0),
  };
}

/** يولّد رقم وصل صيانة تسلسلي `SFN-00001`. */
export function ticketNo(seq: number): string {
  return `SFN-${String(seq).padStart(5, '0')}`;
}

/** يولّد رقم فاتورة تسلسلي `SFN-INV-00001` — تسلسل مستقل عن الوصولات. */
export function invoiceNo(seq: number): string {
  return `SFN-INV-${String(seq).padStart(5, '0')}`;
}

/** يولّد رقم منتج `SFN-PH-1043` / `SFN-AC-1043` / `SFN-NT-1043`. */
export function sku(kind: 'PH' | 'AC' | 'NT', seq: number): string {
  return `SFN-${kind}-${seq}`;
}
