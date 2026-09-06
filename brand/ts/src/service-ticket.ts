/**
 * وصولات الصيانة — ثلاث صيغ من نفس البيانات:
 *
 * | الدالة | المقاس | الاستعمال |
 * |---|---|---|
 * | `serviceTicketA5` | 148 × 210 مم | نسختان على ورقة واحدة: المحل والزبون |
 * | `serviceReceipt80` | رول حراري 80 مم | نسخة الزبون من الطابعة الحرارية |
 * | `deviceLabel` | 90 × 50 مم | ستيكر يُلصق على الجهاز نفسه |
 */

import * as Code128 from './code128.js';
import { MARK, COLORS, SHOP, esc, money, phonesLine, clock, today } from './shop.js';
import { FAULT_KINDS, type ServiceTicket, type PrintableDoc } from './types.js';

/* ══════════════════ الوصل A5 ══════════════════ */

const A5_CSS =
  '@page{size:148mm 210mm;margin:0}' +
  'body{width:148mm;height:210mm;padding:9mm 10mm;display:flex;flex-direction:column}' +
  ".hd{display:flex;align-items:flex-start;justify-content:space-between;gap:5mm;padding-bottom:4mm;" +
  'border-bottom:.6mm solid ' + COLORS.deep + '}' +
  ".hd h1{font-family:'El Messiri',serif;font-weight:700;font-size:6.4mm;color:" + COLORS.deep + '}' +
  '.hd .no{font-size:3mm;font-weight:600;color:rgba(20,52,63,.7);margin-top:1.4mm}' +
  '.hd .no b{font-family:monospace;font-size:4mm;color:' + COLORS.teal + ';letter-spacing:.3mm}' +
  '.hd .lg{display:flex;align-items:center;gap:2.6mm;flex:none}' +
  '.hd .lg svg.m{width:11mm}' +
  ".hd .nm{font-family:'El Messiri',serif;font-weight:700;font-size:4.4mm;color:" + COLORS.deep + '}' +
  '.hd .sb{font-size:1.8mm;font-weight:700;letter-spacing:1mm;direction:ltr;color:' + COLORS.teal + '}' +
  '.sec{border-top:.3mm solid rgba(20,52,63,.14);padding:3mm 0}' +
  '.sec .k{font-size:2.4mm;font-weight:700;letter-spacing:.5mm;color:' + COLORS.teal + ';padding-bottom:1.6mm}' +
  '.f{display:flex;align-items:flex-end;gap:2.6mm;padding:1.1mm 0}' +
  '.f .l{width:26mm;flex:none;font-size:2.9mm;font-weight:700;color:' + COLORS.deep + '}' +
  '.f .v{flex:1;border-bottom:.25mm dotted rgba(20,52,63,.4);min-height:5mm;' +
  'font-size:3mm;font-weight:600;color:' + COLORS.teal + '}' +
  '.f .v.mono{font-family:monospace;direction:ltr;text-align:right}' +
  '.f.tall .v{min-height:11mm;line-height:1.5}' +
  '.g2{display:grid;grid-template-columns:1fr 1fr;gap:0 5mm}' +
  '.fl{display:grid;grid-template-columns:repeat(3,1fr);gap:1.6mm 3mm;margin-top:1.5mm}' +
  '.fl span{display:flex;align-items:center;gap:1.8mm;font-size:3.1mm;font-weight:600;color:' + COLORS.deep + '}' +
  '.fl i{width:3.4mm;height:3.4mm;border:.4mm solid rgba(20,52,63,.5);border-radius:.9mm;flex:none;' +
  'display:inline-block;position:relative}' +
  '.fl i.on{background:' + COLORS.teal + ';border-color:' + COLORS.teal + '}' +
  ".fl i.on:after{content:'';position:absolute;left:1.1mm;top:.35mm;width:.9mm;height:1.8mm;" +
  'border:solid #fff;border-width:0 .45mm .45mm 0;transform:rotate(45deg)}' +
  '.bc{display:flex;align-items:center;justify-content:space-between;gap:4mm;background:#FBF9F5;' +
  'border:.35mm solid rgba(20,52,63,.12);border-radius:3mm;padding:2.6mm 4mm;margin-top:auto}' +
  '.bc svg{height:13mm;width:auto;display:block}' +
  '.tm{font-size:2.4mm;line-height:1.7;color:rgba(20,52,63,.65)}' +
  '.tear{display:flex;align-items:center;gap:2.5mm;margin:3mm 0;color:rgba(20,52,63,.45)}' +
  ".tear:before,.tear:after{content:'';flex:1;border-top:.4mm dashed currentColor}" +
  '.tear span{font-size:2.4mm;font-weight:700;letter-spacing:.5mm}' +
  '.stub{background:' + COLORS.sand + ';border-radius:3mm;padding:3mm 4mm;display:flex;' +
  'align-items:center;justify-content:space-between;gap:4mm}' +
  ".stub .w{font-family:'El Messiri',serif;font-weight:700;font-size:4.2mm;color:" + COLORS.deep + '}' +
  '.stub .a{font-size:2.7mm;color:rgba(20,52,63,.72);font-weight:600;margin-top:1mm}' +
  '.stub .n{font-family:monospace;font-size:4.6mm;font-weight:700;color:' + COLORS.deep + ';letter-spacing:.3mm}';

