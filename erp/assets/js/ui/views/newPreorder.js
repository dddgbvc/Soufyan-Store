/* ============================================================
   ui/views/newPreorder.js — إنشاء طلب مسبق
   New Pre-Order → Customer → Product → Variant → Quantity → Notes → Confirm
   خطوات قصيرة في نافذة واحدة، بدون صفحات متعددة.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, dom, icon, ui, util: U, store } = ERP;
  ERP.views = ERP.views || {};

  function open(prefill = {}) {
    const st = {
      customer: prefill.customerId ? store.customer(prefill.customerId) : null,
      product: null,
      variant: null,
      quantity: 1,
      notes: '',
      expectedAt: '',
      priority: 'NORMAL',
      deposit: 0,
      creatingCustomer: false,
    };

    const body = h('div', { class: 'flow' });
    const submitBtn = h('button', { class: 'btn btn-primary', disabled: true },
      icon('check', 16), 'تأكيد الطلب');

    /* ---------------- 1. العميل ---------------- */
    function customerStep() {
      const done = !!st.customer;
      const stepEl = h('div', {
        class: 'flow-step', dataset: { done: String(done), active: String(!done) },
      },
        h('div', { class: 'flow-head' },
          h('span', { class: 'flow-num' }, done ? icon('check', 11) : '1'),
          h('span', { class: 'flow-t' }, 'العميل'),
          done ? h('button', {
            class: 'btn btn-sm btn-quiet',
            style: { marginInlineStart: 'auto' },
            onclick: () => { st.customer = null; paint(); },
          }, 'تغيير') : null,
        ),
      );

      if (done) {
        stepEl.appendChild(h('div', { class: 'mini-card row gap-3' },
          ui.avatar(st.customer.name),
          h('div', { class: 'cell-stack grow' },
            h('span', { class: 'fw-6' }, st.customer.name),
            h('span', { class: 'cell-sub num' }, st.customer.phone),
          ),
          openOrdersBadge(st.customer.id),
        ));
        return stepEl;
      }

      if (st.creatingCustomer) {
        const nameI = h('input', { class: 'input', placeholder: 'اسم العميل', value: prefill.name || '', autofocus: true });
        const phoneI = h('input', { class: 'input num', placeholder: '07XXXXXXXXX', inputmode: 'tel' });
        const errEl = h('div', { class: 'err-text' });
        stepEl.appendChild(h('div', { class: 'col gap-3' },
          h('div', { class: 'grid grid-2' },
            ui.field('الاسم', nameI, { required: true }),
            ui.field('رقم الهاتف', phoneI, { required: true }),
          ),
          errEl,
          h('div', { class: 'row gap-2' },
            h('button', {
              class: 'btn btn-primary btn-sm',
              onclick: () => {
                try {
                  st.customer = ERP.customers.create({ name: nameI.value, phone: phoneI.value });
                  st.creatingCustomer = false;
                  ui.toast({ title: 'أُضيف العميل', body: st.customer.name, tone: 'ok', timeout: 2200 });
                  paint();
                } catch (err) { errEl.textContent = err.message; }
              },
            }, icon('check', 14), 'حفظ العميل'),
            h('button', {
              class: 'btn btn-quiet btn-sm',
              onclick: () => { st.creatingCustomer = false; paint(); },
            }, 'رجوع'),
          ),
        ));
        return stepEl;
      }

      const combo = ui.combobox({
        placeholder: 'ابحث بالاسم أو رقم الهاتف…',
        search: (q) => ERP.customers.search(q, 7),
        renderItem: (c) => h('div', { class: 'row gap-3 grow' },
          ui.avatar(c.name, 'avatar-sm'),
          h('div', { class: 'cell-stack grow' },
            h('span', { class: 'fw-6 fs-13' }, c.name),
            h('span', { class: 'cell-sub num' }, c.phone),
          ),
        ),
        onSelect: (c) => { st.customer = c; paint(); },
        onCreate: () => { st.creatingCustomer = true; paint(); },
        createLabel: 'عميل جديد',
        emptyText: 'لا يوجد عميل بهذا الاسم',
      });
      stepEl.appendChild(combo.el);
      stepEl._focus = () => combo.input.focus();
      return stepEl;
    }

    function openOrdersBadge(customerId) {
      const n = ERP.preorder.byCustomer(customerId).filter((o) => ERP.preorder.META[o.status].open).length;
      if (!n) return null;
      return h('span', { class: 'chip chip-plain', title: 'طلبات مفتوحة لهذا العميل' }, icon('preorder', 12), U.fmtNum(n));
    }

    /* ---------------- 2. المنتج ---------------- */
    function productStep() {
      const locked = !st.customer;
      const done = !!st.product;
      const stepEl = h('div', {
        class: 'flow-step',
        dataset: { locked: String(locked), done: String(done), active: String(!locked && !done) },
      },
        h('div', { class: 'flow-head' },
          h('span', { class: 'flow-num' }, done ? icon('check', 11) : '2'),
          h('span', { class: 'flow-t' }, 'المنتج'),
          done ? h('button', {
            class: 'btn btn-sm btn-quiet', style: { marginInlineStart: 'auto' },
            onclick: () => { st.product = null; st.variant = null; paint(); },
          }, 'تغيير') : null,
        ),
      );

      if (done) {
        stepEl.appendChild(h('div', { class: 'mini-card row gap-3' },
          h('div', { class: 'avatar' }, icon('phone', 16)),
          h('div', { class: 'cell-stack grow' },
            h('span', { class: 'fw-6' }, st.product.name),
            h('span', { class: 'cell-sub' }, `${st.product.brand} · ${st.product.model}`),
          ),
          st.product.tracksSerial ? h('span', { class: 'chip chip-plain' }, icon('lock', 12), 'IMEI') : null,
        ));
        return stepEl;
      }

      const combo = ui.combobox({
        placeholder: 'ابحث باسم المنتج أو الموديل أو SKU…',
        search: (q) => store.products()
          .filter((p) => U.matchQuery(q, p.name, p.brand, p.model, p.variants.map((v) => v.sku).join(' ')))
          .slice(0, 8),
        renderItem: (p) => h('div', { class: 'row gap-3 grow' },
          h('div', { class: 'cell-stack grow' },
            h('span', { class: 'fw-6 fs-13' }, p.name),
            h('span', { class: 'cell-sub' }, `${p.brand} · ${p.model} · ${p.variants.length} خيار`),
          ),
        ),
        onSelect: (p) => {
          st.product = p;
          if (p.variants.length === 1) st.variant = p.variants[0];
          paint();
        },
        emptyText: 'لا يوجد منتج مطابق',
      });
      stepEl.appendChild(combo.el);
      stepEl._focus = () => combo.input.focus();
      return stepEl;
    }

    /* ---------------- 3. الـ Variant ---------------- */
    function variantStep() {
      const locked = !st.product;
      const done = !!st.variant;
      const stepEl = h('div', {
        class: 'flow-step',
        dataset: { locked: String(locked), done: String(done), active: String(!locked && !done) },
      },
        h('div', { class: 'flow-head' },
          h('span', { class: 'flow-num' }, done ? icon('check', 11) : '3'),
          h('span', { class: 'flow-t' }, 'المواصفات — Variant'),
          done ? h('span', { class: 'flow-v' }, variantText(st.variant)) : null,
        ),
      );
      if (locked) return stepEl;

      const grid = h('div', { class: 'pick-grid' });
      st.product.variants.forEach((v) => {
        const avail = ERP.inventory.countAvailable(v.id);
        grid.appendChild(h('button', {
          type: 'button', class: 'pick', 'aria-pressed': String(st.variant && st.variant.id === v.id),
          onclick: () => { st.variant = v; paint(); },
        },
          h('span', { class: 'pick-t row gap-2' },
            v.colorHex ? h('i', { class: 'swatch', style: { background: v.colorHex, width: '10px', height: '10px', borderRadius: '3px', display: 'inline-block' } }) : null,
            variantText(v)),
          h('span', { class: 'pick-s num' }, U.fmtMoney(v.price)),
          h('span', { class: 'pick-s' },
            avail > 0 ? `متوفر الآن: ${avail}` : 'غير متوفر'),
        ));
      });
      stepEl.appendChild(grid);
      return stepEl;
    }

    function variantText(v) {
      return [v.storage && v.storage !== '—' ? v.storage : null, v.color].filter(Boolean).join(' · ');
    }

    /* ---------------- 4. الكمية والتفاصيل ---------------- */
    function detailsStep() {
      const locked = !st.variant;
      const stepEl = h('div', {
        class: 'flow-step',
        dataset: { locked: String(locked), active: String(!locked) },
      },
        h('div', { class: 'flow-head' },
          h('span', { class: 'flow-num' }, '4'),
          h('span', { class: 'flow-t' }, 'الكمية والتفاصيل'),
        ),
      );
      if (locked) return stepEl;

      const prioWrap = h('div');
      function paintPrio() {
        dom.mount(prioWrap, ui.segmented(
          Object.keys(ERP.preorder.PRIORITY).map((k) => ({ value: k, label: ERP.preorder.PRIORITY[k].label })),
          st.priority, (v) => { st.priority = v; paintPrio(); },
        ));
      }
      paintPrio();

      stepEl.appendChild(h('div', { class: 'col gap-3' },
        h('div', { class: 'grid grid-3' },
          ui.field('الكمية', ui.stepper(st.quantity, (v) => { st.quantity = v; updateSummary(); })),
          ui.field('الموعد المتوقع', h('input', {
            class: 'input', type: 'date', value: st.expectedAt,
            oninput: (e) => { st.expectedAt = e.target.value; },
          }), { hint: 'اختياري' }),
          ui.field('العربون', h('input', {
            class: 'input num', type: 'number', min: '0', step: '5000', value: st.deposit,
            oninput: (e) => { st.deposit = Number(e.target.value) || 0; },
          }), { hint: 'اختياري' }),
        ),
        ui.field('الأولوية', prioWrap),
        ui.field('ملاحظات', h('textarea', {
          class: 'textarea', placeholder: 'أي تفاصيل يذكرها العميل…', rows: '2',
          oninput: (e) => { st.notes = e.target.value; },
        }, st.notes), { hint: 'اختياري' }),
      ));
      return stepEl;
    }

    /* ---------------- الملخص ---------------- */
    const summaryEl = h('div', { class: 'summary-bar' });
    function updateSummary() {
      dom.clear(summaryEl);
      if (!st.variant) {
        summaryEl.appendChild(h('span', { class: 't-3' }, 'أكمل الخطوات لعرض الملخص.'));
        submitBtn.disabled = true;
        return;
      }
      const avail = ERP.inventory.countAvailable(st.variant.id);
      const total = st.variant.price * st.quantity;
      summaryEl.append(
        h('span', { class: 'row gap-2' }, icon('user', 14), h('strong', null, st.customer.name)),
        h('span', { class: 't-3' }, '·'),
        h('span', { class: 'row gap-2' }, icon('phone', 14), st.product.name + ' — ' + variantText(st.variant)),
        h('span', { class: 't-3' }, '·'),
        h('span', { class: 'row gap-2 num' }, '×' + st.quantity),
        h('span', { class: 'grow' }),
        h('span', { class: 'num fw-7' }, U.fmtMoney(total)),
      );
      if (avail >= st.quantity) {
        summaryEl.appendChild(h('div', { style: { flexBasis: '100%' } },
          ui.banner(`المنتج متوفر حاليًا في المخزون (${avail}) — سينتقل الطلب مباشرة إلى «وصلت».`, 'ok', 'sparkle')));
      }
      submitBtn.disabled = false;
    }

    /* ---------------- الرسم ---------------- */
    function paint() {
      dom.clear(body);
      const steps = [customerStep(), productStep(), variantStep(), detailsStep()];
      steps.forEach((s) => body.appendChild(s));
      body.appendChild(summaryEl);
      updateSummary();
      const active = steps.find((s) => s.dataset.active === 'true' && s._focus);
      if (active) setTimeout(() => active._focus(), 40);
    }

    const m = ui.modal({
      title: 'طلب مسبق جديد',
      sub: 'سجّل ما يطلبه العميل وغير متوفر الآن — النظام سينبّهك فور وصوله.',
      size: 'modal-lg',
      body,
      foot: h('div', { class: 'row-between grow' },
        h('span', { class: 'fs-11 t-3' }, 'Esc للإلغاء'),
        h('div', { class: 'row gap-2' },
          h('button', { class: 'btn btn-quiet', onclick: () => m.close() }, 'إلغاء'),
          submitBtn,
        ),
      ),
    });

    submitBtn.addEventListener('click', () => {
      try {
        const order = ERP.preorder.create({
          customerId: st.customer.id,
          variantId: st.variant.id,
          quantity: st.quantity,
          notes: st.notes,
          priority: st.priority,
          depositAmount: st.deposit,
          expectedAt: st.expectedAt ? new Date(st.expectedAt).toISOString() : null,
        });
        m.close();
        const fresh = ERP.preorder.get(order.id);
        ui.toast({
          title: 'أُنشئ الطلب ' + order.code,
          body: fresh.status === 'ARRIVED'
            ? 'المنتج متوفر في المخزون — جاهز لإشعار العميل.'
            : `${st.customer.name} · ${st.product.name}`,
          tone: fresh.status === 'ARRIVED' ? 'match' : 'ok',
          action: { label: 'عرض الطلب', run: () => ERP.views.detail.open(order.id) },
        });
      } catch (err) {
        ui.toast({ title: 'تعذّر إنشاء الطلب', body: err.message, tone: 'err' });
      }
    });

    paint();
    return m;
  }

  ERP.views.newPreorder = { open };
})(window);
