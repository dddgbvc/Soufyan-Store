/**
 * شاشة الأجهزة + تاريخ تجارب كل جهاز.
 */

import { api } from '../api.js';
import { serverNow } from '../clock.js';
import { deviceBadge, statusBadge } from '../components.js';
import { dateTime, durationHuman, esc, icon, money, relative } from '../format.js';
import { PERM, can, store } from '../state.js';
import { delegate, emptyState, toast } from '../ui.js';

export const title = 'الأجهزة';

const state = { filter: 'all', query: '' };

export async function render(root, ctx) {
  const devices = await api.devices();

  const counts = devices.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {});

  root.innerHTML = `
    <section class="section">
      <div class="section__head">
        <div class="section__title">مخزون الأجهزة</div>
        <div class="section__hint">${devices.length} جهازًا — الجهاز قيد التجربة مقفول ولا يمكن بيعه أو حجزه.</div>
      </div>
      <div class="row">
        <div class="search">${icon('search')}
          <input class="input" id="deviceSearch" type="search" placeholder="بحث بالموديل أو IMEI أو اللون" value="${esc(state.query)}">
        </div>
        <div class="chips push" id="deviceChips">
          ${chip('all', 'الكل', devices.length)}
          ${chip('available', 'متاح', counts.available || 0)}
          ${chip('on_trial', 'قيد التجربة', counts.on_trial || 0)}
          ${chip('reserved', 'محجوز', counts.reserved || 0)}
          ${chip('maintenance', 'صيانة', counts.maintenance || 0)}
          ${chip('sold', 'مُباع', counts.sold || 0)}
        </div>
      </div>
      <div class="grid grid--3" id="deviceGrid"></div>
    </section>`;

  const grid = root.querySelector('#deviceGrid');

  const paint = () => {
    const rows = devices
      .filter((d) => state.filter === 'all' || d.status === state.filter)
      .filter((d) =>
        !state.query ||
        `${d.brand} ${d.model} ${d.imei} ${d.serial} ${d.color}`.toLowerCase().includes(state.query.toLowerCase())
      );
    grid.innerHTML = rows.length
      ? rows.map(deviceCard).join('')
      : emptyState('device', 'لا يوجد جهاز مطابق', 'جرّب فلترًا آخر أو امسح البحث.');
    root.querySelectorAll('#deviceChips .chip').forEach((el) =>
      el.setAttribute('aria-pressed', String(el.dataset.filter === state.filter))
    );
  };

  paint();

  delegate(root, '#deviceChips .chip', 'click', (_e, el) => {
    state.filter = el.dataset.filter;
    paint();
  });
  delegate(root, '[data-device-link]', 'click', (_e, el) => {
    location.hash = `#/device/${el.dataset.deviceLink}`;
  });

  const search = root.querySelector('#deviceSearch');
  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = search.value;
      paint();
    }, 160);
  });
}

function deviceCard(d) {
  const s = d.stats;
  return `
    <button class="card card--interactive device-card" data-device-link="${esc(d.id)}">
      <div class="device-card__top">
        <span class="device-card__mark">${esc(d.brand.slice(0, 1))}</span>
        <span style="display:grid;gap:3px;min-width:0">
          <span class="device-card__name">${esc(d.brand)} ${esc(d.model)}</span>
          <span class="device-card__imei">${esc(d.imei)}</span>
        </span>
        <span class="push">${deviceBadge(d)}</span>
      </div>
      <div class="row row--tight" style="font-size:var(--fs-2xs);color:var(--text-3)">
        <span>${esc(d.storage)} · ${esc(d.color)}</span>
        <span class="health push">
          <span class="health__bar"><span class="health__fill" style="width:${d.batteryHealth}%"></span></span>
          <span class="num">${d.batteryHealth}%</span>
        </span>
      </div>
      <div class="row row--tight">
        <span class="num" style="font-weight:650">${money(d.price)}</span>
        <span class="badge badge--muted push">درجة ${esc(d.cosmeticGrade)}</span>
      </div>
      <div class="device-card__stats">
        <span class="device-stat"><span class="device-stat__v">${s.total}</span><span class="device-stat__k">تجربة</span></span>
        <span class="device-stat"><span class="device-stat__v">${s.purchased}</span><span class="device-stat__k">شراء</span></span>
        <span class="device-stat"><span class="device-stat__v">${s.conversionRate}%</span><span class="device-stat__k">تحويل</span></span>
      </div>
    </button>`;
}

const chip = (key, label, count) =>
  `<button class="chip" data-filter="${key}" aria-pressed="${state.filter === key}">${esc(label)}<span class="chip__count">${count}</span></button>`;

// ——————————————————————— تفاصيل الجهاز ———————————————————————

