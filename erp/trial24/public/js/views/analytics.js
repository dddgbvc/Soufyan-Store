/**
 * شاشة التحليلات — تُحسب كلها على الخادم من سجلات التجارب الفعلية.
 */

import { api } from '../api.js';
import { metricCard } from '../components.js';
import { durationHuman, esc, icon, money, moneyShort } from '../format.js';
import { PERM, can } from '../state.js';
import { delegate, emptyState } from '../ui.js';

export const title = 'التحليلات';

const state = { days: null };

const SERIES = {
  started: { label: 'بدأت', color: 'var(--accent)' },
  purchased: { label: 'شراء', color: 'var(--ok)' },
  returned: { label: 'إرجاع', color: 'var(--info)' },
};

export async function render(root, ctx) {
  if (!can(PERM.ANALYTICS)) {
    root.innerHTML = emptyState('lock', 'التحليلات متاحة للمدير فقط', 'صلاحية analytics.view مطلوبة لعرض هذه الشاشة.');
    return;
  }

  const data = await api.analytics(state.days ? { days: state.days } : {});
  const t = data.totals;
  const r = data.rates;
  const d = data.durations;

  root.innerHTML = `
    <section class="section">
      <div class="section__head">
        <div class="section__title">أداء خدمة التجربة</div>
        <div class="section__hint">
          ${state.days ? `آخر ${state.days} يومًا` : 'كل الفترات'} · ${t.totalTrials} تجربة ·
          إيراد التحويل <span class="num">${money(t.revenue)}</span>
        </div>
        <div class="chips push" id="periodChips">
          ${periodChip(null, 'الكل')}
          ${periodChip(7, '٧ أيام')}
          ${periodChip(30, '٣٠ يومًا')}
          ${periodChip(90, '٩٠ يومًا')}
        </div>
      </div>

      <div class="grid grid--metrics-3">
        ${metricCard({ key: 'total', label: 'إجمالي التجارب', value: t.totalTrials, iconName: 'hourglass', tone: 'var(--accent)', toneSoft: 'var(--accent-soft)', index: 0, clickable: false, foot: `${t.openTrials} مفتوحة · ${t.closedTrials} مغلقة` })}
        ${metricCard({ key: 'conv', label: 'نسبة التحويل للشراء', value: r.purchaseConversion, unit: '%', iconName: 'bag', tone: 'var(--ok)', toneSoft: 'var(--ok-soft)', index: 1, clickable: false, foot: `${t.purchased} شراء من ${t.decided} قرار` })}
        ${metricCard({ key: 'ret', label: 'نسبة الإرجاع', value: r.returnRate, unit: '%', iconName: 'return', tone: 'var(--info)', toneSoft: 'var(--info-soft)', index: 2, clickable: false, foot: `${t.returned} إرجاع` })}
        ${metricCard({ key: 'ext', label: 'نسبة التمديد', value: r.extensionRate, unit: '%', iconName: 'extend', tone: 'var(--warn)', toneSoft: 'var(--warn-soft)', index: 3, clickable: false, foot: `${t.extendedTrials} تجربة · ${t.totalExtensions} تمديد` })}
        ${metricCard({ key: 'dur', label: 'متوسط مدة التجربة', value: d.avgDurationHours, unit: 'س', iconName: 'clock', tone: 'var(--violet)', toneSoft: 'var(--violet-soft)', index: 4, clickable: false, foot: `متوسط زمن قرار الشراء ${d.avgTimeToPurchaseHours} ساعة` })}
        ${metricCard({ key: 'late', label: 'نسبة التأخير عن الموعد', value: r.lateReturnRate, unit: '%', iconName: 'alert', tone: 'var(--danger)', toneSoft: 'var(--danger-soft)', index: 5, clickable: false, foot: `${r.cancellationRate}% نسبة الإلغاء` })}
      </div>
    </section>

    <section class="section">
      <div class="card">
        <div class="card__head">
          <div class="card__title">الحركة اليومية</div>
          <div class="legend push">
            ${Object.values(SERIES)
              .map((s) => `<span class="legend__item"><span class="legend__swatch" style="background:${s.color}"></span>${esc(s.label)}</span>`)
              .join('')}
          </div>
        </div>
        ${dailyChart(data.series)}
      </div>
    </section>

    <div class="analytics-grid">
      <section class="card">
        <div class="card__head">
          <div class="card__title">الأجهزة الأكثر تجربة</div>
        </div>
        ${data.mostTrialed.length ? rankedBars(data.mostTrialed) : emptyState('device', 'لا توجد بيانات كافية')}
      </section>

      <section class="card">
        <div class="card__head">
          <div class="card__title">الأعلى تحويلًا إلى بيع</div>
          <span class="card__sub push">بحد أدنى ${data.highestConversionMinSample} قرارات</span>
        </div>
        ${data.highestConversion.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>الجهاز</th><th>قرارات</th><th>شراء</th><th>التحويل</th></tr></thead>
              <tbody>
                ${data.highestConversion
                  .map(
                    (x) => `<tr data-device-link="${esc(x.deviceId)}" style="cursor:pointer">
                      <td>${esc(x.name)}</td>
                      <td class="num">${x.decided}</td>
                      <td class="num">${x.purchased}</td>
                      <td><span class="badge badge--${x.conversionRate >= 60 ? 'ok' : x.conversionRate >= 35 ? 'warn' : 'muted'}">${x.conversionRate}%</span></td>
                    </tr>`
                  )
                  .join('')}
              </tbody></table></div>`
          : emptyState('chart', 'لا توجد عيّنة كافية بعد', 'تحتاج أجهزة أكثر إغلاقًا للتجارب لحساب تحويل موثوق.')}
      </section>

      <section class="card">
        <div class="card__head"><div class="card__title">أداء الموظفين</div></div>
        ${data.employees.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>الموظف</th><th>تجارب</th><th>شراء</th><th>إرجاع</th><th>التحويل</th></tr></thead>
              <tbody>
                ${data.employees
                  .map(
                    (e) => `<tr>
                      <td>${esc(e.name)}</td>
                      <td class="num">${e.trials}</td>
                      <td class="num">${e.purchased}</td>
                      <td class="num">${e.returned}</td>
                      <td class="num">${e.conversionRate}%</td>
                    </tr>`
                  )
                  .join('')}
              </tbody></table></div>`
          : emptyState('users', 'لا توجد بيانات')}
      </section>

      <section class="card">
        <div class="card__head"><div class="card__title">مدد التجارب</div></div>
        <div class="kv">
          ${kv('متوسط المدة الفعلية', durationHuman(d.avgDurationMs))}
          ${kv('أقصر تجربة', durationHuman(d.shortestMs))}
          ${kv('أطول تجربة', durationHuman(d.longestMs))}
          ${kv('متوسط زمن قرار الشراء', durationHuman(d.avgTimeToPurchaseMs))}
          ${kv('عدد الفواتير', String(t.salesCount))}
          ${kv('إيراد التجارب المحوّلة', money(t.revenue))}
        </div>
      </section>
    </div>`;

  delegate(root, '#periodChips .chip', 'click', (_e, el) => {
    state.days = el.dataset.days === 'all' ? null : Number(el.dataset.days);
    ctx.reload();
  });
  delegate(root, '[data-device-link]', 'click', (_e, el) => {
    location.hash = `#/device/${el.dataset.deviceLink}`;
  });
}

