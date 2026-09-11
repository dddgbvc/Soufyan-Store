/**
 * الهيدر — هوية المتجر + حالة العملية.
 * بسيط عمدًا: لا أدوات إدارة، لا أزرار، لا معلومات داخلية للموظّف.
 */

import { el, svg, setText, setData } from '../core/dom.js';
import { ICONS, LOGO_SVG } from './icons.js';
import { formatTime } from '../core/format.js';

/** خريطة الحالة ⇒ الشكل البصري. لكل حالة أيقونة ونص، لا لون وحده. */
const STATUS_VIEW = {
  loading: { label: 'جارٍ الاتصال', icon: 'link', variant: 'neutral' },
  idle: { label: 'بانتظار عملية جديدة', icon: 'clock', variant: 'neutral' },
  browsing: { label: 'فاتورتك قيد الإعداد', icon: 'cart', variant: 'primary' },
  paying: { label: 'جاري إتمام الدفع', icon: 'card', variant: 'primary', pulsing: true },
  paid: { label: 'تمت العملية', icon: 'checkCircle', variant: 'success' },
  held: { label: 'بانتظار إتمام الدفع', icon: 'pause', variant: 'warning' },
  cancelled: { label: 'أُلغيت العملية', icon: 'slash', variant: 'neutral' },
  error: { label: 'تعذّر الاتصال', icon: 'alert', variant: 'danger' },
};

export function createHeader(store, { config }) {
  const logoBox = el('div', { class: 'masthead__logo' });
  if (config.store.logoUrl) {
    const img = el('img', { src: config.store.logoUrl, alt: '' });
    // لو فشل تحميل الشعار الخارجي نعود للشعار المدمج بدل صورة مكسورة
    img.addEventListener('error', () => {
      logoBox.replaceChildren(svg(LOGO_SVG));
    });
    logoBox.append(img);
  } else {
    logoBox.append(svg(LOGO_SVG));
  }

  const nameEl = el('div', { class: 'masthead__name', text: config.store.name });
  const branchEl = el('div', { class: 'masthead__branch', text: config.store.branch });

  const greetingEl = el('div', { class: 'masthead__greeting', text: 'مرحبًا بك' });

  const pillIcon = el('span', { class: 'pill__icon' });
  const pillLabel = el('span');
  const pillEl = el('span', { class: 'pill pill--neutral', role: 'status', 'aria-live': 'polite' }, [
    pillIcon,
    pillLabel,
  ]);

  const clockEl = el('span', { class: 'pill pill--neutral' }, [
    el('span', { class: 'pill__icon' }, [svg(ICONS.clock)]),
    el('span', { class: 'masthead__clock', text: formatTime() }),
  ]);
  const clockText = clockEl.querySelector('.masthead__clock');

  const root = el('header', { class: 'masthead' }, [
    el('div', { class: 'masthead__brand' }, [
      logoBox,
      el('div', { class: 'masthead__titles' }, [nameEl, branchEl]),
    ]),
    el('div', { class: 'masthead__meta' }, [greetingEl, pillEl, clockEl]),
  ]);

  // ساعة تتحدّث كل ثلاثين ثانية — كافٍ لعرض الدقائق دون عمل زائد
  const clockTimer = setInterval(() => setText(clockText, formatTime()), 30_000);

  let currentIcon = '';

  function render(session) {
    const view = STATUS_VIEW[session.status] ?? STATUS_VIEW.idle;

    setText(pillLabel, view.label);
    pillEl.className = `pill pill--${view.variant}${view.pulsing ? ' pill--pulsing' : ''}`;

    if (currentIcon !== view.icon) {
      pillIcon.replaceChildren(svg(ICONS[view.icon]));
      currentIcon = view.icon;
    }

    // التحية تتغيّر بحسب مرحلة العملية
    const greeting =
      session.status === 'paid'
        ? 'شكرًا لتسوّقك معنا'
        : session.items.length > 0
          ? 'فاتورتك'
          : 'مرحبًا بك';
    setText(greetingEl, greeting);

    setData(root, 'status', session.status);
  }

  store.subscribe(render);

  return { root, destroy: () => clearInterval(clockTimer) };
}