export async function renderDetail(root, ctx, params) {
  const { device, stats, history, audit, currentTrial } = await api.device(params.id);
  const now = serverNow();

  root.innerHTML = `
    <div class="row" style="margin-bottom:var(--sp-4)">
      <button class="btn btn--ghost btn--sm" data-back>${icon('arrow-back', 'icon--sm')}<span>رجوع</span></button>
      <div class="row row--tight">
        <h2>${esc(device.brand)} ${esc(device.model)}</h2>
        ${deviceBadge(device)}
      </div>
      ${currentTrial ? `<button class="btn btn--sm btn--warn push" data-trial="${esc(currentTrial.id)}">${icon('hourglass', 'icon--sm')}<span>التجربة الجارية ${esc(currentTrial.code)}</span></button>` : ''}
    </div>

    <div class="detail">
      <div class="stack">
        <section class="card">
          <div class="card__head">
            <div class="card__title">${icon('history')} تاريخ التجارب</div>
            <span class="card__sub push">${history.length} تجربة</span>
          </div>
          ${history.length
            ? `<div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr><th>التجربة</th><th>العميل</th><th>الموظف</th><th>البداية</th><th>المدة</th><th>التمديد</th><th>النتيجة</th></tr>
                  </thead>
                  <tbody>
                    ${history
                      .map(
                        (h) => `
                      <tr data-trial-row="${esc(h.trialId)}" style="cursor:pointer">
                        <td class="num">${esc(h.code)}</td>
                        <td>${esc(h.customerName)}</td>
                        <td>${esc(h.employeeName)}</td>
                        <td class="num">${esc(dateTime(h.startAt))}</td>
                        <td>${h.closedAt ? esc(durationHuman(h.closedAt - h.startAt)) : '—'}</td>
                        <td class="num">${h.extensions || '—'}</td>
                        <td>${statusBadge({ status: h.status })}</td>
                      </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : emptyState('inbox', 'لا توجد تجارب سابقة لهذا الجهاز')}
        </section>

        <section class="card">
          <div class="card__head"><div class="card__title">${icon('shield')} سجل التدقيق للجهاز</div></div>
          <div class="timeline">
            ${audit
              .slice(0, 20)
              .map(
                (a) => `
              <div class="tl-item">
                <span class="tl-dot">${icon('info', 'icon--sm')}</span>
                <div class="tl-body">
                  <div class="tl-title">${esc(a.actionLabel)}</div>
                  <div class="tl-meta">
                    ${esc(a.actorName)} · ${esc(dateTime(a.at))}
                    ${a.deviceOldStatus ? `<span class="audit-row__status">${esc(a.deviceOldStatus)} <span class="audit-row__arrow">←</span> ${esc(a.deviceNewStatus)}</span>` : ''}
                  </div>
                </div>
              </div>`
              )
              .join('') || '<p class="section__hint">لا توجد أحداث.</p>'}
          </div>
        </section>
      </div>

      <aside class="stack">
        <section class="card">
          <div class="card__head"><div class="card__title">مؤشرات الجهاز</div></div>
          <div class="device-card__stats" style="border:none;padding-top:0">
            <span class="device-stat"><span class="device-stat__v">${stats.total}</span><span class="device-stat__k">تجارب</span></span>
            <span class="device-stat"><span class="device-stat__v">${stats.purchased}</span><span class="device-stat__k">مبيعات</span></span>
            <span class="device-stat"><span class="device-stat__v">${stats.conversionRate}%</span><span class="device-stat__k">تحويل</span></span>
          </div>
        </section>

        <section class="card">
          <div class="card__head"><div class="card__title">بيانات الجهاز</div></div>
          <div class="kv">
            ${kv('IMEI', `<span class="num">${esc(device.imei)}</span>`)}
            ${kv('Serial', `<span class="num">${esc(device.serial)}</span>`)}
            ${kv('السعر', `<span class="num">${money(device.price)}</span>`)}
            ${kv('اللون', esc(device.color))}
            ${kv('التخزين / الرام', `${esc(device.storage)} · ${esc(device.ram)}`)}
            ${kv('صحة البطارية', `<span class="num">${device.batteryHealth}%</span>`)}
            ${kv('الدرجة الظاهرية', esc(device.cosmeticGrade))}
            ${kv('الحالة', esc(device.condition))}
            ${kv('الملحقات', esc((device.accessories || []).join('، ') || '—'))}
            ${kv('آخر تجربة', device.lastTrialAt ? esc(relative(device.lastTrialAt, now)) : '—')}
          </div>
          ${device.conditionNotes ? `<div class="tl-note" style="margin-top:var(--sp-3)">${esc(device.conditionNotes)}</div>` : ''}
        </section>

        ${device.status === 'available' && can(PERM.CREATE)
          ? `<button class="btn btn--primary btn--block" data-new-with="${esc(device.id)}">${icon('plus')}<span>بدء تجربة بهذا الجهاز</span></button>`
          : ''}
      </aside>
    </div>`;

  root.querySelector('[data-back]')?.addEventListener('click', () => history.length && window.history.back());
  delegate(root, '[data-trial-row]', 'click', (_e, el) => {
    location.hash = `#/trial/${el.dataset.trialRow}`;
  });
  delegate(root, '[data-trial]', 'click', (_e, el) => {
    location.hash = `#/trial/${el.dataset.trial}`;
  });
  root.querySelector('[data-new-with]')?.addEventListener('click', () => {
    location.hash = '#/new';
    toast('اختر العميل ثم هذا الجهاز من القائمة.', 'info');
  });
}

const kv = (k, v) => `<div class="kv__row"><span class="kv__k">${esc(k)}</span><span class="kv__v">${v}</span></div>`;

export const detailTitle = 'سجل الجهاز';