function dailyChart(series) {
  const max = Math.max(1, ...series.map((s) => s.started + s.purchased + s.returned));
  return `
    <div class="chart">
      ${series
        .map((s, i) => {
          const seg = (value, color) =>
            value ? `<span class="chart__seg" style="height:${(value / max) * 100}%;background:${color};--stagger:${i * 30}ms" title="${value}"></span>` : '';
          return `
            <div class="chart__day">
              <div class="chart__stack">
                ${seg(s.started, SERIES.started.color)}
                ${seg(s.purchased, SERIES.purchased.color)}
                ${seg(s.returned, SERIES.returned.color)}
              </div>
              <span class="chart__label">${esc(s.day.slice(5))}</span>
            </div>`;
        })
        .join('')}
    </div>`;
}

function rankedBars(rows) {
  const max = Math.max(...rows.map((r) => r.trials), 1);
  return `
    <div class="stack stack--sm">
      ${rows
        .map(
          (r) => `
        <div data-device-link="${esc(r.deviceId)}" style="cursor:pointer">
          <div class="row row--tight" style="font-size:var(--fs-xs);margin-bottom:4px">
            <span style="font-weight:600">${esc(r.name)}</span>
            <span class="push num" style="color:var(--text-3)">${r.trials} تجربة · ${r.conversionRate}% تحويل</span>
          </div>
          <div class="bar"><span class="bar__fill" style="width:${(r.trials / max) * 100}%"></span></div>
        </div>`
        )
        .join('')}
    </div>`;
}

const kv = (k, v) => `<div class="kv__row"><span class="kv__k">${esc(k)}</span><span class="kv__v">${esc(v)}</span></div>`;

const periodChip = (days, label) =>
  `<button class="chip" data-days="${days ?? 'all'}" aria-pressed="${state.days === days}">${esc(label)}</button>`;
