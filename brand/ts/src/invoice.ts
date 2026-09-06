/**
 * فواتير البيع — صيغتان من نفس البيانات:
 *
 * | الدالة | المقاس | الاستعمال |
 * |---|---|---|
 * | `invoiceThermal80` | رول حراري 80 مم | البيع اليومي — نفس طابعة وصل الصيانة |
 * | `invoiceA5` | 148 × 210 مم | المبيعات الكبيرة والجملة — فيها توقيع المستلِم |
 *
 * المجاميع تُشتق دائمًا من الأسطر عبر `totals()` — لا تُمرَّر جاهزة، حتى لا
 * تفترق الفاتورة المطبوعة عن الفاتورة المحفوظة.
 */

import * as Code128 from './code128.js';
import { MARK, COLORS, SHOP, esc, n, money, phonesLine, clock, today, totals } from './shop.js';
import { THERMAL_CSS, thermalHeader, kv } from './service-ticket.js';
import type { SaleInvoice, PrintableDoc } from './types.js';

const WARRANTY = [
  'ضمان الجهاز سنة على عيوب المصنع — لا يشمل الكسر ولا الماء.',
  'الاستبدال خلال 3 أيام بشرط سلامة الجهاز وكامل توابعه وعلبته.',
  'الإكسسوارات المستعملة لا تُستبدل ولا تُرجَع.',
  'لا تُعتمد أي مطالبة بدون هذه الفاتورة.',
];

/* ══════════════════ الفاتورة الحرارية 80 مم ══════════════════ */

const INVOICE_THERMAL_CSS = THERMAL_CSS +
  '.ith{display:flex;justify-content:space-between;font-size:2.3mm;font-weight:700;' +
  'letter-spacing:.3mm;padding:.8mm 0;border-bottom:.4mm solid #000}' +
  '.it{padding:1.4mm 0;border-bottom:.3mm dotted #000}' +
  '.it:last-child{border-bottom:0}' +
  '.it .n{font-size:2.9mm;font-weight:700;line-height:1.45}' +
  '.it .m{display:flex;justify-content:space-between;align-items:baseline;' +
  'font-size:2.6mm;font-weight:600;padding-top:.5mm}' +
  '.it .m .q{font-family:monospace;direction:ltr}' +
  '.it .m .s{font-family:monospace;direction:ltr;font-weight:700;font-size:2.9mm}' +
  '.it .sn{font-size:2.2mm;font-family:monospace;direction:ltr;padding-top:.3mm}';

/**
 * فاتورة بيع على الرول الحراري 80 مم.
 *
 * كل مادة بسطرين — الاسم كاملًا، ثم الكمية × السعر والمجموع — لأن عرض
 * الطباعة 72 مم يقطع الأسماء الطويلة لو وُضعت في جدول بأعمدة.
 */
export function invoiceThermal80(inv: SaleInvoice): PrintableDoc {
  const T = totals(inv);

  const items = inv.items.map((it) =>
    `<div class="it"><div class="n">${esc(it.name)}</div>` +
    `<div class="m"><span class="q">${n(it.qty)} × ${n(it.price)}</span>` +
    `<span class="s">${n(it.qty * it.price)}</span></div>` +
    (it.imei ? `<div class="sn">IMEI ${esc(it.imei)}</div>` : '') + '</div>',
  ).join('');

  const html =
    thermalHeader() +
    '<div class="hr s"></div><div class="ttl">فاتورة بيع</div>' +
    `<div class="no">${esc(inv.no)}</div>` +

    '<div class="hr"></div>' +
    kv('التاريخ', `${inv.date || today()} · ${clock(inv.at)}`, true) +
    kv('البائع', inv.seller) +
    kv('الزبون', inv.customer) +
    kv('الهاتف', inv.phone, true) +

    '<div class="hr"></div><div class="ith"><span>المادة</span><span>المجموع</span></div>' +
    items +

    '<div class="hr"></div>' +
    `<div class="kv"><b>المجموع الفرعي</b><span class="mono">${money(T.subtotal)}</span></div>` +
    (T.discount ? `<div class="kv"><b>الخصم</b><span class="mono">‎−${money(T.discount)}</span></div>` : '') +
    `<div class="tot"><b>الإجمالي</b><span class="v">${n(T.grand)}</span></div>` +
    `<div class="kv"><b>المدفوع</b><span class="mono">${money(T.paid)}</span></div>` +
    (T.rest ? `<div class="kv"><b>المتبقّي</b><span class="mono">${money(T.rest)}</span></div>` : '') +
    kv('طريقة الدفع', inv.payment) +

    (inv.note ? `<div class="hr"></div><div class="lb">ملاحظات</div><div class="tx">${esc(inv.note)}</div>` : '') +

    `<div class="bc">${Code128.svg(inv.no, { height: 56, module: 2, fontSize: 12 })}</div>` +

    `<div class="hr"></div><div class="tm"><b>الضمان والاستبدال</b>${WARRANTY.map((l) => '• ' + l).join('<br>')}</div>` +
    '<div class="hr"></div><div class="th">شكرًا لثقتك</div>';

  return { html, css: INVOICE_THERMAL_CSS, paper: 'رول حراري 80 مم — طول متغيّر' };
}

