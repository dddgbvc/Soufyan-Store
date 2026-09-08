/**
 * Trial24 — عناصر الواجهة المشتركة
 * نوافذ زجاجية، أدراج، تنبيهات، وأدوات DOM صغيرة.
 * الحركة هادئة: تلاشٍ + تحجيم + نابض خفيف، وتُلغى عند تفضيل تقليل الحركة.
 */

import { esc, icon } from './format.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** تفويض الأحداث: مستمع واحد للحاوية بدل مستمع لكل عنصر. */
export function delegate(root, selector, event, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

// ——————————————————————— التنبيهات ———————————————————————

const TOAST_ICON = { ok: 'check', warn: 'alert', danger: 'alert', info: 'info' };

export function toast(message, type = 'info', duration = 4200) {
  const root = $('#toastRoot');
  const el = document.createElement('div');
  el.className = `toast glass toast--${type}`;
  el.innerHTML = `
    <span class="toast__icon">${icon(TOAST_ICON[type] || 'info')}</span>
    <span class="toast__text">${esc(message)}</span>`;
  root.appendChild(el);

  const remove = () => {
    el.dataset.leaving = 'true';
    setTimeout(() => el.remove(), 320);
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
  return remove;
}

// ——————————————————————— الطبقات العائمة ———————————————————————

let openLayer = null;

function trapFocus(container, e) {
  const focusables = $$(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    container
  ).filter((el) => el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function mountLayer(node, { onClose, closeOnScrim = true } = {}) {
  const root = $('#overlayRoot');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  root.append(scrim, node);
  document.body.style.overflow = 'hidden';

  const previouslyFocused = document.activeElement;

  const close = (result) => {
    if (openLayer !== handle) return;
    openLayer = null;
    document.removeEventListener('keydown', onKey, true);
    scrim.remove();
    node.remove();
    document.body.style.overflow = '';
    previouslyFocused?.focus?.();
    onClose?.(result);
  };

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(null);
    } else if (e.key === 'Tab') {
      trapFocus(node, e);
    }
  }

  const handle = { node, close };
  openLayer = handle;
  document.addEventListener('keydown', onKey, true);
  if (closeOnScrim) scrim.addEventListener('click', () => close(null));

  requestAnimationFrame(() => {
    const auto = node.querySelector('[data-autofocus]') || node.querySelector('button, input, select, textarea');
    auto?.focus();
  });

  return handle;
}

/**
 * نافذة حوارية زجاجية.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.sub]
 * @param {string} opts.body           HTML
 * @param {Array}  [opts.actions]      [{label, type, value, primary, danger}]
 * @param {boolean}[opts.wide]
 * @param {(form:HTMLFormElement, close:Function)=>void} [opts.onSubmit]
 */
export function openModal(opts) {
  const node = document.createElement('form');
  node.className = `modal glass glass--liquid${opts.wide ? ' modal--wide' : ''}`;
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('aria-label', opts.title);
  node.noValidate = true;

  const actions = opts.actions || [
    { label: 'إلغاء', value: null },
    { label: 'تأكيد', value: 'confirm', primary: true },
  ];

  node.innerHTML = `
    <div class="modal__head">
      ${opts.icon ? `<span class="metric__icon" style="--tone:${opts.tone || 'var(--accent)'};--tone-soft:${opts.toneSoft || 'var(--accent-soft)'}">${icon(opts.icon)}</span>` : ''}
      <div>
        <div class="modal__title">${esc(opts.title)}</div>
        ${opts.sub ? `<div class="modal__sub">${esc(opts.sub)}</div>` : ''}
      </div>
      <button type="button" class="btn btn--icon btn--ghost push" data-close aria-label="إغلاق">${icon('x')}</button>
    </div>
    <div class="modal__body">${opts.body || ''}</div>
    <div class="modal__foot">
      ${actions
        .map(
          (a, i) =>
            `<button type="${a.value ? 'submit' : 'button'}" class="btn ${a.primary ? 'btn--primary' : a.danger ? 'btn--danger' : ''} ${i === 0 ? '' : ''}" data-action="${esc(a.value ?? '')}" ${a.value ? '' : 'data-close'}>${esc(a.label)}</button>`
        )
        .join('')}
    </div>`;

  // زر الإجراء الأساسي في نهاية الشريط
  const foot = node.querySelector('.modal__foot');
  const first = foot.firstElementChild;
  if (first && !first.classList.contains('btn--primary')) first.classList.add('push');

  const handle = mountLayer(node, { onClose: opts.onClose });

  node.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) handle.close(null);
  });

  node.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitter = e.submitter;
    const value = submitter?.dataset.action || 'confirm';
    if (opts.onSubmit) {
      const busy = submitter;
      const original = busy?.textContent;
      if (busy) {
        busy.disabled = true;
        busy.textContent = 'جارٍ التنفيذ…';
      }
      try {
        await opts.onSubmit(node, handle.close, value);
      } finally {
        if (busy && busy.isConnected) {
          busy.disabled = false;
          busy.textContent = original;
        }
      }
    } else {
      handle.close(value);
    }
  });

  return handle;
}

