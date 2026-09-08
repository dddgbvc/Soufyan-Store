/**
 * شاشة لوحة المعلومات — البطاقات السبع + قائمة التجارب الحيّة.
 */

import { api } from '../api.js';
import { serverNow } from '../clock.js';
import { bindMiniCountdowns, metricCard, trialRow } from '../components.js';
import { durationHuman, esc, icon, money } from '../format.js';
import { PERM, can, store } from '../state.js';
import { delegate, emptyState, toast } from '../ui.js';

const FILTERS = {
  all: (t) => true,
  active: (t) => t.status === 'active',
  endingToday: (t) => t.status === 'active' && sameDay(t.endAt, serverNow()),
  endingSoon: (t) => t.status === 'active' && t.urgency === 'ending_soon' || (t.status === 'active' && t.urgency === 'critical'),
  expired: (t) => t.status === 'expired',
  awaitingReturn: (t) => t.isOpen,
  purchased: (t) => t.status === 'purchased',
  closed: (t) => !t.isOpen,
};

function sameDay(a, b) {
  const tz = store.settings?.timezone || 'Asia/Baghdad';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date(a)) === fmt.format(new Date(b));
}

const state = { filter: 'all', query: '' };

export async function render(root, ctx) {
  const data = await api.dashboard();
  store.dashboard = data;
  const c = data.cards;
  const now = serverNow();

  const pending = store.pendingExtensionRequests?.length || 0;

  root.innerHTML = `
    <section class="hero glass glass--liquid">
      <div class="hero__text">
        <div class="hero__title">تجربة جهاز 24 🕰️</div>
        <div class="hero__sub">
          ${esc(store.settings.storeName)} — تُدار مدد التجارب بساعة الخادم، لا بساعة الجهاز.
          المدة الافتراضية ${store.settings.defaultDurationHours} ساعة.
        </div>
      </div>
      <div class="hero__actions">
        ${pending && can(PERM.EXTEND) ? `<button class="btn btn--warn" data-goto-pending>${icon('extend')}<span>طلبات تمديد (${pending})</span></button>` : ''}
        ${can(PERM.CREATE) ? `<button class="btn btn--primary" data-new-trial>${icon('plus')}<span>تجربة جديدة</span></button>` : ''}
      </div>
    </section>

    <section class="section">
      <div class="grid grid--metrics" id="metrics">
        ${metricCard({ key: 'active', label: 'تجارب جارية', value: c.activeTrials, iconName: 'hourglass', tone: 'var(--ok)', toneSoft: 'var(--ok-soft)', index: 0, active: state.filter === 'active', foot: 'أجهزة قيد التجربة الآن' })}
        ${metricCard({ key: 'endingToday', label: 'تنتهي اليوم', value: c.endingToday, iconName: 'clock', tone: 'var(--info)', toneSoft: 'var(--info-soft)', index: 1, active: state.filter === 'endingToday', foot: 'ضمن يوم العمل الحالي' })}
        ${metricCard({ key: 'endingSoon', label: 'تقترب من النهاية', value: c.endingSoon, iconName: 'alert', tone: 'var(--warn)', toneSoft: 'var(--warn-soft)', index: 2, active: state.filter === 'endingSoon', foot: `أقل من ${store.settings.endingSoonMinutes / 60} ساعات` })}
        ${metricCard({ key: 'expired', label: 'انتهى وقتها', value: c.expired, iconName: 'x', tone: 'var(--danger)', toneSoft: 'var(--danger-soft)', index: 3, active: state.filter === 'expired', foot: 'تجاوزت الموعد ولم تُغلق' })}
        ${metricCard({ key: 'awaitingReturn', label: 'بانتظار الإرجاع', value: c.awaitingReturn, iconName: 'inbox', tone: 'var(--violet)', toneSoft: 'var(--violet-soft)', index: 4, active: state.filter === 'awaitingReturn', foot: 'أجهزة خارج المتجر' })}
        ${metricCard({ key: 'purchased', label: 'تحوّلت إلى بيع', value: c.convertedToSales, iconName: 'bag', tone: 'var(--accent)', toneSoft: 'var(--accent-soft)', index: 5, active: state.filter === 'purchased', foot: 'إجمالي التجارب المُشتراة' })}
        ${metricCard({ key: 'conversion', label: 'نسبة التحويل', value: c.conversionRate, unit: '%', iconName: 'chart', tone: 'var(--ok)', toneSoft: 'var(--ok-soft)', index: 6, clickable: false, wide: true, foot: 'شراء ÷ (شراء + إرجاع) — القرارات المغلقة فقط' })}
      </div>
    </section>

    <section class="section">
      <div class="card list-card">
        <div class="list-card__head">
          <div class="section__title">التجارب</div>
          <div class="search">
            ${icon('search')}
            <input class="input" id="trialSearch" type="search" placeholder="ابحث برقم التجربة، العميل، الجهاز أو IMEI" value="${esc(state.query)}">
          </div>
          <div class="chips push" id="filterChips">
            ${chip('all', 'الكل')}
            ${chip('active', 'جارية')}
            ${chip('expired', 'انتهى الوقت')}
            ${chip('awaitingReturn', 'بانتظار الإرجاع')}
            ${chip('closed', 'مغلقة')}
          </div>
        </div>
        <div id="trialList"></div>
      </div>
    </section>`;

  const listEl = root.querySelector('#trialList');
  let unbind = () => {};

  const paint = () => {
    unbind();
    const rows = data.trials.filter(FILTERS[state.filter] || FILTERS.all).filter(matchesQuery);
    listEl.innerHTML = rows.length
      ? rows.map(trialRow).join('')
      : emptyState('inbox', 'لا توجد تجارب مطابقة', 'جرّب تغيير الفلتر أو مسح كلمة البحث.');
    unbind = bindMiniCountdowns(listEl);

    root.querySelectorAll('[data-metric]').forEach((el) => {
      el.dataset.active = String(el.dataset.metric === state.filter);
    });
    root.querySelectorAll('#filterChips .chip').forEach((el) => {
      el.setAttribute('aria-pressed', String(el.dataset.filter === state.filter));
    });
  };

  function matchesQuery(t) {
    if (!state.query) return true;
    const needle = state.query.trim().toLowerCase();
    return [t.code, t.customerName, t.deviceName, t.imei, t.employeeName, t.customerPhone]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  }

  paint();
  ctx.onLeave(() => unbind());

  // — التفاعل —
  delegate(root, '[data-metric]', 'click', (_e, el) => {
    state.filter = state.filter === el.dataset.metric ? 'all' : el.dataset.metric;
    paint();
  });
  delegate(root, '#filterChips .chip', 'click', (_e, el) => {
    state.filter = el.dataset.filter;
    paint();
  });
  delegate(root, '[data-trial-link]', 'click', (_e, el) => {
    location.hash = `#/trial/${el.dataset.trialLink}`;
  });

  const search = root.querySelector('#trialSearch');
  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = search.value;
      paint();
    }, 160);
  });

  root.querySelector('[data-new-trial]')?.addEventListener('click', () => {
    location.hash = '#/new';
  });
  root.querySelector('[data-goto-pending]')?.addEventListener('click', () => {
    const first = store.pendingExtensionRequests[0];
    if (first) location.hash = `#/trial/${first.trialId}`;
    else toast('لا توجد طلبات تمديد معلّقة.', 'info');
  });
}

const chip = (key, label) =>
  `<button class="chip" data-filter="${key}" aria-pressed="${state.filter === key}">${esc(label)}</button>`;

export const title = 'لوحة المعلومات';