const TERMS = [
  'المحل غير مسؤول عن البيانات داخل الجهاز — يُرجى أخذ نسخة احتياطية.',
  'الجهاز غير المستلَم خلال 30 يومًا من موعد التسليم لا يتحمّل المحل مسؤوليته.',
  'لا يُسلَّم الجهاز إلا بإبراز هذا الوصل أو مسح الباركود.',
  'الكلفة تقديرية وقد تتغيّر بعد الفحص، ولا يُباشَر التصليح إلا بموافقتك.',
];

/** وصل الصيانة A5 — نسخة المحل ونسخة الزبون على ورقة واحدة. */
export function serviceTicketA5(t: ServiceTicket): PrintableDoc {
  const chips = FAULT_KINDS
    .map((f) => `<span><i class="${t.faults.includes(f) ? 'on' : ''}"></i>${esc(f)}</span>`)
    .join('');

  const html =
    '<div class="hd"><div><h1>وصل استلام صيانة</h1>' +
    `<div class="no">رقم الوصل <b>${esc(t.no)}</b></div></div>` +
    `<div class="lg">${MARK}<div><div class="nm">${SHOP.name}</div>` +
    `<div class="sb">${SHOP.latin}</div></div></div></div>` +

    '<div class="sec" style="border:0"><div class="k">بيانات الزبون</div>' +
    field('اسم الزبون', t.customer) +
    field('رقم الهاتف', t.phone, true) + '</div>' +

    '<div class="sec"><div class="k">بيانات الجهاز</div>' +
    field('نوع الهاتف', t.device) +
    field('رقم الجهاز IMEI', t.imei, true) +
    '<div class="g2">' +
    field('رمز القفل', t.lockCode, true, '19mm') +
    field('الملحقات', t.accessories, false, '19mm') +
    '</div></div>' +

    `<div class="sec"><div class="k">نوع الخلل</div><div class="fl">${chips}</div>` +
    `<div class="f tall"><span class="l">وصف الخلل</span><span class="v">${esc(t.description)}</span></div></div>` +

    '<div class="sec"><div class="g2">' +
    field('تاريخ الاستلام', t.dateIn, true) +
    field('موعد التسليم', t.dateOut, true) +
    field('الكلفة التقديرية', money(t.cost), true) +
    field('المدفوع مقدّمًا', money(t.paid), true) +
    '</div></div>' +

    `<div class="bc">${Code128.svg(t.no, { height: 56, module: 2, fontSize: 12 })}` +
    `<div class="tm"><b>شروط الاستلام</b><br>${TERMS.map((l) => '• ' + l).join('<br>')}</div></div>` +

    '<div class="tear"><span>قص هنا — نسخة الزبون</span></div>' +

    `<div class="stub"><div><div class="w">${SHOP.name}</div>` +
    `<div class="a">${SHOP.address}<span dir="ltr" style="color:${COLORS.teal}"> · ${SHOP.phones[0]}</span>` +
    `<br>إنترنت <span dir="ltr" style="color:${COLORS.teal}">${SHOP.internet}</span></div></div>` +
    `<div style="text-align:left"><div class="a" style="margin:0">رقم الوصل</div>` +
    `<div class="n">${esc(t.no)}</div></div></div>`;

  return { html, css: A5_CSS, paper: 'A5 — 148 × 210 مم' };
}

function field(label: string, value: string | undefined, mono = false, width?: string): string {
  const w = width ? ` style="width:${width}"` : '';
  return `<div class="f"><span class="l"${w}>${label}</span>` +
    `<span class="v${mono ? ' mono' : ''}">${esc(value)}</span></div>`;
}

/* ══════════════════ الوصل الحراري 80 مم ══════════════════ */

