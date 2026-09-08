/* ============================================================
   ui/views/dashboard.js — لوحة الطلب المسبق
   Cards · Smart Table · Status Chips · Glass Panels · Contextual Actions
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, icon, ui, util: U, store, preorder, actions } = ERP;
  ERP.views = ERP.views || {};
  const S = preorder.STATUS;

  /* حالة العرض — تبقى بين إعادات الرسم */
  const vs = {
    status: 'OPEN',
    q: '',
    quick: null,             // 'late' | 'matched' | null
    sort: { key: 'createdAt', dir: 'desc' },
    page: 1,
    per: 12,
    searchFocused: false,
  };

  const CARDS = [
    { key: 'OPEN',              label: 'الطلبات المفتوحة', tone: 'var(--accent)',        icon: 'preorder' },
    { key: S.PENDING,           label: 'قيد الانتظار',     tone: 'var(--st-pending)',    icon: 'clock' },
    { key: S.WAITING_ARRIVAL,   label: 'بانتظار الوصول',   tone: 'var(--st-waiting)',    icon: 'truck' },
    { key: S.ARRIVED,           label: 'وصلت',             tone: 'var(--st-arrived)',    icon: 'inbox', live: true },
    { key: S.CUSTOMER_NOTIFIED, label: 'تم إشعار العميل',  tone: 'var(--st-notified)',   icon: 'message' },
    { key: S.RESERVED,          label: 'محجوزة',           tone: 'var(--st-reserved)',   icon: 'reserve' },
    { key: S.SOLD,              label: 'تم بيعها',         tone: 'var(--st-sold)',       icon: 'receipt' },
    { key: S.CANCELLED,         label: 'ملغاة',            tone: 'var(--st-cancelled)',  icon: 'x' },
    { key: S.EXPIRED,           label: 'منتهية',           tone: 'var(--st-expired)',    icon: 'alert' },
  ];

  /* ---------------- تصفية وترتيب ---------------- */
  function filtered() {
    const all = store.preOrders();
    return all.filter((o) => {
      if (vs.status === 'OPEN' && !preorder.META[o.status].open) return false;
      if (vs.status !== 'OPEN' && vs.status !== 'ALL' && o.status !== vs.status) return false;
      if (vs.quick === 'late' && !preorder.isLate(o)) return false;
      if (vs.quick === 'matched' && !o.matchInfo) return false;
      if (vs.q) {
        const c = store.customer(o.customerId);
        if (!U.matchQuery(vs.q, o.code, c && c.name, c && c.phone,
          o.target.productName, o.target.brand, o.target.model,
          o.target.sku, o.target.storage, o.target.color, o.notes)) return false;
      }
      return true;
    });
  }

  const SORTERS = {
    createdAt: (o) => o.createdAt,
    customer: (o) => (store.customer(o.customerId) || {}).name || '',
    product: (o) => o.target.productName,
    quantity: (o) => o.quantity,
    status: (o) => preorder.META[o.status].order,
    expectedAt: (o) => o.expectedAt || '9999',
  };

  function sorted(list) {
    const fn = SORTERS[vs.sort.key] || SORTERS.createdAt;
    return list.slice().sort(U.by(fn, vs.sort.dir));
  }

  function setStatus(key) {
    vs.status = vs.status === key ? 'ALL' : key;
    vs.page = 1;
    ERP.app.rerender();
  }

  /* ---------------- بطاقات المؤشرات ---------------- */
  function statStrip() {
    const counts = preorder.counts();
    const strip = h('div', { class: 'stat-strip' });
    CARDS.forEach((c) => {
      const n = c.key === 'OPEN' ? counts.OPEN : counts[c.key] || 0;
      const isLive = c.live && n > 0;
      strip.appendChild(h('button', {
        class: 'stat-card' + (isLive ? ' is-live' : ''),
        style: { '--tone': c.tone },
        'aria-pressed': String(vs.status === c.key),
        onclick: () => setStatus(c.key),
      },
        h('div', { class: 'stat-top' },
          h('i', { class: 'stat-dot' }),
          h('span', { class: 'stat-label' }, c.label),
        ),
        h('div', { class: 'stat-value num' }, U.fmtNum(n)),
        h('div', { class: 'stat-meta' }, metaFor(c.key, n)),
      ));
    });
    return strip;
  }

  function metaFor(key, n) {
    const all = store.preOrders();
    if (key === 'OPEN') {
      const late = all.filter(preorder.isLate).length;
      return late ? `${late} متأخرة عن الموعد` : 'كل المواعيد منضبطة';
    }
    if (key === S.ARRIVED) return n ? 'تحتاج إشعار العميل' : 'لا شيء بانتظار الإشعار';
    if (key === S.CUSTOMER_NOTIFIED) return n ? 'بانتظار الحجز' : '—';
    if (key === S.RESERVED) return n ? 'جاهزة للبيع' : '—';
    if (key === S.SOLD) {
      const revenue = store.sales().filter((s) => s.preOrderId).reduce((a, s) => a + s.total, 0);
      return revenue ? U.fmtMoney(revenue) : '—';
    }
    const today = all.filter((o) => o.status === key &&
      new Date(o.updatedAt).toDateString() === new Date().toDateString()).length;
    return today ? `${today} اليوم` : '—';
  }

  /* ---------------- تنبيه المطابقة ---------------- */
  function matchAlert() {
    const hits = store.preOrders().filter((o) => o.status === S.ARRIVED && o.matchInfo);
    if (!hits.length) return null;
    const first = hits[0];
    const cust = store.customer(first.customerId);
    const more = hits.length - 1;

    return h('div', { class: 'match-alert' },
      h('div', { class: 'ma-ic' }, icon('sparkle', 22)),
      h('div', { class: 'grow' },
        h('div', { class: 'ma-title' }, 'وصل منتج مطلوب مسبقًا'),
        h('div', { class: 'ma-body' },
          `${cust ? cust.name : '—'} · ${first.target.productName}` +
          `${first.target.storage && first.target.storage !== '—' ? ' · ' + first.target.storage : ''}` +
          `${first.target.color ? ' ' + first.target.color : ''} · الكمية ${first.quantity}` +
          (more > 0 ? ` — و${more} ${more === 1 ? 'طلب آخر' : 'طلبات أخرى'}` : '')),
      ),
      h('div', { class: 'row gap-2' },
        h('button', {
          class: 'btn btn-wa',
          onclick: () => actions.openMessage(first.id),
        }, icon('whatsapp', 16), 'إشعار العميل'),
        h('button', {
          class: 'btn',
          onclick: () => { vs.status = S.ARRIVED; vs.page = 1; ERP.app.rerender(); },
        }, 'عرض الكل'),
      ),
    );
  }

  /* ---------------- خلايا الجدول ---------------- */
  function customerCell(o) {
    const c = store.customer(o.customerId);
    return h('div', { class: 'row gap-3' },
      ui.avatar(c ? c.name : '؟'),
      h('div', { class: 'cell-stack' },
        h('span', { class: 'cell-main truncate' }, c ? c.name : 'عميل محذوف'),
        h('span', { class: 'cell-sub num' }, c ? c.phone : '—'),
      ),
      o.priority === 'HIGH' ? h('span', { class: 'chip', style: { '--tone': 'var(--st-cancelled)' }, title: 'أولوية عاجلة' }, 'عاجل') : null,
    );
  }

  function productCell(o) {
    return h('div', { class: 'cell-stack' },
      h('span', { class: 'cell-main truncate' }, o.target.productName),
      h('span', { class: 'cell-sub' }, `${o.target.brand} · ${o.target.model}`),
    );
  }

  function variantCell(o) {
    const t = o.target;
    return h('div', { class: 'row gap-1 wrap' },
      t.storage && t.storage !== '—' ? ui.attrChip(t.storage) : null,
      t.color ? ui.attrChip(t.color, t.colorHex) : null,
    );
  }

  function statusCell(o) {
    return h('div', { class: 'row gap-2' },
      ui.statusChip(o.status),
      o.matchInfo && o.status === S.ARRIVED
        ? h('span', { class: 'score-pill', title: `درجة المطابقة ${o.matchInfo.score}%` }, o.matchInfo.score + '%')
        : null,
    );
  }

  function expectedCell(o) {
    if (!o.expectedAt) return h('span', { class: 't-3' }, '—');
    const days = U.daysUntil(o.expectedAt);
    const late = preorder.isLate(o);
    const note = days < 0 ? `مرّ ${Math.abs(days)} يوم` : days === 0 ? 'اليوم' : `بعد ${days} يوم`;
    return h('div', { class: 'cell-stack' },
      h('span', { class: 'num fs-13', style: late ? { color: 'var(--err)' } : null },
        U.fmtDateShort(o.expectedAt)),
      h('span', { class: 'cell-sub', style: late ? { color: 'var(--err)' } : null },
        late ? `متأخر ${Math.abs(days)} يوم` : note),
    );
  }

  function actionsCell(o) {
    const primary = actions.primary(o);
    return h('div', { class: 'actions' },
      primary ? h('button', {
        class: 'btn btn-sm on-hover ' + (primary.tone === 'wa' ? 'btn-wa' : primary.tone === 'primary' ? 'btn-primary' : ''),
        onclick: (e) => { e.stopPropagation(); primary.run(); },
      }, icon(primary.icon, 14), primary.label) : null,
      h('button', {
        class: 'btn btn-sm btn-icon btn-quiet', 'aria-label': 'إجراءات أخرى',
        onclick: (e) => { e.stopPropagation(); ui.menu(e.currentTarget, actions.menuItems(o)); },
      }, icon('more', 16)),
    );
  }

  /* ---------------- الجدول ---------------- */
  function table(rows) {
    return ui.smartTable({
      columns: [
        { key: 'customer', label: 'العميل', sortable: true, cell: customerCell, primary: true },
        { key: 'product', label: 'المنتج', sortable: true, cell: productCell },
        { key: 'variant', label: 'Variant', cell: variantCell, mobileLabel: 'المواصفات' },
        { key: 'quantity', label: 'الكمية', sortable: true, cell: (o) => h('span', { class: 'num fw-6' }, o.quantity) },
        { key: 'createdAt', label: 'تاريخ الطلب', sortable: true, cell: (o) =>
          h('div', { class: 'cell-stack' },
            h('span', { class: 'num fs-13' }, U.fmtDateShort(o.createdAt)),
            h('span', { class: 'cell-sub' }, U.relTime(o.createdAt))) },
        { key: 'status', label: 'الحالة', sortable: true, cell: statusCell },
        { key: 'expectedAt', label: 'الموعد المتوقع', sortable: true, cell: expectedCell },
        { key: 'actions', label: 'الإجراءات', class: 'col-actions', cell: actionsCell, mobileLabel: '' },
      ],
      rows,
      sort: vs.sort,
      onSort: (key) => {
        if (vs.sort.key === key) vs.sort.dir = vs.sort.dir === 'asc' ? 'desc' : 'asc';
        else vs.sort = { key, dir: key === 'createdAt' ? 'desc' : 'asc' };
        ERP.app.rerender();
      },
      onRowClick: (o) => ERP.views.detail.open(o.id),
      rowClass: (o) => (o.status === S.ARRIVED && o.matchInfo ? 'is-hot' : ''),
      empty: ui.emptyState({
        title: vs.q ? 'لا نتائج مطابقة للبحث' : 'لا توجد طلبات في هذه الحالة',
        body: vs.q ? 'جرّب اسم عميل أو رقم طلب أو موديل.' : 'ابدأ بإنشاء طلب مسبق جديد للعميل.',
        icon: vs.q ? 'search' : 'preorder',
        action: vs.q ? null : h('button', {
          class: 'btn btn-primary mt-2',
          onclick: () => ERP.views.newPreorder.open(),
        }, icon('plus', 16), 'طلب مسبق جديد'),
      }),
    });
  }

  /* ---------------- شريط الأدوات ---------------- */
  function toolbar(total) {
    const search = h('input', {
      class: 'input', type: 'search', placeholder: 'ابحث باسم العميل، رقم الطلب، الموديل…',
      value: vs.q, style: { maxWidth: '320px' },
      onfocus: () => { vs.searchFocused = true; },
      onblur: () => { vs.searchFocused = false; },
      oninput: U.debounce((e) => { vs.q = e.target.value; vs.page = 1; ERP.app.rerender(); }, 200),
    });
    if (vs.searchFocused) setTimeout(() => { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }, 0);

    const counts = preorder.counts();
    const lateCount = store.preOrders().filter(preorder.isLate).length;
    const matchedCount = store.preOrders().filter((o) => o.matchInfo && o.status === S.ARRIVED).length;

    return h('div', { class: 'panel-head' },
      search,
      h('div', { class: 'filter-bar grow' },
        h('button', {
          class: 'fchip', 'aria-pressed': String(vs.status === 'ALL'),
          onclick: () => { vs.status = 'ALL'; vs.page = 1; ERP.app.rerender(); },
        }, 'الكل', h('span', { class: 'count' }, counts.ALL)),
        h('button', {
          class: 'fchip', 'aria-pressed': String(vs.status === 'OPEN'),
          onclick: () => { vs.status = 'OPEN'; vs.page = 1; ERP.app.rerender(); },
        }, 'المفتوحة', h('span', { class: 'count' }, counts.OPEN)),
        h('button', {
          class: 'fchip', 'aria-pressed': String(vs.quick === 'late'),
          onclick: () => { vs.quick = vs.quick === 'late' ? null : 'late'; vs.page = 1; ERP.app.rerender(); },
        }, icon('alert', 13), 'متأخرة', h('span', { class: 'count' }, lateCount)),
        h('button', {
          class: 'fchip', 'aria-pressed': String(vs.quick === 'matched'),
          onclick: () => { vs.quick = vs.quick === 'matched' ? null : 'matched'; vs.page = 1; ERP.app.rerender(); },
        }, icon('sparkle', 13), 'وصلت مطابقة', h('span', { class: 'count' }, matchedCount)),
      ),
      h('div', { class: 'row gap-2' },
        h('span', { class: 'fs-12 t-3 num' }, U.fmtNum(total) + ' نتيجة'),
        h('button', {
          class: 'btn btn-sm btn-quiet btn-icon', title: 'تصدير CSV', 'aria-label': 'تصدير CSV',
          onclick: () => exportCSV(),
        }, icon('download', 16)),
      ),
    );
  }

  function exportCSV() {
    const rows = sorted(filtered());
    const csv = U.toCSV(rows, [
      { label: 'رقم الطلب', value: (o) => o.code },
      { label: 'العميل', value: (o) => (store.customer(o.customerId) || {}).name || '' },
      { label: 'الهاتف', value: (o) => (store.customer(o.customerId) || {}).phone || '' },
      { label: 'المنتج', value: (o) => o.target.productName },
      { label: 'الموديل', value: (o) => o.target.model },
      { label: 'SKU', value: (o) => o.target.sku },
      { label: 'السعة', value: (o) => o.target.storage },
      { label: 'اللون', value: (o) => o.target.color },
      { label: 'الكمية', value: (o) => o.quantity },
      { label: 'الحالة', value: (o) => preorder.label(o.status) },
      { label: 'تاريخ الطلب', value: (o) => U.fmtDateShort(o.createdAt) },
      { label: 'الموعد المتوقع', value: (o) => (o.expectedAt ? U.fmtDateShort(o.expectedAt) : '') },
    ]);
    U.downloadText(`pre-orders-${U.dateInput(U.nowISO())}.csv`, csv, 'text/csv;charset=utf-8');
    ui.toast({ title: 'تم تصدير الملف', body: `${rows.length} طلب`, tone: 'ok' });
  }

  /* ---------------- الترقيم ---------------- */
  function pager(total) {
    const pages = Math.max(1, Math.ceil(total / vs.per));
    vs.page = U.clamp(vs.page, 1, pages);
    const from = total ? (vs.page - 1) * vs.per + 1 : 0;
    const to = Math.min(total, vs.page * vs.per);
    return h('div', { class: 'panel-foot' },
      h('span', { class: 'num' }, `${from}–${to} من ${total}`),
      pages > 1 ? h('div', { class: 'row gap-2' },
        h('button', {
          class: 'btn btn-sm btn-quiet', disabled: vs.page === 1,
          onclick: () => { vs.page--; ERP.app.rerender(); },
        }, 'السابق'),
        h('span', { class: 'num fs-12' }, `${vs.page} / ${pages}`),
        h('button', {
          class: 'btn btn-sm btn-quiet', disabled: vs.page === pages,
          onclick: () => { vs.page++; ERP.app.rerender(); },
        }, 'التالي'),
      ) : null,
    );
  }

  /* ---------------- الرسم ---------------- */
  function render() {
    const list = sorted(filtered());
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / vs.per));
    vs.page = U.clamp(vs.page, 1, pages);
    const paged = list.slice((vs.page - 1) * vs.per, vs.page * vs.per);

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', { class: 'page-title' }, 'الطلب المسبق'),
          h('p', { class: 'page-sub' }, 'سجّل ما يطلبه العملاء وغير متوفر الآن، وتابعه حتى التسليم.'),
        ),
        h('div', { class: 'page-actions' },
          h('button', {
            class: 'btn', onclick: () => ERP.app.go('inventory'),
          }, icon('box', 16), 'استلام بضاعة'),
          h('button', {
            class: 'btn btn-primary', onclick: () => ERP.views.newPreorder.open(),
          }, icon('plus', 16), 'طلب مسبق جديد',
            h('kbd', { class: 'fs-11', style: { opacity: '.7' } }, 'N')),
        ),
      ),
      matchAlert(),
      statStrip(),
      h('div', { class: 'panel' },
        toolbar(total),
        table(paged),
        pager(total),
      ),
    );
  }

  ERP.views.dashboard = {
    render,
    focusSearch() {
      const el = document.querySelector('.panel-head input[type="search"]');
      if (el) el.focus();
    },
    filterStatus(status) { vs.status = status; vs.page = 1; },
  };
})(window);
