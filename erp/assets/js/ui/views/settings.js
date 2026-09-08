/* ============================================================
   ui/views/settings.js — إعدادات النظام والبيانات
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, icon, ui, util: U, store } = ERP;
  ERP.views = ERP.views || {};

  function set(key, value) {
    store.update((s) => { s.settings[key] = value; });
  }

  function toggleRow(label, hint, key) {
    const on = !!store.settings()[key];
    return h('button', {
      class: 'stock-row', 'aria-pressed': String(on), style: { width: '100%', textAlign: 'start' },
      onclick: () => { set(key, !on); ERP.app.rerender(); },
    },
      h('span', { class: 'box' }, on ? icon('check', 12) : null),
      h('div', { class: 'cell-stack grow' },
        h('span', { class: 'fw-6 fs-13' }, label),
        h('span', { class: 'cell-sub' }, hint),
      ),
    );
  }

  function render() {
    const st = store.settings();

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', { class: 'page-title' }, 'الإعدادات'),
          h('p', { class: 'page-sub' }, 'ضبط سلوك المطابقة وبيانات المتجر ونسخ البيانات.'),
        ),
      ),

      h('div', { class: 'grid grid-2' },
        /* بيانات المتجر */
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('div', { class: 'section-title' }, 'بيانات المتجر'), icon('tag', 18)),
          h('div', { class: 'card-body col gap-3' },
            ui.field('اسم المتجر', h('input', {
              class: 'input', value: st.storeName,
              oninput: U.debounce((e) => set('storeName', e.target.value), 400),
            })),
            ui.field('العنوان', h('input', {
              class: 'input', value: st.storeAddress,
              oninput: U.debounce((e) => set('storeAddress', e.target.value), 400),
            })),
            ui.field('اسم الموظف الحالي', h('input', {
              class: 'input', value: st.staffName,
              oninput: U.debounce((e) => set('staffName', e.target.value), 400),
            }), { hint: 'يظهر في سجل كل عملية.' }),
          ),
        ),

        /* المطابقة */
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('div', { class: 'section-title' }, 'محرّك المطابقة'), icon('sparkle', 18)),
          h('div', { class: 'card-body col gap-3' },
            ui.field('حد المطابقة الأدنى (%)', h('input', {
              class: 'input num', type: 'number', min: '30', max: '100', step: '5', value: st.matchThreshold,
              oninput: U.debounce((e) => set('matchThreshold', U.clamp(e.target.value, 30, 100)), 400),
            }), { hint: 'تطابق SKU وحده = 40 · تطابق تام = 100. الموصى به: 55' }),
            ui.field('صلاحية الطلب (بالأيام)', h('input', {
              class: 'input num', type: 'number', min: '1', max: '365', value: st.preorderValidityDays,
              oninput: U.debounce((e) => set('preorderValidityDays', U.clamp(e.target.value, 1, 365)), 400),
            }), { hint: 'بعدها ينتقل الطلب تلقائيًا إلى «منتهية».' }),
            toggleRow('نقل الطلب تلقائيًا إلى «وصلت»',
              'عند مطابقة بضاعة داخلة مع طلب مفتوح.', 'autoAdvanceOnMatch'),
          ),
        ),
      ),

      /* البيانات */
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', { class: 'section-title' }, 'البيانات'), icon('box', 18)),
        h('div', { class: 'card-body col gap-3' },
          ui.banner('كل البيانات محفوظة محليًا في هذا المتصفح (localStorage). صدّرها قبل تفريغ ذاكرة المتصفح.', 'info', 'info'),
          h('div', { class: 'row gap-2 wrap' },
            h('button', {
              class: 'btn',
              onclick: () => {
                U.downloadText(`soufyan-erp-backup-${U.dateInput(U.nowISO())}.json`, store.exportJSON(), 'application/json');
                ui.toast({ title: 'تم تصدير نسخة احتياطية', tone: 'ok' });
              },
            }, icon('download', 16), 'تصدير نسخة احتياطية'),

            h('label', { class: 'btn' }, icon('undo', 16), 'استيراد نسخة',
              h('input', {
                type: 'file', accept: 'application/json', class: 'sr-only',
                onchange: (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      store.importJSON(reader.result);
                      ui.toast({ title: 'تم الاستيراد', tone: 'ok' });
                      ERP.app.rerender();
                    } catch (err) {
                      ui.toast({ title: 'ملف غير صالح', body: err.message, tone: 'err' });
                    }
                  };
                  reader.readAsText(file);
                },
              })),

            h('button', {
              class: 'btn',
              onclick: async () => {
                const ok = await ui.confirm({
                  title: 'إعادة البيانات التجريبية؟',
                  body: 'ستُستبدل كل البيانات الحالية بالبيانات التجريبية الأصلية.',
                  confirmLabel: 'إعادة التحميل',
                });
                if (ok) { store.resetToSeed(); ui.toast({ title: 'أُعيدت البيانات التجريبية', tone: 'ok' }); }
              },
            }, icon('refresh', 16), 'إعادة البيانات التجريبية'),

            h('button', {
              class: 'btn btn-danger',
              onclick: async () => {
                const ok = await ui.confirm({
                  title: 'تفريغ كل الطلبات والمبيعات؟',
                  body: 'سيُحذف كل شيء ما عدا الكتالوج والعملاء والقوالب. لا يمكن التراجع.',
                  confirmLabel: 'تفريغ', tone: 'danger',
                });
                if (ok) { store.wipe(); ui.toast({ title: 'تم التفريغ', tone: 'warn' }); }
              },
            }, icon('trash', 16), 'بدء من الصفر'),
          ),
          h('div', { class: 'divider' }),
          h('dl', { class: 'kv' },
            h('dt', null, 'الطلبات المسبقة'), h('dd', { class: 'num' }, store.preOrders().length),
            h('dt', null, 'قطع المخزون'), h('dd', { class: 'num' }, store.stockItems().length),
            h('dt', null, 'العملاء'), h('dd', { class: 'num' }, store.customers().length),
            h('dt', null, 'الفواتير'), h('dd', { class: 'num' }, store.sales().length),
            h('dt', null, 'الأحداث المسجّلة'), h('dd', { class: 'num' }, store.state.events.length),
          ),
        ),
      ),
    );
  }

  ERP.views.settings = { render };
})(window);
