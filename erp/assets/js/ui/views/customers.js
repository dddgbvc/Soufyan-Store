/* ============================================================
   ui/views/customers.js — العملاء
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, icon, ui, util: U, store, preorder } = ERP;
  ERP.views = ERP.views || {};

  const vs = { q: '', focused: false };

  function openNew() {
    const nameI = h('input', { class: 'input', placeholder: 'اسم العميل', autofocus: true });
    const phoneI = h('input', { class: 'input num', placeholder: '07XXXXXXXXX', inputmode: 'tel' });
    const notesI = h('textarea', { class: 'textarea', placeholder: 'ملاحظات (اختياري)' });
    const errEl = h('div', { class: 'err-text' });

    const m = ui.modal({
      title: 'عميل جديد', size: 'modal-sm',
      body: h('div', { class: 'col gap-3' },
        ui.field('الاسم', nameI, { required: true }),
        ui.field('رقم الهاتف', phoneI, { required: true }),
        ui.field('ملاحظات', notesI),
        errEl,
      ),
      foot: h('div', { class: 'row-between grow' },
        h('button', { class: 'btn btn-quiet', onclick: () => m.close() }, 'إلغاء'),
        h('button', {
          class: 'btn btn-primary',
          onclick: () => {
            try {
              const c = ERP.customers.create({ name: nameI.value, phone: phoneI.value, notes: notesI.value });
              m.close();
              ui.toast({
                title: 'أُضيف العميل', body: c.name, tone: 'ok',
                action: { label: 'طلب مسبق له', run: () => ERP.views.newPreorder.open({ customerId: c.id }) },
              });
            } catch (err) { errEl.textContent = err.message; }
          },
        }, 'حفظ'),
      ),
    });
  }

  function openProfile(id) {
    const p = ERP.customers.profile(id);
    if (!p) return;
    ui.drawer({
      title: p.customer.name,
      sub: p.customer.phone,
      badge: p.openCount ? h('span', { class: 'chip chip-plain' }, `${p.openCount} طلب مفتوح`) : null,
      body: h('div', { class: 'col gap-4' },
        h('div', { class: 'grid grid-2' },
          h('div', { class: 'card card-pad col' },
            h('span', { class: 'stat-label' }, 'إجمالي المشتريات'),
            h('span', { class: 'stat-value num' }, U.fmtMoney(p.spent)),
          ),
          h('div', { class: 'card card-pad col' },
            h('span', { class: 'stat-label' }, 'الطلبات المسبقة'),
            h('span', { class: 'stat-value num' }, p.orders.length),
          ),
        ),
        p.customer.notes ? ui.banner(p.customer.notes, 'info', 'info') : null,
        h('div', null,
          h('div', { class: 'd-section-title' }, 'الطلبات المسبقة'),
          h('div', { class: 'col gap-2' },
            ...(p.orders.length ? p.orders : []).map((o) => h('button', {
              class: 'mini-card row gap-3', style: { width: '100%', textAlign: 'start' },
              onclick: () => ERP.views.detail.open(o.id),
            },
              h('div', { class: 'cell-stack grow' },
                h('span', { class: 'fw-6 fs-13' }, o.target.productName),
                h('span', { class: 'cell-sub num' }, o.code + ' · ' + U.fmtDateShort(o.createdAt)),
              ),
              ui.statusChip(o.status),
            )),
            p.orders.length ? null : h('div', { class: 'fs-13 t-3' }, 'لا توجد طلبات مسبقة.'),
          ),
        ),
      ),
      foot: h('button', {
        class: 'btn btn-primary btn-lg btn-block',
        onclick: () => ERP.views.newPreorder.open({ customerId: id }),
      }, icon('plus', 17), 'طلب مسبق جديد'),
    });
  }

  function render() {
    const rows = store.customers().filter((c) => U.matchQuery(vs.q, c.name, c.phone, c.notes));

    const search = h('input', {
      class: 'input', type: 'search', placeholder: 'ابحث عن عميل…', value: vs.q,
      style: { maxWidth: '300px' },
      onfocus: () => { vs.focused = true; }, onblur: () => { vs.focused = false; },
      oninput: U.debounce((e) => { vs.q = e.target.value; ERP.app.rerender(); }, 200),
    });
    if (vs.focused) setTimeout(() => { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }, 0);

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', { class: 'page-title' }, 'العملاء'),
          h('p', { class: 'page-sub' }, 'كل طلب مسبق مرتبط بعميل — من هنا تتابع سجلّه كاملًا.'),
        ),
        h('button', { class: 'btn btn-primary', onclick: openNew }, icon('plus', 16), 'عميل جديد'),
      ),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, search, h('span', { class: 'grow' }),
          h('span', { class: 'fs-12 t-3 num' }, rows.length + ' عميل')),
        ui.smartTable({
          columns: [
            { key: 'name', label: 'العميل', primary: true, cell: (c) => h('div', { class: 'row gap-3' },
              ui.avatar(c.name),
              h('div', { class: 'cell-stack' },
                h('span', { class: 'cell-main' }, c.name),
                h('span', { class: 'cell-sub num' }, c.phone))) },
            { key: 'open', label: 'طلبات مفتوحة', cell: (c) => {
              const n = preorder.byCustomer(c.id).filter((o) => preorder.META[o.status].open).length;
              return n ? h('span', { class: 'chip', style: { '--tone': 'var(--accent)' } }, U.fmtNum(n))
                       : h('span', { class: 't-3' }, '—');
            } },
            { key: 'total', label: 'إجمالي الطلبات', cell: (c) => h('span', { class: 'num' }, preorder.byCustomer(c.id).length) },
            { key: 'spent', label: 'المشتريات', cell: (c) => h('span', { class: 'num' },
              U.fmtMoney(ERP.sales.byCustomer(c.id).reduce((a, s) => a + s.total, 0))) },
            { key: 'notes', label: 'ملاحظات', cell: (c) => h('span', { class: 'fs-12 t-3 truncate' }, c.notes || '—') },
            { key: 'act', label: '', class: 'col-actions', cell: (c) => h('div', { class: 'actions' },
              h('button', {
                class: 'btn btn-sm on-hover',
                onclick: (e) => { e.stopPropagation(); ERP.views.newPreorder.open({ customerId: c.id }); },
              }, icon('plus', 14), 'طلب مسبق'),
              h('button', {
                class: 'btn btn-sm btn-icon btn-quiet', 'aria-label': 'إجراءات',
                onclick: (e) => {
                  e.stopPropagation();
                  ui.menu(e.currentTarget, [
                    { label: 'عرض الملف', icon: 'eye', run: () => openProfile(c.id) },
                    { label: 'نسخ الرقم', icon: 'link', run: () => ui.copy(c.phone) },
                    '-',
                    { label: 'حذف العميل', icon: 'trash', tone: 'danger', run: () => {
                      try { ERP.customers.remove(c.id); ui.toast({ title: 'حُذف العميل', tone: 'warn' }); }
                      catch (err) { ui.toast({ title: 'تعذّر الحذف', body: err.message, tone: 'err' }); }
                    } },
                  ]);
                },
              }, icon('more', 16))) },
          ],
          rows,
          onRowClick: (c) => openProfile(c.id),
          empty: ui.emptyState({ title: 'لا يوجد عملاء', icon: 'users' }),
        }),
      ),
    );
  }

  ERP.views.customers = { render, openProfile };
})(window);
