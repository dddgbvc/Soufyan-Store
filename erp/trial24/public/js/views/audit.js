/**
 * شاشة سجل التدقيق — كل حدث بمنفّذه ووقته والجهاز والعميل والحالة قبل/بعد.
 */

import { api } from '../api.js';
import { serverNow } from '../clock.js';
import { dateTime, esc, icon, relative } from '../format.js';
import { PERM, can } from '../state.js';
import { delegate, emptyState } from '../ui.js';

export const title = 'سجل التدقيق';

const ACTIONS = [
  ['', 'كل الأحداث'],
  ['TRIAL_CREATE', 'إنشاء'],
  ['DEVICE_RELEASE', 'إخراج جهاز'],
  ['REMINDER_SENT', 'تذكير'],
  ['TRIAL_EXPIRE', 'انتهاء'],
  ['TRIAL_RETURN', 'إرجاع'],
  ['TRIAL_PURCHASE', 'شراء'],
  ['TRIAL_EXTENSION', 'تمديد'],
  ['TRIAL_CANCEL', 'إلغاء'],
  ['POLICY_OVERRIDE', 'تجاوز سياسة'],
];

const state = { action: '', query: '' };

export async function render(root, ctx) {
  if (!can(PERM.AUDIT)) {
    root.innerHTML = emptyState('lock', 'سجل التدقيق متاح للمدير فقط', 'صلاحية audit.view مطلوبة.');
    return;
  }

  const rows = await api.audit({ limit: 400, action: state.action || undefined });
  const now = serverNow();

  root.innerHTML = `
    <section class="section">
      <div class="section__head">
        <div class="section__title">سجل التدقيق</div>
        <div class="section__hint">سجل للإضافة فقط — لا يُعدَّل ولا يُحذف. آخر ${rows.length} حدث.</div>
      </div>
      <div class="row">
        <div class="search">${icon('search')}
          <input class="input" id="auditSearch" type="search" placeholder="بحث بالمستخدم أو التجربة أو الجهاز" value="${esc(state.query)}">
        </div>
        <select class="select push" id="actionFilter" style="max-width:200px">
          ${ACTIONS.map(([v, l]) => `<option value="${v}" ${state.action === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
      </div>

      <div class="card card--flush">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>الحدث</th><th>المستخدم</th><th>التجربة</th><th>الجهاز</th>
                <th>العميل</th><th>الحالة</th><th>الوقت</th>
              </tr>
            </thead>
            <tbody id="auditBody"></tbody>
          </table>
        </div>
      </div>
    </section>`;

  const body = root.querySelector('#auditBody');

  const paint = () => {
    const needle = state.query.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        !needle ||
        [r.actorName, r.trialCode, r.deviceName, r.customerName, r.actionLabel, r.deviceImei]
          .join(' ')
          .toLowerCase()
          .includes(needle)
    );
    body.innerHTML = filtered.length
      ? filtered.map((r) => auditRow(r, now)).join('')
      : `<tr><td colspan="7">${emptyState('shield', 'لا توجد أحداث مطابقة')}</td></tr>`;
  };

  paint();

  root.querySelector('#actionFilter').addEventListener('change', (e) => {
    state.action = e.target.value;
    ctx.reload();
  });

  const search = root.querySelector('#auditSearch');
  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = search.value;
      paint();
    }, 160);
  });

  delegate(root, '[data-trial-link]', 'click', (_e, el) => {
    location.hash = `#/trial/${el.dataset.trialLink}`;
  });
}

function auditRow(r, now) {
  const status =
    r.oldStatus || r.newStatus
      ? `<span class="audit-row__status">${esc(r.oldStatus || '—')} <span class="audit-row__arrow">←</span> ${esc(r.newStatus || '—')}</span>`
      : r.deviceOldStatus
        ? `<span class="audit-row__status">${esc(r.deviceOldStatus)} <span class="audit-row__arrow">←</span> ${esc(r.deviceNewStatus)}</span>`
        : '—';
  return `
    <tr ${r.trialId ? `data-trial-link="${esc(r.trialId)}" style="cursor:pointer"` : ''}>
      <td><span class="badge badge--${badgeFor(r.action)}">${esc(r.actionLabel)}</span></td>
      <td>${esc(r.actorName)}<span style="color:var(--text-3);font-size:var(--fs-3xs)"> · ${esc(r.actorRole)}</span></td>
      <td class="num">${esc(r.trialCode || '—')}</td>
      <td>${esc(r.deviceName || '—')}</td>
      <td>${esc(r.customerName || '—')}</td>
      <td>${status}</td>
      <td class="num" title="${esc(dateTime(r.at))}">${esc(relative(r.at, now))}</td>
    </tr>`;
}

const badgeFor = (action) =>
  ({
    TRIAL_CREATE: 'accent',
    DEVICE_RELEASE: 'accent',
    REMINDER_SENT: 'warn',
    TRIAL_EXPIRE: 'danger',
    TRIAL_RETURN: 'info',
    TRIAL_PURCHASE: 'ok',
    TRIAL_EXTENSION: 'warn',
    EXTENSION_REQUESTED: 'warn',
    EXTENSION_REJECTED: 'danger',
    TRIAL_CANCEL: 'danger',
    POLICY_OVERRIDE: 'danger',
    SETTINGS_UPDATE: 'violet',
  })[action] || 'muted';
