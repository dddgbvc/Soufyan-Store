/* ============================================================
   ui/views/eventsLog.js — سجل أحداث النظام
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, icon, ui, util: U, store, events } = ERP;
  ERP.views = ERP.views || {};

  const vs = { type: 'ALL', q: '', focused: false, limit: 60 };

  function describe(ev) {
    const p = ev.payload || {};
    switch (ev.type) {
      case 'PREORDER_MATCHED':
        return `${p.customerName || ''} · ${p.productName || ''} · الكمية ${p.quantity} — تطابق ${p.score}%`;
      case 'PREORDER_CREATED':
        return `${p.code} · ${p.productName || ''} × ${p.quantity || 1}`;
      case 'PREORDER_STATUS_CHANGED':
        return `${p.code}: ${ERP.preorder.label(p.from)} ← ${ERP.preorder.label(p.to)}${p.note ? ' · ' + p.note : ''}`;
      case 'INVENTORY_RECEIVED':
        return `${p.productName} · ${p.quantity} قطعة · ${p.supplier || ''}`;
      case 'MESSAGE_SENT':
        return `${p.code} عبر ${p.channel}`;
      case 'MESSAGE_FAILED':
        return p.reason || 'فشل الإرسال';
      case 'PREORDER_SOLD':
        return `${p.code} → ${p.saleCode || ''} · ${U.fmtMoney(p.total)}`;
      case 'PREORDER_RESERVED':
        return `${p.code}${p.serials && p.serials.length ? ' · IMEI: ' + p.serials.join('، ') : ''}`;
      case 'SALE_CREATED':
        return `${p.code} · ${U.fmtMoney(p.total)}`;
      case 'CUSTOMER_CREATED':
        return p.name;
      default:
        return p.code || p.name || '—';
    }
  }

  function render() {
    const types = Object.keys(events.TYPES);
    let list = events.all();
    if (vs.type !== 'ALL') list = list.filter((e) => e.type === vs.type);
    if (vs.q) list = list.filter((e) => U.matchQuery(vs.q, e.type, events.label(e.type), describe(e), e.actor));
    const shown = list.slice(0, vs.limit);

    const search = h('input', {
      class: 'input', type: 'search', placeholder: 'ابحث في السجل…', value: vs.q,
      style: { maxWidth: '280px' },
      onfocus: () => { vs.focused = true; }, onblur: () => { vs.focused = false; },
      oninput: U.debounce((e) => { vs.q = e.target.value; ERP.app.rerender(); }, 200),
    });
    if (vs.focused) setTimeout(() => { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }, 0);

    const typeSelect = h('select', {
      class: 'select', style: { maxWidth: '220px' },
      onchange: (e) => { vs.type = e.target.value; ERP.app.rerender(); },
    },
      h('option', { value: 'ALL', selected: vs.type === 'ALL' }, 'كل الأنواع'),
      ...types.map((t) => h('option', { value: t, selected: vs.type === t }, events.label(t))),
    );

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', { class: 'page-title' }, 'سجل الأحداث'),
          h('p', { class: 'page-sub' }, 'كل عملية في النظام مسجّلة — للمراجعة والتدقيق.'),
        ),
        h('button', {
          class: 'btn',
          onclick: () => {
            const csv = U.toCSV(list, [
              { label: 'الوقت', value: (e) => U.fmtDateTime(e.at) },
              { label: 'النوع', value: (e) => e.type },
              { label: 'الوصف', value: (e) => describe(e) },
              { label: 'المستخدم', value: (e) => e.actor },
            ]);
            U.downloadText(`events-${U.dateInput(U.nowISO())}.csv`, csv, 'text/csv;charset=utf-8');
          },
        }, icon('download', 16), 'تصدير'),
      ),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' },
          search,
          h('div', { class: 'select-wrap' }, typeSelect, h('span', { class: 'caret' }, icon('caret', 14))),
          h('span', { class: 'grow' }),
          h('span', { class: 'fs-12 t-3 num' }, list.length + ' حدث'),
        ),
        shown.length ? h('div', null, ...shown.map((ev) => h('div', { class: 'ev-row' },
          h('span', { class: 'ev-type', dataset: { hot: String(events.isHot(ev.type)) } }, events.label(ev.type)),
          h('div', { class: 'cell-stack' },
            h('span', { class: 'fs-13' }, describe(ev)),
            h('span', { class: 'cell-sub' }, `${U.fmtDateTime(ev.at)} · ${ev.actor}`),
          ),
          ev.payload && ev.payload.preOrderId
            ? h('button', {
                class: 'btn btn-sm btn-quiet',
                onclick: () => ERP.views.detail.open(ev.payload.preOrderId),
              }, 'عرض')
            : h('span'),
        ))) : ui.emptyState({ title: 'لا أحداث مطابقة', icon: 'activity' }),
        list.length > shown.length
          ? h('div', { class: 'panel-foot' },
              h('span', null, `عُرض ${shown.length} من ${list.length}`),
              h('button', {
                class: 'btn btn-sm', onclick: () => { vs.limit += 60; ERP.app.rerender(); },
              }, 'عرض المزيد'))
          : null,
      ),
    );
  }

  ERP.views.eventsLog = { render };
})(window);