/* ══════════════════ الفاتورة A5 ══════════════════ */

const INVOICE_A5_CSS =
  '@page{size:148mm 210mm;margin:0}' +
  'body{width:148mm;height:210mm;padding:7mm 8mm;display:flex;flex-direction:column}' +
  '.tp{display:flex;align-items:flex-start;justify-content:space-between;gap:4mm;' +
  'padding-bottom:3.4mm;border-bottom:.6mm solid ' + COLORS.deep + '}' +
  '.bd{display:flex;align-items:center;gap:2.6mm}' +
  '.bd .bx{width:11mm;height:11mm;border-radius:3mm;background:' + COLORS.deep + ';display:flex;' +
  'align-items:center;justify-content:center;flex:none}' +
  '.bd .bx svg.m{width:7.4mm}.bd .bx svg.m path{stroke:' + COLORS.sand + '}' +
  '.bd .bx svg.m path.acc{stroke:' + COLORS.gold + '}' +
  ".bd .nm{font-family:'El Messiri',serif;font-weight:700;font-size:4.8mm;color:" + COLORS.deep + ';line-height:1.15}' +
  '.bd .sb{font-size:1.7mm;font-weight:700;letter-spacing:1mm;direction:ltr;color:' + COLORS.teal + ';margin-top:.5mm}' +
  '.bd .ad{font-size:2.2mm;font-weight:600;color:rgba(20,52,63,.66);line-height:1.6;margin-top:1mm}' +
  '.dc{text-align:left;flex:none}' +
  ".dc .t{font-family:'El Messiri',serif;font-weight:700;font-size:5.4mm;color:" + COLORS.deep + ';line-height:1.1}' +
  '.dc .n{font-family:monospace;font-size:3.6mm;font-weight:700;letter-spacing:.3mm;' +
  'direction:ltr;color:' + COLORS.teal + ';margin-top:1mm}' +
  '.dc .d{font-size:2.3mm;font-weight:600;color:rgba(20,52,63,.66);margin-top:.8mm}' +
  '.wh{display:flex;gap:2.6mm;margin:3.4mm 0}' +
  '.wh .c{flex:1;background:' + COLORS.sand + ';border-radius:2.6mm;padding:2.4mm 2.8mm}' +
  '.wh .c .k{font-size:1.9mm;font-weight:700;letter-spacing:.5mm;color:' + COLORS.teal + '}' +
  '.wh .c .r{display:flex;justify-content:space-between;gap:2mm;font-size:2.5mm;' +
  'font-weight:600;padding-top:1mm;line-height:1.5}' +
  '.wh .c .r b{font-weight:700;color:rgba(20,52,63,.6);flex:none}' +
  '.wh .c .r span{text-align:left;overflow-wrap:anywhere}' +
  '.wh .c .r span.mono{font-family:monospace;direction:ltr}' +
  'table{width:100%;border-collapse:collapse;font-size:2.5mm}' +
  'thead th{background:' + COLORS.deep + ';color:' + COLORS.sand + ';font-weight:700;font-size:2.2mm;' +
  'letter-spacing:.3mm;padding:1.6mm 1.8mm;text-align:right}' +
  'thead th:first-child{border-top-right-radius:1.8mm}' +
  'thead th:last-child{border-top-left-radius:1.8mm;text-align:left}' +
  'tbody td{padding:1.6mm 1.8mm;border-bottom:.25mm solid rgba(20,52,63,.1);' +
  'vertical-align:top;font-weight:600;line-height:1.5}' +
  'tbody tr:nth-child(even) td{background:rgba(242,237,228,.55)}' +
  'td.n{font-family:monospace;direction:ltr;white-space:nowrap}' +
  'td.e{text-align:left;font-family:monospace;direction:ltr;font-weight:700;white-space:nowrap}' +
  'td .sn{display:block;font-family:monospace;direction:ltr;font-size:2mm;' +
  'color:rgba(20,52,63,.55);font-weight:600;padding-top:.4mm}' +
  '.cn{width:6mm;text-align:center}' +
  '.ft{margin-top:auto;padding-top:3.4mm}' +
  '.mo{display:flex;gap:3mm;align-items:flex-start}' +
  '.mo .lf{flex:1;display:flex;flex-direction:column;gap:2mm}' +
  '.mo .sm{width:52mm;flex:none}' +
  '.mo .sm .r{display:flex;justify-content:space-between;font-size:2.5mm;font-weight:600;padding:.9mm 0}' +
  '.mo .sm .r span{font-family:monospace;direction:ltr}' +
  '.mo .sm .g{display:flex;justify-content:space-between;align-items:baseline;background:' + COLORS.deep + ';' +
  'color:' + COLORS.sand + ';border-radius:2.2mm;padding:2.2mm 2.8mm;margin-top:1.4mm}' +
  '.mo .sm .g b{font-size:2.5mm;font-weight:700}' +
  ".mo .sm .g span{font-family:'El Messiri',serif;font-weight:700;font-size:4.6mm;direction:ltr;color:" + COLORS.gold + '}' +
  '.wr{background:' + COLORS.sand + ';border-radius:2.6mm;padding:2.3mm 2.7mm;font-size:2.2mm;' +
  'line-height:1.7;font-weight:600;color:rgba(20,52,63,.78)}' +
  ".wr b{display:block;font-family:'El Messiri',serif;font-size:2.8mm;color:" + COLORS.deep + ';' +
  'margin-bottom:.8mm;font-weight:700}' +
  '.bcr{display:flex;align-items:center;gap:2.6mm}' +
  '.bcr svg{height:9.5mm;width:auto;display:block}' +
  '.bcr .sg{flex:1;text-align:center;font-size:2.1mm;font-weight:700;color:rgba(20,52,63,.6);' +
  'border-top:.3mm solid rgba(20,52,63,.28);padding-top:1.1mm;margin-right:2mm}' +
  '.en{display:flex;justify-content:space-between;align-items:center;border-top:.45mm solid ' + COLORS.deep + ';' +
  'margin-top:2.6mm;padding-top:1.8mm;font-size:2.1mm;font-weight:700;color:rgba(20,52,63,.6)}';

