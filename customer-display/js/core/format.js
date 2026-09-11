/**
 * صياغة الأرقام والمبالغ والتواريخ.
 * الأرقام غربية بفواصل آلاف («850,000») والعملة تُعرض منفصلة كي يبقى
 * ترتيب RTL صحيحًا دون أن تتدخّل خوارزمية الاتجاه ثنائية النص.
 */

import { CONFIG } from '../config.js';

let numberFormatter = createNumberFormatter(CONFIG.currency);

function createNumberFormatter(currency) {
  return new Intl.NumberFormat(currency.numberLocale, {
    minimumFractionDigits: currency.fractionDigits,
    maximumFractionDigits: currency.fractionDigits,
  });
}

/** يعيد ضبط الصياغة بعد تطبيق تجاوزات الرابط. */
export function configureFormatting(currency) {
  numberFormatter = createNumberFormatter(currency);
}

/** 1020000 ⇒ "1,020,000" */
export function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return numberFormatter.format(Math.round(n * 100) / 100);
}

/** 2 ⇒ "2" (بلا فواصل للكميات الصغيرة، ومع فواصل للكبيرة) */
export function formatQty(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

/**
 * ينشئ عنصر مبلغ: <span class="amount"><span>850,000</span><span>د.ع</span></span>
 * @param {object} [options]
 * @param {string} [options.className] أصناف إضافية
 * @param {boolean} [options.negative] يسبق الرقم بإشارة سالب
 * @param {string} [options.currency] رمز عملة مخصّص
 */
export function createAmountEl(value, options = {}) {
  const el = document.createElement('span');
  el.className = ['amount', options.negative ? 'amount--negative' : '', options.className || '']
    .filter(Boolean)
    .join(' ');

  const valueEl = document.createElement('span');
  valueEl.className = 'amount__value';
  valueEl.textContent = formatNumber(value);

  const currencyEl = document.createElement('span');
  currencyEl.className = 'amount__currency';
  currencyEl.textContent = options.currency ?? CONFIG.currency.symbol;

  el.append(valueEl, currencyEl);
  // قيمة نصّية كاملة لقارئات الشاشة: «850,000 د.ع»
  el.setAttribute('aria-label', `${options.negative ? 'ناقص ' : ''}${formatNumber(value)} ${currencyEl.textContent}`);
  return el;
}

/** نص المبلغ كاملًا — للاستخدام في aria-live وعناوين النوافذ. */
export function formatAmountText(value, currency = CONFIG.currency.symbol) {
  return `${formatNumber(value)} ${currency}`;
}

const timeFormatter = new Intl.DateTimeFormat('ar-IQ', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

/** وقت قصير بالعربية: ٠٣:٤٥ م */
export function formatTime(date = new Date()) {
  try {
    return timeFormatter.format(date);
  } catch {
    return date.toLocaleTimeString();
  }
}

/** رقم فاتورة افتراضي عند غياب رقم من النظام الخلفي. */
export function generateInvoiceNumber(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const serial = String(Math.floor(Math.random() * 9000) + 1000);
  return `${stamp}-${serial}`;
}
