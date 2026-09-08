/**
 * Trial24 — التنسيق والعرض
 * أرقام لاتينية بعرض ثابت، وتواريخ بتوقيت المتجر.
 */

import { store } from './state.js';

const tz = () => store.settings?.timezone || 'Asia/Baghdad';
const currency = () => store.settings?.currency || 'IQD';

/** حماية أساسية: كل نص يأتي من البيانات يمر من هنا قبل حقنه في HTML. */
export function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const money = (n) => `${Number(n || 0).toLocaleString('en-US')} ${currency()}`;
export const moneyShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}م`;
  if (v >= 1000) return `${Math.round(v / 1000)}ألف`;
  return String(v);
};

const dtf = (opts) =>
  new Intl.DateTimeFormat('ar-IQ', { timeZone: tz(), numberingSystem: 'latn', ...opts });

export const dateTime = (ms) => (ms ? dtf({ dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)) : '—');
export const timeOnly = (ms) => (ms ? dtf({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) : '—');
export const dateOnly = (ms) => (ms ? dtf({ dateStyle: 'medium' }).format(new Date(ms)) : '—');
export const clockTime = (ms) =>
  dtf({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ms));

/** يوم مقروء: اليوم / غدًا / أمس / التاريخ. */
export function dayLabel(ms, now) {
  if (!ms) return '—';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' });
  const target = fmt.format(new Date(ms));
  const today = fmt.format(new Date(now));
  const tomorrow = fmt.format(new Date(now + 86400000));
  const yesterday = fmt.format(new Date(now - 86400000));
  if (target === today) return 'اليوم';
  if (target === tomorrow) return 'غدًا';
  if (target === yesterday) return 'أمس';
  return dateOnly(ms);
}

/** أجزاء العدّاد بصيغة HH:MM:SS (تتجاوز 24 ساعة بلا التفاف). */
export function countdown(ms) {
  const negative = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    negative,
    hours: h,
    text: `${pad(h)}:${pad(m)}:${pad(s)}`,
    short: h > 0 ? `${h}:${pad(m)}` : `${m}:${pad(s)}`,
  };
}

/** مدة بالعربية: «22 ساعة و15 دقيقة». */
export function durationHuman(ms) {
  if (ms == null) return '—';
  const abs = Math.abs(ms);
  const totalMinutes = Math.round(abs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(days === 1 ? 'يوم' : days === 2 ? 'يومان' : `${days} أيام`);
  if (hours) parts.push(hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتان' : `${hours} ساعة`);
  if (minutes && !days) parts.push(minutes === 1 ? 'دقيقة' : minutes === 2 ? 'دقيقتان' : `${minutes} دقيقة`);
  if (!parts.length) return 'أقل من دقيقة';
  return parts.join(' و');
}

/** زمن نسبي: «قبل 12 دقيقة». */
export function relative(ms, now) {
  const diff = now - ms;
  if (!Number.isFinite(diff)) return '—';
  if (Math.abs(diff) < 45000) return 'الآن';
  const prefix = diff > 0 ? 'قبل ' : 'بعد ';
  return prefix + durationHuman(Math.abs(diff));
}

/** ساعات بصيغة مختصرة للنماذج. */
export const hours = (h) => (h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : `${h} ساعة`);

/** نغمة CSS لكل درجة إلحاح — تُستخدم في الحدود والحلقات والأشرطة. */
export const URGENCY_TONE = {
  normal: { color: 'var(--u-normal)', soft: 'var(--u-normal-soft)', label: 'ضمن الوقت', badge: 'ok' },
  ending_soon: { color: 'var(--u-ending)', soft: 'var(--u-ending-soft)', label: 'تقترب من النهاية', badge: 'warn' },
  critical: { color: 'var(--u-critical)', soft: 'var(--u-critical-soft)', label: 'حرِجة', badge: 'danger' },
  expired: { color: 'var(--u-expired)', soft: 'var(--u-expired-soft)', label: 'انتهى الوقت', badge: 'muted' },
  closed: { color: 'var(--text-3)', soft: 'var(--surface-3)', label: 'مغلقة', badge: 'muted' },
};

export const STATUS_BADGE = {
  active: 'ok',
  expired: 'danger',
  returned: 'info',
  purchased: 'violet',
  cancelled: 'muted',
};

export const DEVICE_BADGE = {
  available: 'ok',
  on_trial: 'warn',
  reserved: 'info',
  sold: 'violet',
  maintenance: 'muted',
};

/** حساب درجة الإلحاح في المتصفح من وقت الخادم — نفس منطق الخادم. */
export function urgencyFor(trial, now) {
  if (['returned', 'purchased', 'cancelled'].includes(trial.status)) return 'closed';
  const remaining = trial.endAt - now;
  const s = store.settings || {};
  if (remaining <= 0) return 'expired';
  if (remaining <= (s.criticalMinutes || 60) * 60000) return 'critical';
  if (remaining <= (s.endingSoonMinutes || 180) * 60000) return 'ending_soon';
  return 'normal';
}

/** الحروف الأولى للاسم — تُستخدم كصورة رمزية نصية. */
export function initials(name) {
  if (!name) return '؟';
  const parts = String(name).trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2);
}

export const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