/** فاتورة بيع A5 ملوّنة بألوان الهوية — فيها جدول مواد وتوقيع المستلِم. */
export function invoiceA5(inv: SaleInvoice): PrintableDoc {
  const T = totals(inv);

  const rows = inv.items.map((it, i) =>
    `<tr><td class="n cn">${i + 1}</td>` +
    `<td>${esc(it.name)}${it.imei ? `<span class="sn">IMEI ${esc(it.imei)}</span>` : ''}</td>` +
    `<td class="n">${n(it.qty)}</td>` +
    `<td class="n">${n(it.price)}</td>` +
    `<td class="e">${n(it.qty * it.price)}</td></tr>`,
  ).join('');

  const html =
    `<div class="tp"><div class="bd"><div class="bx">${MARK}</div><div>` +
    `<div class="nm">${SHOP.name}</div><div class="sb">${SHOP.latin}</div>` +
    `<div class="ad">${SHOP.address}<br>` +
    `<span dir="ltr">${phonesLine()}</span><br>` +
    `إنترنت <span dir="ltr">${SHOP.internet}</span></div></div></div>` +
    '<div class="dc"><div class="t">فاتورة بيع</div>' +
    `<div class="n">${esc(inv.no)}</div>` +
    `<div class="d">التاريخ <span dir="ltr">${esc(inv.date || today())}</span>` +
    ` · الساعة <span dir="ltr">${clock(inv.at)}</span></div></div></div>` +

    '<div class="wh"><div class="c"><div class="k">بيانات الزبون</div>' +
    `<div class="r"><b>الاسم</b><span>${esc(inv.customer)}</span></div>` +
    `<div class="r"><b>الهاتف</b><span class="mono">${esc(inv.phone) || '—'}</span></div></div>` +
    '<div class="c"><div class="k">بيانات الفاتورة</div>' +
    `<div class="r"><b>البائع</b><span>${esc(inv.seller) || '—'}</span></div>` +
    `<div class="r"><b>طريقة الدفع</b><span>${esc(inv.payment) || '—'}</span></div>` +
    `<div class="r"><b>الحالة</b><span>${T.rest ? 'متبقٍّ ' + money(T.rest) : 'مسدّدة بالكامل'}</span></div>` +
    '</div></div>' +

    '<table><thead><tr><th class="cn">ت</th><th>المادة</th>' +
    '<th style="width:11mm">الكمية</th><th style="width:17mm">السعر</th>' +
    `<th style="width:19mm">المجموع</th></tr></thead><tbody>${rows}</tbody></table>` +

    '<div class="ft"><div class="mo"><div class="lf">' +
    `<div class="wr"><b>الضمان والاستبدال</b>${WARRANTY.join('<br>')}` +
    (inv.note ? `<br><br>${esc(inv.note)}` : '') + '</div>' +
    `<div class="bcr">${Code128.svg(inv.no, { height: 38, module: 1, fontSize: 10 })}` +
    '<span class="sg">توقيع المستلِم</span></div></div>' +

    '<div class="sm">' +
    `<div class="r"><b>المجموع الفرعي</b><span>${money(T.subtotal)}</span></div>` +
    `<div class="r"><b>الخصم</b><span>${T.discount ? '‎−' + money(T.discount) : '—'}</span></div>` +
    `<div class="r"><b>عدد المواد</b><span>${n(T.count)}</span></div>` +
    `<div class="g"><b>الإجمالي</b><span>${n(T.grand)}</span></div>` +
    `<div class="r" style="padding-top:1.8mm"><b>المدفوع</b><span>${money(T.paid)}</span></div>` +
    `<div class="r"><b>المتبقّي</b><span>${T.rest ? money(T.rest) : '0 د.ع'}</span></div>` +
    '</div></div>' +

    `<div class="en"><span>${SHOP.tagline}</span>` +
    '<span dir="ltr">SUFYAN MOBILE · SAMARRA</span></div></div>';

  return { html, css: INVOICE_A5_CSS, paper: 'A5 — 148 × 210 مم' };
}
