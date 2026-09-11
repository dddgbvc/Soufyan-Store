/**
 * مجموعة الأيقونات والرسوم — SVG مضمّن بالكامل.
 * لا ملفات خارجية ⇒ لا أصول مكسورة، ولا وميض قبل التحميل.
 *
 * كل الأيقونات: شبكة 24، سمك خطّ 1.75، أطراف مستديرة، وتأخذ لونها من
 * currentColor حتى تتبع السمة تلقائيًا.
 */

const stroke = (path, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${path}</svg>`;

export const ICONS = {
  cart: stroke(`
    <path d="M3 4h2.2l1.9 10.2a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.6L20 7H6.4"/>
    <circle cx="10" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>`),

  receipt: stroke(`
    <path d="M6 3.5h12v17l-2.4-1.6L13.2 20.5 12 19.3l-1.2 1.2-2.4-1.4L6 20.5z"/>
    <path d="M9.4 8h5.2M9.4 11.5h5.2M9.4 15h3"/>`),

  clock: stroke(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>`),

  card: stroke(`
    <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2.75"/>
    <path d="M2.75 9.75h18.5M6.5 14.75h3.5"/>`),

  check: stroke(`<path d="M5 12.8 9.6 17.4 19 8"/>`),

  checkCircle: stroke(`<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/>`),

  pause: stroke(`<circle cx="12" cy="12" r="8.5"/><path d="M10 9.4v5.2M14 9.4v5.2"/>`),

  slash: stroke(`<circle cx="12" cy="12" r="8.5"/><path d="M6.6 17.4 17.4 6.6"/>`),

  alert: stroke(`<path d="M12 4.5 21 19.5H3z"/><path d="M12 10v4"/><path d="M12 17.2h.01"/>`),

  link: stroke(`
    <path d="M10 13.8a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 1 0-5.7-5.7l-1.3 1.3"/>
    <path d="M14 10.2a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.3-1.3"/>`),

  box: stroke(`
    <path d="M20.5 8.2 12 3.6 3.5 8.2v7.6L12 20.4l8.5-4.6z"/>
    <path d="M3.5 8.2 12 12.8l8.5-4.6M12 12.8v7.6"/>`),

  sun: stroke(`
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2.6v2.2M12 19.2v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>`),

  moon: stroke(`<path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4z"/>`),

  sliders: stroke(`
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8"/>
    <circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>`),

  play: stroke(`<path d="M8 5.6 18 12 8 18.4z"/>`),

  refresh: stroke(`
    <path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.4h-4.4"/>`),

  plus: stroke(`<path d="M12 5.5v13M5.5 12h13"/>`),
};

/** شعار المتجر الافتراضي — حرف «س» داخل درع ماسي بسيط. */
export const LOGO_SVG = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <path d="M24 4.5 40.5 12v13c0 9.3-6.7 16.6-16.5 18.9C14.2 41.6 7.5 34.3 7.5 25V12z"
        fill="currentColor" opacity="0.12"/>
  <path d="M24 4.5 40.5 12v13c0 9.3-6.7 16.6-16.5 18.9C14.2 41.6 7.5 34.3 7.5 25V12z"
        stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path d="M18.5 29.4c1.6 1 3.3 1.5 5.2 1.5 2.6 0 4-1 4-2.5 0-1.4-1-2.1-3.6-2.8-3.6-.9-5.4-2.3-5.4-5 0-3 2.6-5.1 6.4-5.1 1.9 0 3.6.4 5 1.2l-1.1 3c-1.2-.7-2.5-1-3.9-1-2.3 0-3.5.9-3.5 2.2 0 1.3 1 1.9 3.7 2.6 3.7 1 5.3 2.4 5.3 5.2 0 3.3-2.7 5.4-7 5.4-2.3 0-4.4-.6-6.1-1.7z"
        fill="currentColor"/>
