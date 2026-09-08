/* ============================================================
   ui/views/sales.js — المبيعات وعلاقتها بالطلبات المسبقة
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, icon, ui, util: U, store } = ERP;
  ERP.views = ERP.views || {};

  function render() {
    const stats = ERP.sales.stats();
    const rows = store.sales();

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', { class: 'page-title' }, 'المبيعات'),
          h('p', { class: 'page-sub' }, 'كل بيع ناتج عن طلب مسبق يحتفظ برابطه بالطلب الأصلي.'),
        ),
      ),
      h('div', { class: 'stat-strip' },
        statCard('إجمالي الفواتير', U.fmtNum(stats.count), 'var(--accent)', 'receipt', '—'),
        statCard('من طلبات مسبقة', U.fmtNum(stats.fromPreOrders), 'var(--st-reserved)', 'preorder', stats.share + '% من الفواتير'),
        statCard('إيراد الطلبات المسبقة', U.fmtMoney(stats.preOrderRevenue), 'var(--st-sold)', 'tag', '—'),
        statCard('الإيراد الكلي', U.fmtMoney(stats.revenue), 'var(--accent-2)', 'activity', '—'),
      ),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' },
          h('div', { class: 'section-title grow' }, 'الفواتير'),
          h('span', { class: 'fs-12 t-3 num' }, rows.length),
        ),
        ui.smartTable({
          columns: [
            { key: 'code', label: 'الفاتورة', primary: true, cell: (s) => h('div', { class: 'row gap-3' },
              h('div', { class: 'avatar' }, icon('receipt', 15)),
              h('div', { class: 'cell-stack' },
                h('span', { class: 'cell-main num' }, s.code),
                h('span', { class: 'cell-sub' }, U.fmtDateTime(s.createdAt)))) },
            { key: 'customer', label: 'العميل', cell: (s) => {
              const c = store.customer(s.customerId);
              return h('span', null, c ? c.name : '—');
            } },
            { key: 'po', label: 'الطلب المسبق', cell: (s) => s.preOrderId
              ? h('button', {
                  class: 'chip', style: { '--tone': 'var(--st-reserved)' },
                  onclick: (e) => { e.stopPropagation(); ERP.views.detail.open(s.preOrderId); },
                }, icon('link', 12), s.preOrderCode || 'عرض')
              : h('span', { class: 't-3' }, 'بيع مباشر') },
            { key: 'items', label: 'القطع', cell: (s) => h('div', { class: 'cell-stack' },
              h('span', { class: 'num' }, s.items.length),
              s.items[0] && s.items[0].serial
                ? h('span', { class: 'cell-sub num truncate' }, s.items[0].serial)
                : null) },
            { key: 'total', label: 'الإجمالي', cell: (s) => h('span', { class: 'num fw-7' }, U.fmtMoney(s.total)) },
            { key: 'pay', label: 'الدفع', cell: (s) => h('span', { class: 'chip chip-plain' },
              ERP.sales.PAYMENT[s.paymentMethod] || s.paymentMethod) },
          ],
          rows,
          onRowClick: (s) => { if (s.preOrderId) ERP.actions.viewSale(s.preOrderId); },
          empty: ui.emptyState({
            title: 'لا توجد فواتير بعد',
            body: 'أتمم بيع طلب محجوز من لوحة الطلب المسبق لتظهر الفاتورة هنا.',
            icon: 'receipt',
          }),
        }),
      ),
    );
  }

  function statCard(label, value, tone, ic, meta) {
    return h('div', { class: 'stat-card', style: { '--tone': tone } },
      h('div', { class: 'stat-top' }, h('i', { class: 'stat-dot' }), h('span', { class: 'stat-label' }, label)),
      h('div', { class: 'stat-value num', style: { fontSize: 'var(--fs-21)' } }, value),
      h('div', { class: 'stat-meta' }, meta),
    );
  }

  ERP.views.sales = { render };
})(window);
