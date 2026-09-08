/**
 * Trial24 — مكوّنات مشتركة بين الشاشات
 * العدّاد هو العنصر البصري الرئيسي، ويُغذّى من ساعة الخادم فقط.
 */

import { onTick, serverNow } from './clock.js';
import {
  URGENCY_TONE,
  STATUS_BADGE,
  DEVICE_BADGE,
  countdown,
  dateTime,
  dayLabel,
  durationHuman,
  esc,
  icon,
  initials,
  money,
  timeOnly,
  urgencyFor,
} from './format.js';
import { store } from './state.js';

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

/** شارة حالة التجربة. */
export function statusBadge(trial) {
  const tone = STATUS_BADGE[trial.status] || 'muted';
  const label = store.labels.trialStatus?.[trial.status] || trial.status;
  return `<span class="badge badge--${tone}"><span class="badge__dot"></span>${esc(label)}</span>`;
}

export function deviceBadge(device) {
  const tone = DEVICE_BADGE[device.status] || 'muted';
  const label = store.labels.deviceStatus?.[device.status] || device.status;
  return `<span class="badge badge--${tone}"><span class="badge__dot"></span>${esc(label)}</span>`;
}

/** بطاقة مؤشر في لوحة المعلومات. */
export function metricCard({ key, label, value, unit = '', foot = '', iconName, tone, toneSoft, index = 0, active = false, clickable = true, wide = false }) {
  const tag = clickable ? 'button' : 'div';
  return `<${tag} class="metric${wide ? ' metric--wide' : ''}" ${clickable ? `data-metric="${esc(key)}"` : ''} data-active="${active}"
      style="--tone:${tone};--tone-soft:${toneSoft};--stagger:${index * 45}ms">
      <div class="metric__top">
        <span class="metric__icon">${icon(iconName)}</span>
        <span class="metric__label">${esc(label)}</span>
      </div>
      <div class="metric__value">${esc(String(value))}${unit ? `<span class="metric__unit">${esc(unit)}</span>` : ''}</div>
      ${foot ? `<div class="metric__foot">${esc(foot)}</div>` : ''}
    </${tag}>`;
}

// ——————————————————————— العدّاد الرئيسي ———————————————————————

/**
 * عدّاد التجربة الكبير: حلقة تقدّم + رقم HH:MM:SS + حالة.
 * القيم الأولية تُرسم من الخادم، ثم يحدّثها المؤقّت الموحّد كل ثانية.
 */
export function countdownHero(trial) {
  return `
    <div class="countdown" data-countdown-hero data-trial="${esc(trial.id)}"
         data-start="${trial.startAt}" data-end="${trial.endAt}" data-status="${esc(trial.status)}">
      <div class="countdown__ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="countdown__track" cx="60" cy="60" r="${RING_R}" fill="none" stroke-width="7"/>
          <circle class="countdown__progress" cx="60" cy="60" r="${RING_R}" fill="none" stroke-width="7"
                  stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="0"/>
        </svg>
        <div class="countdown__center">
          <div class="countdown__time" data-cd-time role="timer" aria-live="off">--:--:--</div>
          <div class="countdown__caption" data-cd-caption></div>
        </div>
      </div>
      <div class="countdown__state" data-cd-state></div>
      <div class="countdown__caption" data-cd-hint style="text-align:center;max-width:38ch"></div>
    </div>`;
}