</svg>`;

/** رسم شاشة الانتظار — إيصال ناعم مع نقاط تتنفّس. */
export const ART_IDLE = `
<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
  <circle class="art-idle__pulse" cx="100" cy="100" r="74" fill="currentColor" opacity="0.08"/>
  <circle class="art-idle__pulse" cx="100" cy="100" r="56" fill="currentColor" opacity="0.10"
          style="animation-delay:.6s"/>
  <path d="M68 52h64v100l-11-7.6-10.6 7.6L100 143l-10.4 9-10.6-7.6L68 152z"
        fill="var(--color-surface)" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round"/>
  <path class="art-idle__line" d="M82 76h36" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" opacity="0.8"/>
  <path class="art-idle__line" d="M82 94h36" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" opacity="0.55"/>
  <path class="art-idle__line" d="M82 112h22" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" opacity="0.35"/>
</svg>`;

/** رسم «جاري الدفع» — بطاقة داخل حلقة تدور مع موجات ناعمة. */
export const ART_PAYING = `
<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
  <circle class="art-paying__wave" cx="100" cy="100" r="78" fill="currentColor" opacity="0.10"/>
  <circle class="art-paying__wave" cx="100" cy="100" r="78" fill="currentColor" opacity="0.10"/>
  <g class="art-paying__ring">
    <circle cx="100" cy="100" r="62" stroke="currentColor" stroke-width="4"
            stroke-linecap="round" stroke-dasharray="58 331" opacity="0.9"/>
  </g>
  <rect x="62" y="80" width="76" height="46" rx="9"
        fill="var(--color-surface)" stroke="currentColor" stroke-width="3.4"/>
  <path d="M62 94h76" stroke="currentColor" stroke-width="3.4"/>
  <path d="M74 113h16" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" opacity="0.6"/>
</svg>`;

/** رسم النجاح — دائرة تُرسم ثم علامة صح. */
export const ART_SUCCESS = `
<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
  <circle class="art-check__halo" cx="100" cy="100" r="80" fill="currentColor" opacity="0.14"/>
  <circle class="art-check__circle" cx="100" cy="100" r="48" stroke="currentColor"
          stroke-width="6" stroke-linecap="round" transform="rotate(-90 100 100)"/>
  <path class="art-check__mark" d="M78 101.5 94 117.5 124 85" stroke="currentColor"
        stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** رسم «معلّقة» — ساعة إيقاف هادئة. */
export const ART_HELD = `
<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
  <circle class="art-idle__pulse" cx="100" cy="100" r="74" fill="currentColor" opacity="0.10"/>
  <circle cx="100" cy="104" r="46" fill="var(--color-surface)" stroke="currentColor" stroke-width="5"/>
  <path d="M92 92v24M108 92v24" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  <path d="M86 50h28" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M100 50v8" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/>
</svg>`;

/** رسم الإلغاء — هادئ ومحايد، بلا لون تحذيري صارخ. */
export const ART_CANCELLED = `
<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
  <circle cx="100" cy="100" r="74" fill="currentColor" opacity="0.08"/>
  <circle cx="100" cy="100" r="48" stroke="currentColor" stroke-width="5.5" opacity="0.85"/>
  <path d="M84 84l32 32" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  <path d="M116 84l-32 32" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
</svg>`;

/** رسم الخطأ. */
export const ART_ERROR = `
<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
  <circle cx="100" cy="100" r="74" fill="currentColor" opacity="0.09"/>
  <path d="M100 54 145 134H55z" fill="var(--color-surface)" stroke="currentColor"
        stroke-width="5.5" stroke-linejoin="round"/>
  <path d="M100 84v24" stroke="currentColor" stroke-width="6.5" stroke-linecap="round"/>
  <circle cx="100" cy="120" r="3.6" fill="currentColor"/>
</svg>`;

/** رسم الاتصال / التحميل. */
export const ART_LOADING = `
<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
  <circle cx="100" cy="100" r="64" stroke="currentColor" stroke-width="5" opacity="0.18"/>
  <g class="art-paying__ring">
    <circle cx="100" cy="100" r="64" stroke="currentColor" stroke-width="5"
            stroke-linecap="round" stroke-dasharray="42 360"/>
  </g>
  <path d="M74 100h52" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity="0.35"/>
</svg>`;

/** صورة بديلة للمنتجات بلا صورة — منسجمة مع النظام. */
export const PRODUCT_PLACEHOLDER = `
<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M41 16.4 24 8 7 16.4v15.2L24 40l17-8.4z"/>
  <path d="M7 16.4 24 24.8l17-8.4M24 24.8V40"/>
</svg>`;