/** درج جانبي (يُستخدم للإشعارات). */
export function openDrawer({ title, body, footer }) {
  const node = document.createElement('div');
  node.className = 'drawer glass glass--liquid';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('aria-label', title);
  node.innerHTML = `
    <div class="modal__head">
      <div class="modal__title">${esc(title)}</div>
      <button type="button" class="btn btn--icon btn--ghost push" data-close aria-label="إغلاق">${icon('x')}</button>
    </div>
    <div class="modal__body" style="flex:1">${body}</div>
    ${footer ? `<div class="modal__foot">${footer}</div>` : ''}`;

  const handle = mountLayer(node);
  node.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) handle.close(null);
  });
  return handle;
}

/** تأكيد سريع بنص حر. */
export function confirmDialog({ title, message, confirmLabel = 'تأكيد', danger = false }) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: `<p style="font-size:var(--fs-sm);color:var(--text-2);line-height:1.7">${esc(message)}</p>`,
      icon: danger ? 'alert' : 'info',
      tone: danger ? 'var(--danger)' : 'var(--accent)',
      toneSoft: danger ? 'var(--danger-soft)' : 'var(--accent-soft)',
      actions: [
        { label: 'إلغاء', value: null },
        { label: confirmLabel, value: 'yes', primary: !danger, danger },
      ],
      onSubmit: (_form, close) => close('yes'),
      onClose: (result) => resolve(result === 'yes'),
    });
  });
}

// ——————————————————————— أدوات النماذج ———————————————————————

/** قراءة نموذج كسجل مفاتيح/قيم مع تحويل الأنواع. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

/** عرض خطأ من الخادم في مكانه الصحيح داخل النموذج أو كتنبيه. */
export function showApiError(err, form) {
  const message = err?.message || 'تعذّر تنفيذ العملية.';
  if (form) {
    const slot = form.querySelector('[data-error-slot]');
    if (slot) {
      slot.innerHTML = `<div class="badge badge--danger" style="white-space:normal;line-height:1.6;padding:8px 12px">${icon('alert', 'icon--sm')}<span>${esc(message)}</span></div>`;
      slot.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
  }
  toast(message, 'danger', 6000);
}

/** حالة فارغة موحّدة. */
export const emptyState = (iconName, title, hint = '') => `
  <div class="empty">
    <div class="empty__icon">${icon(iconName, 'icon--lg')}</div>
    <div class="empty__title">${esc(title)}</div>
    ${hint ? `<div style="font-size:var(--fs-xs);max-width:34ch">${esc(hint)}</div>` : ''}
  </div>`;

/** هيكل تحميل. */
export const skeleton = (height = 120) => `<div class="skeleton" style="height:${height}px"></div>`;