/**
 * القواعد المشتركة بين الوصل الحراري وفاتورة البيع الحرارية.
 * الطابعة أحادية اللون: أسود على أبيض فقط، بلا رمادي ولا تدرّجات.
 */
export const THERMAL_CSS =
  '@page{size:80mm auto;margin:0}' +
  'body{width:80mm;padding:4mm;color:#000}' +
  'body *{color:#000}' +
  '.lg{display:flex;flex-direction:column;align-items:center;gap:1.4mm;padding-bottom:2.5mm}' +
  '.lg svg.m{width:9mm}.lg svg.m path{stroke:#000}.lg svg.m path.acc{stroke:#000}' +
  ".lg .nm{font-family:'El Messiri',serif;font-weight:700;font-size:4.6mm;line-height:1.15}" +
  '.lg .sb{font-size:1.9mm;font-weight:700;letter-spacing:1.1mm;direction:ltr}' +
  '.lg .ad{font-size:2.5mm;font-weight:600;text-align:center;line-height:1.6;margin-top:.8mm}' +
  '.hr{border-top:.4mm dashed #000;margin:1.8mm 0}.hr.s{border-top:.5mm solid #000}' +
  ".ttl{text-align:center;font-family:'El Messiri',serif;font-weight:700;font-size:4mm;padding:.6mm 0}" +
  '.no{text-align:center;font-family:monospace;font-size:5mm;font-weight:700;' +
  'letter-spacing:.5mm;direction:ltr;padding-bottom:1mm}' +
  '.kv{display:flex;justify-content:space-between;gap:2mm;padding:.9mm 0;font-size:2.9mm;line-height:1.5}' +
  '.kv b{font-weight:700;flex:none}.kv span{font-weight:600;text-align:left;overflow-wrap:anywhere}' +
  '.kv span.mono{font-family:monospace;direction:ltr}' +
  '.lb{font-size:2.3mm;font-weight:700;letter-spacing:.5mm;padding:1mm 0 .6mm}' +
  '.tx{font-size:2.9mm;font-weight:600;line-height:1.7}' +
  '.fl{display:flex;flex-wrap:wrap;gap:1.2mm;padding-top:.6mm}' +
  '.fl span{border:.3mm solid #000;border-radius:.8mm;padding:.5mm 1.8mm;font-size:2.5mm;font-weight:700}' +
  '.tot{display:flex;justify-content:space-between;align-items:baseline;border:.5mm solid #000;' +
  'border-radius:1.2mm;padding:2mm 2.6mm;margin-top:1.5mm}' +
  ".tot b{font-size:2.9mm}.tot .v{font-family:'El Messiri',serif;font-weight:700;font-size:4.6mm;direction:ltr}" +
  '.bc{display:flex;justify-content:center;padding:2.6mm 0}.bc svg{height:12mm;width:auto;display:block}' +
  '.tm{font-size:2.2mm;line-height:1.75;padding:1.4mm 0}.tm b{display:block;font-size:2.3mm;margin-bottom:.6mm}' +
  ".th{text-align:center;font-family:'El Messiri',serif;font-weight:700;font-size:3.3mm;padding-top:1.8mm}";

/** ترويسة الرول الحراري — الشعار والاسم والعنوان والأرقام. */
export function thermalHeader(): string {
  return `<div class="lg">${MARK}<div class="nm">${SHOP.name}</div>` +
    `<div class="sb">${SHOP.latin}</div>` +
    `<div class="ad">${SHOP.address}<br>` +
    `<span dir="ltr">${phonesLine()}</span><br>` +
    `إنترنت: <span dir="ltr">${SHOP.internet}</span></div></div>`;
}

/** صف مفتاح/قيمة على الرول — يُحذف كليًا إذا كانت القيمة فارغة. */
export function kv(label: string, value: string | undefined, mono = false): string {
  if (!value) return '';
  return `<div class="kv"><b>${label}</b><span${mono ? ' class="mono"' : ''}>${esc(value)}</span></div>`;
}