/** ربط العدّاد الكبير بنبضة الساعة. يُعيد دالة إلغاء الاشتراك. */
export function bindCountdownHero(root, trial, { onExpire } = {}) {
  const el = root.querySelector('[data-countdown-hero]');
  if (!el) return () => {};

  const timeEl = el.querySelector('[data-cd-time]');
  const captionEl = el.querySelector('[data-cd-caption]');
  const stateEl = el.querySelector('[data-cd-state]');
  const hintEl = el.querySelector('[data-cd-hint]');
  const ring = el.querySelector('.countdown__progress');

  const total = Math.max(1, trial.endAt - trial.startAt);
  let lastUrgency = null;
  // ينطلق مرة واحدة، وفقط لتجربة كانت جارية عند فتح الشاشة —
  // تجربة منتهية أصلًا لا تُعيد التحميل في حلقة.
  let expiredFired = trial.status !== 'active';

  const update = (now) => {
    const closed = ['returned', 'purchased', 'cancelled'].includes(trial.status);
    const remaining = trial.endAt - now;
    const urgency = closed ? 'closed' : urgencyFor(trial, now);
    const tone = URGENCY_TONE[urgency];

    if (closed) {
      const actual = trial.actualDurationMs ?? (trial.closedAt || now) - trial.startAt;
      timeEl.textContent = countdown(actual).text;
      captionEl.textContent = `المدة الفعلية — أُغلقت ${dateTime(trial.closedAt)}`;
      ring.style.strokeDashoffset = '0';
    } else {
      const fraction = Math.max(0, Math.min(1, remaining / total));
      const cd = countdown(remaining);
      timeEl.textContent = remaining < 0 ? `+${cd.text}` : cd.text;
      captionEl.textContent =
        remaining > 0
          ? `تنتهي ${dayLabel(trial.endAt, now)} — ${timeOnly(trial.endAt)}`
          : `تجاوزت الموعد بـ ${durationHuman(-remaining)}`;
      ring.style.strokeDashoffset = (RING_C * (1 - fraction)).toFixed(2);
      if (remaining <= 0 && !expiredFired) {
        expiredFired = true;
        onExpire?.();
      }
    }

    if (urgency !== lastUrgency) {
      lastUrgency = urgency;
      el.dataset.urgency = urgency;
      el.style.setProperty('--tone', tone.color);
      el.style.setProperty('--tone-glow', tone.soft);
      stateEl.innerHTML = `<span class="badge badge--${tone.badge}${urgency === 'critical' ? ' badge--pulse' : ''}"><span class="badge__dot"></span>${esc(tone.label)}</span>`;
      hintEl.textContent =
        urgency === 'critical'
          ? 'تبقّت أقل من ساعة — يُفضَّل التواصل مع العميل الآن.'
          : urgency === 'ending_soon'
            ? 'التجربة تقارب نهايتها — تأكد من جاهزية قرار العميل.'
            : urgency === 'expired'
              ? 'انتهى الوقت المسموح — الجهاز ما زال خارج المتجر.'
              : '';
    }
  };

  return onTick(update);
}

// ——————————————————————— صفوف التجارب ———————————————————————

/** صف تجربة في القائمة مع عدّاد مصغّر. */
export function trialRow(trial) {
  return `
    <button class="trial-row" data-trial-link="${esc(trial.id)}"
            data-start="${trial.startAt}" data-end="${trial.endAt}" data-status="${esc(trial.status)}">
      <div class="trial-row__main">
        <div class="trial-row__title">${esc(trial.customerName)}</div>
        <div class="trial-row__meta"><span class="num">${esc(trial.code)}</span> · <span class="num">${esc(trial.customerPhone || '')}</span></div>
      </div>
      <div class="trial-row__cell">
        <span class="trial-row__k">الجهاز</span>
        <span class="trial-row__v">${esc(trial.deviceName)}</span>
      </div>
      <div class="trial-row__cell trial-row__cell--hide">
        <span class="trial-row__k">الموظف</span>
        <span class="trial-row__v">${esc(trial.employeeName)}</span>
      </div>
      <div class="trial-row__cell trial-row__cell--hide">
        <span class="trial-row__k">تنتهي</span>
        <span class="trial-row__v">
          <span class="num">${timeOnly(trial.endAt)}</span> · ${esc(dayLabel(trial.endAt, serverNow()))}
        </span>
      </div>
      <div class="row row--tight" style="justify-content:flex-end">
        <span class="mini-count" data-mini-count>
          <span class="mini-count__bar"><span class="mini-count__fill" style="width:0%"></span></span>
          <span data-mini-text>--:--</span>
        </span>
        ${statusBadge(trial)}
      </div>
    </button>`;
}

