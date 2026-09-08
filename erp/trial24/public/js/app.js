/**
 * Trial24 — نقطة الدخول: الإقلاع، المُوجّه، الهيكل العام.
 */

import { api, session } from './api.js';
import { deviceClockWarning, onClockChange, onTick, startClock } from './clock.js';
import { clockTime, esc, icon } from './format.js';
import { loadBootstrap, refreshUnread, store, subscribe, switchUser } from './state.js';
import { $, delegate, openModal, toast } from './ui.js';

import * as dashboard from './views/dashboard.js';
import * as newTrial from './views/newTrial.js';
import * as trialDetail from './views/trialDetail.js';
import * as devices from './views/devices.js';
import * as analytics from './views/analytics.js';
import * as audit from './views/audit.js';
import * as settings from './views/settings.js';
import { openNotifications } from './views/notifications.js';

// ——————————————————————— المُوجّه ———————————————————————

const ROUTES = [
  { pattern: /^#?\/?$/, view: dashboard, nav: 'dashboard' },
  { pattern: /^#\/dashboard$/, view: dashboard, nav: 'dashboard' },
  { pattern: /^#\/new$/, view: newTrial, nav: 'new' },
  { pattern: /^#\/trial\/(?<id>[^/]+)$/, view: trialDetail, nav: 'dashboard' },
  { pattern: /^#\/devices$/, view: devices, nav: 'devices' },
  { pattern: /^#\/device\/(?<id>[^/]+)$/, view: devices, render: 'renderDetail', title: 'سجل الجهاز', nav: 'devices' },
  { pattern: /^#\/analytics$/, view: analytics, nav: 'analytics' },
  { pattern: /^#\/audit$/, view: audit, nav: 'audit' },
  { pattern: /^#\/settings$/, view: settings, nav: 'settings' },
];

let leaveHandlers = [];
let currentRoute = null;
let rendering = false;

const ctx = {
  onLeave(fn) {
    leaveHandlers.push(fn);
  },
  reload() {
    renderRoute(location.hash, { force: true });
  },
  refreshShell,
};

async function renderRoute(hash, { force = false } = {}) {
  // استبدال عقدة العرض بنسخة نظيفة قبل كل رسم:
  // الشاشات تسجّل مستمعيها على الجذر عبر التفويض، ولولا هذا الاستبدال
  // لتراكمت المستمعات مع كل إعادة رسم فتتكرّر النوافذ والإجراءات.
  const stale = $('#view');
  const view = stale.cloneNode(false);
  stale.replaceWith(view);

  const match = ROUTES.map((r) => ({ r, m: r.pattern.exec(hash || '#/') })).find((x) => x.m);

  if (!match) {
    view.innerHTML = `<div class="empty"><div class="empty__title">الصفحة غير موجودة</div>
      <a class="btn btn--sm" href="#/dashboard">العودة للوحة</a></div>`;
    return;
  }

  const { r, m } = match;
  const params = m.groups || {};
  const key = `${hash}`;
  if (!force && currentRoute === key && rendering) return;
  currentRoute = key;

  // تنظيف عدّادات ومستمعي الشاشة السابقة
  for (const fn of leaveHandlers) {
    try {
      fn();
    } catch (err) {
      console.error('[app] فشل تنظيف الشاشة:', err);
    }
  }
  leaveHandlers = [];

  const renderFn = r.view[r.render || 'render'];
  const pageTitle = r.title || r.view.title || 'تجربة جهاز 24';
  $('#pageTitle').textContent = pageTitle;
  document.title = `${pageTitle} — تجربة جهاز 24`;
  setActiveNav(r.nav);

  view.innerHTML = `<div class="stack">
    <div class="skeleton" style="height:96px"></div>
    <div class="skeleton" style="height:180px"></div>
    <div class="skeleton" style="height:280px"></div>
  </div>`;

  rendering = true;
  try {
    await renderFn(view, ctx, params);
    view.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  } catch (err) {
    console.error('[app] فشل عرض الشاشة:', err);
    view.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__icon">${icon('alert', 'icon--lg')}</div>
          <div class="empty__title">تعذّر تحميل الشاشة</div>
          <div style="font-size:var(--fs-xs);max-width:44ch">${esc(err.message || 'خطأ غير معروف')}</div>
          <button class="btn btn--sm" onclick="location.reload()">إعادة المحاولة</button>
        </div>
      </div>`;
  } finally {
    rendering = false;
  }
}

function setActiveNav(nav) {
  document.querySelectorAll('#nav .nav__item').forEach((el) => {
    if (el.dataset.route === nav) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

// ——————————————————————— الهيكل ———————————————————————

function refreshShell() {
  // إخفاء عناصر التنقّل التي لا يملك المستخدم صلاحيتها
  document.querySelectorAll('#nav .nav__item[data-perm]').forEach((el) => {
    el.hidden = !store.permissions.includes(el.dataset.perm);
  });
  $('#userName').textContent = store.user ? `${store.user.name} · ${store.user.roleLabel}` : '…';
  const badge = $('#bellBadge');
  badge.textContent = store.unread > 99 ? '99+' : store.unread;
  badge.hidden = !store.unread;
  $('#newTrialBtn').hidden = !store.permissions.includes('trial.create');

  const pending = store.pendingExtensionRequests?.length || 0;
  const navDash = document.querySelector('#nav [data-route="dashboard"]');
  navDash.querySelector('.nav__badge')?.remove();
  if (pending && store.permissions.includes('trial.extend')) {
    navDash.insertAdjacentHTML('beforeend', `<span class="nav__badge">${pending}</span>`);
  }
}

function setupTheme() {
  const saved = localStorage.getItem('trial24.theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  const paint = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('#themeBtn').innerHTML = `<svg class="icon"><use href="#i-${dark ? 'sun' : 'moon'}"/></svg>`;
    $('#themeBtn').title = dark ? 'السمة الفاتحة' : 'السمة الداكنة';
  };
  paint();
  $('#themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('trial24.theme', next);
    paint();
  });
}

function setupClockChip() {
  const chip = $('#clockChip');
  const time = $('#clockTime');

  onClockChange((s) => {
    chip.dataset.state = s.status;
    const labels = {
      ok: `مزامن مع الخادم · ذهاب وإياب ${s.rtt}مث`,
      sync: 'جارٍ المزامنة مع ساعة الخادم…',
      stale: 'تأخّرت المزامنة — الأرقام قد تكون قديمة',
      offline: 'انقطع الاتصال بالخادم',
    };
    chip.title = labels[s.status] || '';
  });

  onTick((now) => {
    time.textContent = clockTime(now);
  });

  // تحذير لمرة واحدة إن كانت ساعة الجهاز بعيدة عن ساعة النظام
  setTimeout(() => {
    const warning = deviceClockWarning();
    if (warning) toast(warning, 'warn', 8000);
  }, 2500);
}

function setupUserSwitch() {
  $('#userBtn').addEventListener('click', () => {
    const handle = openModal({
      title: 'المستخدم الحالي',
      sub: 'محاكاة الدخول داخل ERP — الصلاحيات تُفرض على الخادم لكل مستخدم',
      icon: 'users',
      body: `
        <div class="pick-list">
          ${store.users
            .map(
              (u) => `
            <button type="button" class="pick" data-user="${esc(u.id)}" aria-pressed="${u.id === store.user.id}">
              <span class="pick__avatar">${esc(u.name.slice(0, 1))}</span>
              <span class="pick__main">
                <span class="pick__title">${esc(u.name)}</span>
                <span class="pick__sub">${esc(u.title || '')}</span>
              </span>
              <span class="pick__end"><span class="badge badge--${u.role === 'manager' ? 'accent' : 'muted'}">${esc(u.roleLabel)}</span></span>
            </button>`
            )
            .join('')}
        </div>`,
      actions: [{ label: 'إغلاق', value: null }],
    });

    delegate(handle.node, '[data-user]', 'click', async (_e, el) => {
      const id = el.dataset.user;
      if (id === store.user.id) return;
      try {
        await switchUser(id);
      } catch (err) {
        toast(err.message, 'danger');
        return;
      }
      handle.close(id);
      refreshShell();
      toast(`تم التبديل إلى ${store.user.name} (${store.user.roleLabel})`, 'ok');
      ctx.reload();
    });
  });
}

/** استطلاع خفيف: عدّاد الإشعارات + طلبات التمديد المعلّقة. */
function startPolling() {
  let lastUnread = store.unread;
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const data = await api.notifications({ limit: 1 });
      if (data.unread !== lastUnread) {
        if (data.unread > lastUnread) {
          const items = await api.notifications({ limit: 1, unread: '1' });
          const latest = items.items[0];
          if (latest) {
            toast(latest.title, latest.severity === 'critical' ? 'danger' : latest.severity === 'warning' ? 'warn' : 'info', 6000);
          }
        }
        lastUnread = data.unread;
        store.unread = data.unread;
        refreshShell();
      }
    } catch {
      /* تجاهل انقطاعًا مؤقتًا */
    }
  }, 30_000);
}

// ——————————————————————— الإقلاع ———————————————————————

async function boot() {
  setupTheme();

  try {
    await loadBootstrap();
  } catch (err) {
    // جلسة غير صالحة (مستخدم محذوف مثلًا) → اختيار مستخدم من القائمة
    if (err.code === 'UNAUTHENTICATED') {
      try {
        const users = await api.users();
        session.set(users[0].id);
        await loadBootstrap();
      } catch (inner) {
        fatal(inner);
        return;
      }
    } else {
      fatal(err);
      return;
    }
  }

  refreshShell();
  setupClockChip();
  setupUserSwitch();
  await startClock();

  $('#bellBtn').addEventListener('click', () => openNotifications(ctx));
  $('#newTrialBtn').addEventListener('click', () => {
    location.hash = '#/new';
  });
  delegate(document.querySelector('#nav'), '.nav__item', 'click', (_e, el) => {
    location.hash = `#/${el.dataset.route}`;
  });

  window.addEventListener('hashchange', () => renderRoute(location.hash));
  await renderRoute(location.hash);

  subscribe(() => refreshShell());
  startPolling();
}

function fatal(err) {
  $('#view').innerHTML = `
    <div class="card">
      <div class="empty">
        <div class="empty__icon">${icon('alert', 'icon--lg')}</div>
        <div class="empty__title">تعذّر الاتصال بخادم Trial24</div>
        <div style="font-size:var(--fs-xs);max-width:46ch;line-height:1.8">
          ${esc(err.message || '')}<br>
          شغّل الخادم من مجلد المشروع بالأمر:
          <code style="font-family:var(--font-num);direction:ltr;display:inline-block">node server/server.js</code>
        </div>
        <button class="btn btn--sm" onclick="location.reload()">إعادة المحاولة</button>
      </div>
    </div>`;
}

boot();