/** وصل الصيانة الحراري 80 مم — نسخة الزبون بكل بياناته. */
export function serviceReceipt80(t: ServiceTicket): PrintableDoc {
  const rest = Math.max(0, (t.cost ?? 0) - (t.paid ?? 0));

  const html =
    thermalHeader() +
    '<div class="hr s"></div><div class="ttl">وصل استلام صيانة</div>' +
    `<div class="no">${esc(t.no)}</div>` +

    '<div class="hr"></div>' +
    kv('التاريخ', `${t.dateIn || today()} · ${clock(t.at)}`, true) +
    kv('الموظّف', t.staff) +

    '<div class="hr"></div><div class="lb">بيانات الزبون</div>' +
    kv('الاسم', t.customer) + kv('الهاتف', t.phone, true) +

    '<div class="hr"></div><div class="lb">بيانات الجهاز</div>' +
    kv('الجهاز', t.device, true) + kv('IMEI', t.imei, true) +
    kv('رمز القفل', t.lockCode, true) + kv('الملحقات', t.accessories) +

    (t.faults.length
      ? '<div class="hr"></div><div class="lb">نوع الخلل</div><div class="fl">' +
        t.faults.map((f) => `<span>${esc(f)}</span>`).join('') + '</div>'
      : '') +
    (t.description ? `<div class="lb">وصف الخلل</div><div class="tx">${esc(t.description)}</div>` : '') +

    '<div class="hr"></div>' +
    kv('موعد التسليم', t.dateOut, true) +
    kv('الكلفة التقديرية', money(t.cost), true) +
    kv('المدفوع مقدّمًا', money(t.paid), true) +
    `<div class="tot"><b>المتبقّي عند الاستلام</b><span class="v">${rest ? rest.toLocaleString('en-US') : '0'}</span></div>` +

    `<div class="bc">${Code128.svg(t.no, { height: 56, module: 2, fontSize: 12 })}</div>` +

    `<div class="hr"></div><div class="tm"><b>شروط الاستلام</b>${TERMS.map((l) => '• ' + l).join('<br>')}</div>` +
    '<div class="hr"></div><div class="th">شكرًا لثقتك</div>';

  return { html, css: THERMAL_CSS, paper: 'رول حراري 80 مم — طول متغيّر' };
}

/* ══════════════════ ستيكر الجهاز 90 × 50 مم ══════════════════ */

const DEVICE_LABEL_CSS =
  '@page{size:90mm 50mm;margin:0}' +
  'body{width:90mm;height:50mm;padding:3mm 3.5mm;display:flex;flex-direction:column}' +
  '.t{display:flex;align-items:center;justify-content:space-between;gap:2mm;' +
  'border-bottom:.5mm solid ' + COLORS.deep + ';padding-bottom:1.5mm}' +
  '.t svg.m{width:6mm}' +
  ".t .ti{font-family:'El Messiri',serif;font-weight:700;font-size:3.4mm;color:" + COLORS.deep + '}' +
  '.t .nn{font-family:monospace;direction:ltr;font-size:3mm;font-weight:700;color:' + COLORS.teal + ';letter-spacing:.2mm}' +
  '.rw{flex:1;display:flex;flex-direction:column;justify-content:center;gap:.4mm}' +
  '.r{display:flex;align-items:flex-end;gap:1.6mm;font-size:2.6mm}' +
  '.r b{width:13mm;flex:none;color:' + COLORS.deep + '}' +
  '.r span{flex:1;border-bottom:.25mm dotted rgba(20,52,63,.4);min-height:3.4mm;color:' + COLORS.teal + ';font-weight:600}' +
  '.r span.mono{font-family:monospace;direction:ltr;text-align:right}' +
  '.bt{display:flex;align-items:center;justify-content:space-between;gap:2mm;' +
  'border-top:.3mm solid rgba(20,52,63,.15);padding-top:1.4mm}' +
  '.bt svg{height:7mm;width:auto;display:block}' +
  '.bt .ph{font-size:2.3mm;font-weight:700;color:' + COLORS.deep + ';direction:ltr}';

/** ستيكر يُلصق على الجهاز نفسه أثناء وجوده في المحل — 90 × 50 مم. */
export function deviceLabel(t: ServiceTicket): PrintableDoc {
  const row = (label: string, value: string | undefined, mono = false) =>
    `<div class="r"><b>${label}</b><span${mono ? ' class="mono"' : ''}>${esc(value)}</span></div>`;

  const html =
    `<div class="t">${MARK}<span class="ti">وصل صيانة</span>` +
    `<span class="nn">${esc(t.no)}</span></div>` +
    '<div class="rw">' +
    row('الزبون', t.customer) +
    row('الهاتف', t.phone, true) +
    row('الجهاز', t.device, true) +
    row('IMEI', t.imei, true) +
    row('الخلل', t.faults.join(' + ') || t.description) +
    '</div>' +
    `<div class="bt">${Code128.svg(t.no, { height: 34, module: 1, text: false })}` +
    `<span class="ph">${SHOP.phones[0]}</span></div>`;

  return { html, css: DEVICE_LABEL_CSS, paper: '90 × 50 مم' };
}
