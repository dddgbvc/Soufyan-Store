/* ============================================================
   ui/views/inventory.js — استلام البضاعة + المطابقة التلقائية
   نقطة الدخول التي تشغّل محرّك مطابقة الطلبات المسبقة.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, dom, icon, ui, util: U, store, inventory, matching } = ERP;
  ERP.views = ERP.views || {};

  const is = {
    productId: null,
    variantId: null,
    quantity: 1,
    serials: [],
    supplier: '',
    cost: '',
    lastResult: null,
  };

  function product() { return is.productId ? store.product(is.productId) : null; }
  function variant() { return is.variantId ? store.variant(is.variantId) : null; }

  /* ---------------- نموذج الاستلام ---------------- */
  function intakeCard() {
    const p = product();
    const v = variant();

    const productPicker = p
      ? h('div', { class: 'mini-card row gap-3' },
          h('div', { class: 'avatar' }, icon('phone', 16)),
          h('div', { class: 'cell-stack grow' },
            h('span', { class: 'fw-6' }, p.name),
            h('span', { class: 'cell-sub' }, `${p.brand} · ${p.model}`),
          ),
          h('button', {
            class: 'btn btn-sm btn-quiet',
            onclick: () => { is.productId = null; is.variantId = null; is.serials = []; ERP.app.rerender(); },
          }, 'تغيير'),
        )
      : ui.combobox({
          placeholder: 'ابحث عن المنتج الداخل…',
          search: (q) => store.products().filter((x) => U.matchQuery(q, x.name, x.brand, x.model)).slice(0, 8),
          renderItem: (x) => h('div', { class: 'cell-stack grow' },
            h('span', { class: 'fw-6 fs-13' }, x.name),
            h('span', { class: 'cell-sub' }, `${x.brand} · ${x.model}`),
          ),
          onSelect: (x) => {
            is.productId = x.id;
            is.variantId = x.variants.length === 1 ? x.variants[0].id : null;
            is.serials = [];
            ERP.app.rerender();
          },
        }).el;

    const variantGrid = p ? h('div', { class: 'pick-grid' },
      ...p.variants.map((vr) => {
        const demand = store.preOrders()
          .filter((o) => o.variantId === vr.id && ERP.preorder.META[o.status].matchable)
          .reduce((a, o) => a + o.quantity, 0);
        return h('button', {
          type: 'button', class: 'pick', 'aria-pressed': String(is.variantId === vr.id),
          onclick: () => { is.variantId = vr.id; is.serials = []; ERP.app.rerender(); },
        },
          h('span', { class: 'pick-t' }, [vr.storage !== '—' ? vr.storage : null, vr.color].filter(Boolean).join(' · ')),
          h('span', { class: 'pick-s num' }, vr.sku),
          demand ? h('span', { class: 'pick-s', style: { color: 'var(--st-arrived)' } }, `مطلوب مسبقًا: ${demand}`) : null,
        );
      }),
    ) : null;

    /* أرقام IMEI */
    let serialsBlock = null;
    if (p && v && p.tracksSerial) {
      const list = h('div', { class: 'serial-list' });
      for (let i = 0; i < is.quantity; i++) {
        list.appendChild(h('div', { class: 'serial-row' },
          h('span', { class: 'idx' }, i + 1),
          h('input', {
            class: 'input num', placeholder: 'IMEI / Serial (اختياري)',
            value: is.serials[i] || '', inputmode: 'numeric',
            oninput: (e) => { is.serials[i] = e.target.value.trim(); },
          }),
        ));
      }
      serialsBlock = h('div', { class: 'col gap-2' },
        h('div', { class: 'row-between' },
          h('span', { class: 'label' }, 'أرقام IMEI / Serial'),
          h('span', { class: 'fs-11 t-3' }, 'اتركها فارغة إن لم تكن جاهزة'),
        ),
        list,
      );
    }

    const receiveBtn = h('button', {
      class: 'btn btn-primary btn-lg', disabled: !v,
      onclick: doReceive,
    }, icon('box', 17), 'استلام وتشغيل المطابقة');

    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', null,
          h('div', { class: 'section-title' }, 'استلام بضاعة'),
          h('div', { class: 'fs-12 t-3' }, 'عند الاستلام يبحث النظام تلقائيًا عن الطلبات المسبقة المطابقة.'),
        ),
        icon('truck', 20),
      ),
      h('div', { class: 'card-body col gap-4' },
        ui.field('المنتج', productPicker, { required: true }),
        p ? ui.field('الـ Variant', variantGrid, { required: true }) : null,
        h('div', { class: 'grid grid-3' },
          ui.field('الكمية', ui.stepper(is.quantity, (n) => {
            is.quantity = n;
            is.serials.length = n;
            if (product() && product().tracksSerial) ERP.app.rerender();
          }, { min: 1, max: 200 })),
          ui.field('المورد', h('input', {
            class: 'input', placeholder: 'اسم المورد', value: is.supplier,
            oninput: (e) => { is.supplier = e.target.value; },
          })),
          ui.field('كلفة القطعة', h('input', {
            class: 'input num', type: 'number', min: '0', step: '1000', value: is.cost,
            placeholder: v ? String(v.cost) : '—',
            oninput: (e) => { is.cost = e.target.value; },
          })),
        ),
        serialsBlock,
        h('div', { class: 'row gap-2' }, receiveBtn),
      ),
    );
  }

  function doReceive() {
    try {
      const res = inventory.receive({
        variantId: is.variantId,
        quantity: is.quantity,
        serials: is.serials.filter(Boolean),
        supplier: is.supplier,
        cost: is.cost,
      });
      is.lastResult = res;
      is.serials = [];
      // التنبيهات الخاصة بالمطابقة يعرضها مركز الإشعارات تلقائيًا
      if (!res.matches.length) {
        ui.toast({ title: 'تم الاستلام', body: `${res.items.length} قطعة أُضيفت للمخزون`, tone: 'ok' });
      }
      ERP.app.rerender();
    } catch (err) {
      ui.toast({ title: 'تعذّر الاستلام', body: err.message, tone: 'err' });
    }
  }

  /* ---------------- معاينة المطابقة ---------------- */
  function previewCard() {
    const v = variant();
    const matches = v ? matching.preview(v.id) : [];

    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'section-title' }, 'من ينتظر هذا المنتج؟'),
        h('span', { class: 'chip chip-plain num' }, matches.length),
      ),
      h('div', { class: 'card-body col gap-2' },
        !v
          ? h('div', { class: 'fs-13 t-3' }, 'اختر المنتج والـ Variant لعرض الطلبات المسبقة المطابقة قبل الاستلام.')
          : matches.length
            ? ERP.dom.frag(...matches.map((m) => {
                const c = store.customer(m.order.customerId);
                return h('button', {
                  class: 'match-card', style: { width: '100%', textAlign: 'start' },
                  onclick: () => ERP.views.detail.open(m.order.id),
                },
                  ui.avatar(c ? c.name : '؟', 'avatar-sm'),
                  h('div', { class: 'cell-stack grow' },
                    h('span', { class: 'fw-6 fs-13' }, c ? c.name : '—'),
                    h('span', { class: 'cell-sub' },
                      `${m.order.code} · الكمية ${m.order.quantity} · ${m.reasons.join('، ')}`),
                  ),
                  h('span', { class: 'score-pill' }, m.score + '%'),
                );
              }))
            : h('div', { class: 'fs-13 t-3' }, 'لا توجد طلبات مسبقة تنتظر هذا الـ Variant.'),
        v ? h('div', { class: 'divider mt-2' }) : null,
        v ? h('div', { class: 'row-between fs-12 t-2' },
          h('span', null, 'المتاح حاليًا في المخزون'),
          h('span', { class: 'num fw-7' }, inventory.countAvailable(v.id)),
        ) : null,
      ),
    );
  }

  /* ---------------- نتيجة آخر استلام ---------------- */
  function resultCard() {
    if (!is.lastResult || !is.lastResult.matches.length) return null;
    return h('div', { class: 'match-alert' },
      h('div', { class: 'ma-ic' }, icon('sparkle', 22)),
      h('div', { class: 'grow' },
        h('div', { class: 'ma-title' }, 'وصل منتج مطلوب مسبقًا'),
        h('div', { class: 'ma-body' },
          is.lastResult.matches.map((m) =>
            `${m.customerName} · ${m.productName} · الكمية ${m.matchedQuantity}`).join(' — ')),
      ),
      h('div', { class: 'row gap-2' },
        h('button', {
          class: 'btn btn-wa',
          onclick: () => ERP.actions.openMessage(is.lastResult.matches[0].preOrderId),
        }, icon('whatsapp', 16), 'إشعار العميل'),
        h('button', {
          class: 'btn',
          onclick: () => ERP.actions.openReserve(is.lastResult.matches[0].preOrderId),
        }, icon('reserve', 16), 'حجز'),
      ),
    );
  }

  /* ---------------- ملخص المخزون ---------------- */
  function summaryPanel() {
    const rows = inventory.summary().filter((r) => r.available || r.reserved || r.demand);
    return h('div', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('div', { class: 'section-title grow' }, 'حالة المخزون مقابل الطلبات'),
      ),
      ui.smartTable({
        columns: [
          { key: 'p', label: 'المنتج', primary: true, cell: (r) => h('div', { class: 'cell-stack' },
            h('span', { class: 'cell-main' }, r.product.name),
            h('span', { class: 'cell-sub' }, r.product.brand + ' · ' + r.product.model)) },
          { key: 'v', label: 'Variant', cell: (r) => h('div', { class: 'row gap-1 wrap' },
            r.variant.storage !== '—' ? ui.attrChip(r.variant.storage) : null,
            ui.attrChip(r.variant.color, r.variant.colorHex)) },
          { key: 'sku', label: 'SKU', cell: (r) => h('span', { class: 'num fs-12 t-2' }, r.variant.sku) },
          { key: 'av', label: 'متاح', cell: (r) => h('span', { class: 'num fw-7' }, r.available) },
          { key: 'rs', label: 'محجوز', cell: (r) => h('span', { class: 'num' }, r.reserved) },
          { key: 'dm', label: 'مطلوب مسبقًا', cell: (r) => h('span', {
            class: 'num fw-6',
            style: r.demand > r.available ? { color: 'var(--st-arrived)' } : null,
          }, r.demand) },
          { key: 'act', label: '', class: 'col-actions', cell: (r) => h('div', { class: 'actions' },
            h('button', {
              class: 'btn btn-sm on-hover',
              onclick: () => {
                is.productId = r.product.id; is.variantId = r.variant.id; is.serials = [];
                ERP.app.rerender();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              },
            }, icon('plus', 14), 'استلام')) },
        ],
        rows,
        empty: ui.emptyState({ title: 'المخزون فارغ', body: 'سجّل أول استلام بضاعة من الأعلى.', icon: 'box' }),
      }),
    );
  }

  function render() {
    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', { class: 'page-title' }, 'المخزون والاستلام'),
          h('p', { class: 'page-sub' }, 'كل قطعة داخلة تُفحص تلقائيًا مقابل الطلبات المسبقة.'),
        ),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn', onclick: () => ERP.app.go('preorders') },
            icon('preorder', 16), 'لوحة الطلبات'),
        ),
      ),
      resultCard(),
      h('div', { class: 'intake-grid' },
        intakeCard(),
        previewCard(),
      ),
      summaryPanel(),
    );
  }

  ERP.views.inventory = { render };
})(window);