/** ربط كل العدّادات المصغّرة داخل حاوية واحدة بنبضة واحدة. */
export function bindMiniCountdowns(root) {
  const rows = [...root.querySelectorAll('[data-trial-link]')];
  if (!rows.length) return () => {};

  const items = rows.map((row) => {
    const start = Number(row.dataset.start);
    const end = Number(row.dataset.end);
    return {
      row,
      start,
      end,
      status: row.dataset.status,
      total: Math.max(1, end - start),
      text: row.querySelector('[data-mini-text]'),
      fill: row.querySelector('.mini-count__fill'),
      wrap: row.querySelector('[data-mini-count]'),
      lastUrgency: null,
    };
  });

  return onTick((now) => {
    for (const it of items) {
      const closed = ['returned', 'purchased', 'cancelled'].includes(it.status);
      if (closed) {
        if (it.lastUrgency !== 'closed') {
          it.lastUrgency = 'closed';
          it.wrap.style.setProperty('--tone', 'var(--text-3)');
          it.text.textContent = durationHuman(it.end - it.start);
          it.fill.style.width = '100%';
          it.fill.style.background = 'var(--text-3)';
          it.row.style.removeProperty('--tone');
        }
        continue;
      }

      const remaining = it.end - now;
      const urgency = urgencyFor({ status: it.status, endAt: it.end }, now);
      const tone = URGENCY_TONE[urgency];
      const cd = countdown(remaining);
      it.text.textContent = remaining > 0 ? cd.text : `+${cd.text}`;
      it.fill.style.width = `${Math.max(0, Math.min(100, (remaining / it.total) * 100)).toFixed(1)}%`;

      if (urgency !== it.lastUrgency) {
        it.lastUrgency = urgency;
        it.wrap.style.setProperty('--tone', tone.color);
        it.row.style.setProperty('--tone', tone.color);
      }
    }
  });
}

// ——————————————————————— قطع صغيرة ———————————————————————

export const kvRow = (k, v) => `
  <div class="kv__row"><span class="kv__k">${esc(k)}</span><span class="kv__v">${v}</span></div>`;

export const factCell = (k, v) => `
  <div class="fact"><span class="fact__k">${esc(k)}</span><span class="fact__v">${v}</span></div>`;

export function customerPick(customer, { selected = false, disabled = false } = {}) {
  const blocked = customer.blocked;
  const busy = Boolean(customer.openTrialId);
  return `
    <button type="button" class="pick" data-pick-customer="${esc(customer.id)}"
            aria-pressed="${selected}" ${disabled || blocked || busy ? 'disabled' : ''}>
      <span class="pick__avatar">${esc(initials(customer.name))}</span>
      <span class="pick__main">
        <span class="pick__title">${esc(customer.name)}</span>
        <span class="pick__sub"><span class="num">${esc(customer.phone)}</span> · ${esc(customer.city || '—')}</span>
      </span>
      <span class="pick__end">
        ${blocked ? '<span class="badge badge--danger">موقوف</span>' : ''}
        ${busy ? '<span class="badge badge--warn">لديه تجربة مفتوحة</span>' : ''}
        ${!blocked && !busy && customer.trusted ? '<span class="badge badge--ok">موثوق</span>' : ''}
      </span>
    </button>`;
}

export function devicePick(device, { selected = false } = {}) {
  const available = device.status === 'available';
  return `
    <button type="button" class="pick" data-pick-device="${esc(device.id)}"
            aria-pressed="${selected}" ${available ? '' : 'disabled'}>
      <span class="pick__avatar">${esc(device.brand.slice(0, 2))}</span>
      <span class="pick__main">
        <span class="pick__title">${esc(device.brand)} ${esc(device.model)}</span>
        <span class="pick__sub">${esc(device.storage)} · ${esc(device.color)} · بطارية ${device.batteryHealth}%</span>
      </span>
      <span class="pick__end">
        <span class="num" style="font-size:var(--fs-xs);font-weight:600">${money(device.price)}</span>
        ${deviceBadge(device)}
      </span>
    </button>`;
}
