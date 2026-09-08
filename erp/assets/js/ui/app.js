/* ============================================================
   ui/app.js — هيكل التطبيق: التنقّل، الإشعارات، الاختصارات
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, dom, icon, ui, util: U, store, bus } = ERP;

  const ROUTES = [
    { id: 'preorders', label: 'الطلب المسبق', icon: 'preorder', view: () => ERP.views.dashboard, group: 'العمليات' },
    { id: 'inventory', label: 'المخزون والاستلام', icon: 'box', view: () => ERP.views.inventory, group: 'العمليات' },
    { id: 'customers', label: 'العملاء', icon: 'users', view: () => ERP.views.customers, group: 'العمليات' },
    { id: 'sales', label: 'المبيعات', icon: 'receipt', view: () => ERP.views.sales, group: 'العمليات' },
    { id: 'templates', label: 'قوالب الرسائل', icon: 'message', view: () => ERP.views.templates, group: 'الإعداد' },
    { id: 'events', label: 'سجل الأحداث', icon: 'activity', view: () => ERP.views.eventsLog, group: 'الإعداد' },
    { id: 'settings', label: 'الإعدادات', icon: 'settings', view: () => ERP.views.settings, group: 'الإعداد' },
  ];

  let currentRoute = 'preorders';
  let rerenderQueued = false;

  /* ============================================================
     السمة
     ============================================================ */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    store.update((s) => { s.settings.theme = theme; }, { silent: true });
  }
  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    paintTopbar();
  }

  /* ============================================================
     الشريط الجانبي
     ============================================================ */
  function paintSidebar() {
    const side = document.getElementById('side');
    dom.clear(side);

    side.appendChild(h('div', { class: 'brand' },
      h('div', { class: 'brand-mark' }, 'س'),
      h('div', { class: 'brand-text' },
        h('div', { class: 'brand-name' }, 'سفيان ERP'),
        h('div', { class: 'brand-sub' }, 'نظام الطلب المسبق'),
      ),
    ));

    const scroll = h('div', { class: 'side-scroll col gap-2 grow' });
    const groups = [...new Set(ROUTES.map((r) => r.group))];
    groups.forEach((g) => {
      const grp = h('div', { class: 'nav-group' }, h('div', { class: 'nav-title' }, g));
      ROUTES.filter((r) => r.group === g).forEach((r) => {
        grp.appendChild(h('button', {
          class: 'nav-item',
          'aria-current': currentRoute === r.id ? 'page' : null,
          title: r.label,
          onclick: () => go(r.id),
        },
          icon(r.icon, 18),
          h('span', { class: 'nav-label grow' }, r.label),
          badgeFor(r.id),
        ));
      });
      scroll.appendChild(grp);
    });
    side.appendChild(scroll);

    const counts = ERP.preorder.counts();
    side.appendChild(h('div', { class: 'side-foot' },
      h('div', { class: 'side-card col gap-2' },
        h('div', { class: 'row-between' },
          h('span', { class: 'fs-11 fw-6' }, 'الطلبات المفتوحة'),
          h('span', { class: 'num fw-7 fs-15' }, counts.OPEN),
        ),
        h('div', { class: 'progress', style: { '--tone': 'var(--st-arrived)' } },
          h('i', { style: { width: (counts.ALL ? (counts.SOLD / counts.ALL) * 100 : 0) + '%' } })),
        h('span', { class: 'fs-11 t-3' },
          `${counts.SOLD} من ${counts.ALL} طلب اكتمل بالبيع`),
      ),
    ));
  }

  function badgeFor(routeId) {
    if (routeId === 'preorders') {
      const n = ERP.preorder.actionQueue().length;
      return n ? h('span', { class: 'nav-badge', dataset: { tone: 'alert' } }, n) : null;
    }
    if (routeId === 'inventory') {
      const n = store.preOrders().filter((o) => o.status === 'WAITING_ARRIVAL').length;
      return n ? h('span', { class: 'nav-badge' }, n) : null;
    }
    return null;
  }

  /* ============================================================
     الشريط العلوي
     ============================================================ */
  function paintTopbar() {
    const bar = document.getElementById('topbar');
    dom.clear(bar);
    const route = ROUTES.find((r) => r.id === currentRoute);
    const unread = ERP.notifications.unreadCount();

    bar.append(
      h('div', { class: 'topbar-meta' },
        h('div', { class: 'topbar-title' }, route.label),
        h('div', { class: 'topbar-crumb' }, store.settings().storeName),
      ),
      h('div', { class: 'topbar-spacer' }),
      h('div', { class: 'omni' },
        h('span', { class: 'omni-ic' }, icon('search', 16)),
        h('input', {
          type: 'text', placeholder: 'بحث سريع في كل النظام…', 'aria-label': 'بحث سريع',
          onfocus: (e) => { e.target.blur(); openPalette(); },
        }),
        h('kbd', null, 'Ctrl K'),
      ),
      h('button', {
        class: 'btn btn-icon btn-quiet bell', 'aria-label': `الإشعارات${unread ? ` (${unread} جديدة)` : ''}`,
        onclick: (e) => openNotifications(e.currentTarget),
      }, icon('bell', 18), unread ? h('span', { class: 'bell-dot' }, unread > 9 ? '9+' : unread) : null),
      h('button', {
        class: 'btn btn-icon btn-quiet', 'aria-label': 'تبديل المظهر', title: 'تبديل المظهر',
        onclick: toggleTheme,
      }, icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon', 18)),
      h('button', {
        class: 'btn btn-primary', onclick: () => ERP.views.newPreorder.open(),
      }, icon('plus', 16), h('span', { class: 'nav-label' }, 'طلب جديد')),
    );
  }

  /* ============================================================
     لوحة الإشعارات
     ============================================================ */
  function openNotifications(anchor) {
    const list = ERP.notifications.all().slice(0, 30);
    const content = h('div', { class: 'col', style: { minHeight: '0' } },
      h('div', { class: 'pop-head' },
        h('span', { class: 'fw-7 fs-13' }, 'الإشعارات'),
        h('button', {
          class: 'btn btn-sm btn-quiet',
          onclick: () => { ERP.notifications.markAllRead(); ui.closePopovers(); paintTopbar(); },
        }, 'تعليم الكل كمقروء'),
      ),
      h('div', { class: 'pop-list col gap-1' },
        list.length ? dom.frag(...list.map((n) => h('button', {
          class: 'noti' + (n.read ? '' : ' unread'),
          onclick: () => {
            ERP.notifications.markRead(n.id);
            ui.closePopovers();
            if (n.refType === 'preorder' && n.refId) ERP.views.detail.open(n.refId);
            paintTopbar();
          },
        },
          h('div', { class: 'noti-ic', style: { color: toneColor(n.severity) } }, icon(notiIcon(n.type), 15)),
          h('div', { class: 'cell-stack grow', style: { textAlign: 'start' } },
            h('span', { class: 'noti-title' }, n.title),
            h('span', { class: 'noti-body' }, n.body),
            h('span', { class: 'noti-time' }, U.relTime(n.at)),
          ),
        ))) : h('div', { class: 'empty' },
          h('div', { class: 'empty-ic' }, icon('bell', 22)),
          h('div', { class: 'empty-body' }, 'لا توجد إشعارات بعد.')),
      ),
    );
    ui.popover(anchor, content);
  }

  function notiIcon(type) {
    if (type === 'PREORDER_MATCHED') return 'sparkle';
    if (type === 'PREORDER_SOLD') return 'receipt';
    if (type === 'PREORDER_EXPIRED') return 'alert';
    if (type === 'MESSAGE_FAILED') return 'x';
    return 'info';
  }
  function toneColor(sev) {
    return { success: 'var(--ok)', warn: 'var(--warn)', error: 'var(--err)', info: 'var(--info)' }[sev] || 'var(--text-2)';
  }

  /* ============================================================
     لوحة الأوامر (Ctrl/⌘ + K)
     ============================================================ */
  function openPalette() {
    const listEl = h('div', { class: 'cmdk-list col gap-1' });
    const input = h('input', {
      class: 'cmdk-input', placeholder: 'اكتب اسم عميل، رقم طلب، منتج، أو أمرًا…', autofocus: true,
      oninput: () => paint(),
      onkeydown: (e) => {
        const opts = dom.qsa('.combo-opt', listEl);
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1, opts); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1, opts); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          const active = listEl.querySelector('.combo-opt.is-active') || opts[0];
          if (active) active.click();
        }
      },
    });
    let idx = 0;
    function move(dir, opts) {
      idx = U.clamp(idx + dir, 0, opts.length - 1);
      opts.forEach((o, i) => o.classList.toggle('is-active', i === idx));
      if (opts[idx]) opts[idx].scrollIntoView({ block: 'nearest' });
    }

    function results(q) {
      const out = [];
      ROUTES.forEach((r) => {
        if (U.matchQuery(q, r.label, r.id)) {
          out.push({ icon: r.icon, title: r.label, sub: 'انتقال', run: () => go(r.id) });
        }
      });
      out.push({ icon: 'plus', title: 'طلب مسبق جديد', sub: 'أمر', run: () => ERP.views.newPreorder.open() });
      out.push({ icon: 'box', title: 'استلام بضاعة', sub: 'أمر', run: () => go('inventory') });

      store.preOrders().forEach((o) => {
        const c = store.customer(o.customerId);
        if (U.matchQuery(q, o.code, c && c.name, o.target.productName, o.target.sku)) {
          out.push({
            icon: 'preorder', title: `${o.code} · ${o.target.productName}`,
            sub: (c ? c.name : '') + ' · ' + ERP.preorder.label(o.status),
            run: () => ERP.views.detail.open(o.id),
          });
        }
      });
      store.customers().forEach((c) => {
        if (U.matchQuery(q, c.name, c.phone)) {
          out.push({ icon: 'user', title: c.name, sub: c.phone, run: () => ERP.views.customers.openProfile(c.id) });
        }
      });
      return out.slice(0, 14);
    }

    function paint() {
      const q = input.value.trim();
      const items = results(q);
      idx = 0;
      dom.clear(listEl);
      if (!items.length) { listEl.appendChild(h('div', { class: 'combo-empty' }, 'لا نتائج')); return; }
      items.forEach((it, i) => {
        listEl.appendChild(h('button', {
          class: 'combo-opt' + (i === 0 ? ' is-active' : ''),
          onclick: () => { m.close(); it.run(); },
          onmouseenter: () => { idx = i; dom.qsa('.combo-opt', listEl).forEach((o, j) => o.classList.toggle('is-active', j === i)); },
        },
          icon(it.icon, 16),
          h('span', { class: 'grow' }, it.title),
          h('span', { class: 'fs-11 t-3' }, it.sub),
        ));
      });
    }

    const box = h('div', { class: 'col' }, input, listEl);
    const m = ui.modal({ title: '', body: box, size: 'cmdk', closeOnScrim: true });
    m.el.querySelector('.modal-head').remove();
    m.body.style.padding = '0';
    paint();
    setTimeout(() => input.focus(), 60);
  }

  /* ============================================================
     التنقّل والرسم
     ============================================================ */
  function go(routeId) {
    if (!ROUTES.some((r) => r.id === routeId)) routeId = 'preorders';
    currentRoute = routeId;
    if (location.hash !== '#/' + routeId) location.hash = '#/' + routeId;
    render();
    document.getElementById('view').scrollTo({ top: 0 });
  }

  function render() {
    const route = ROUTES.find((r) => r.id === currentRoute);
    const view = route.view();
    const host = document.getElementById('view');
    const scroll = host.scrollTop;
    dom.mount(host, view.render());
    host.scrollTop = scroll;
    paintSidebar();
    paintTopbar();
  }

  /** إعادة رسم مؤجَّلة (تُجمع عدة تغييرات في رسم واحد) */
  function rerender() {
    if (rerenderQueued) return;
    rerenderQueued = true;
    requestAnimationFrame(() => { rerenderQueued = false; render(); });
  }

  /* ============================================================
     الاختصارات
     ============================================================ */
  function bindShortcuts() {
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) ||
        document.activeElement.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); openPalette(); return;
      }
      if (typing) return;
      if (e.key === 'n' || e.key === 'N' || e.key === 'ن') {
        e.preventDefault(); ERP.views.newPreorder.open();
      } else if (e.key === '/') {
        e.preventDefault();
        if (currentRoute !== 'preorders') go('preorders');
        ERP.views.dashboard.focusSearch();
      }
    });
  }

  /* ============================================================
     الإقلاع
     ============================================================ */
  function boot() {
    store.init();
    applyTheme(store.settings().theme || 'dark');

    const expired = ERP.preorder.checkExpiries();
    if (expired) console.info(`[erp] ${expired} طلب انتهت صلاحيته`);

    // إشعارات جديدة → Toast
    bus.on('notification:new', (n) => {
      ui.toast({
        title: n.title,
        body: n.body,
        tone: n.type === 'PREORDER_MATCHED' ? 'match'
          : n.severity === 'success' ? 'ok'
          : n.severity === 'warn' ? 'warn'
          : n.severity === 'error' ? 'err' : 'info',
        timeout: n.type === 'PREORDER_MATCHED' ? 8000 : 4500,
        action: n.refType === 'preorder' && n.refId
          ? { label: 'عرض الطلب', run: () => ERP.views.detail.open(n.refId) }
          : null,
      });
      paintTopbar();
    });

    bus.on('store:changed', () => rerender());
    window.addEventListener('hashchange', () => {
      const id = (location.hash || '').replace('#/', '');
      if (id && id !== currentRoute) go(id);
    });

    const initial = (location.hash || '').replace('#/', '');
    currentRoute = ROUTES.some((r) => r.id === initial) ? initial : 'preorders';

    bindShortcuts();
    render();

    const splash = document.getElementById('boot');
    if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 320); }
  }

  ERP.app = { boot, go, render, rerender, openPalette, ROUTES, get route() { return currentRoute; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
