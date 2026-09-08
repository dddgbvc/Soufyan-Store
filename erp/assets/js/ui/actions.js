/* ============================================================
   ui/actions.js — الإجراءات السياقية (Contextual Actions)
   مصدر واحد للإجراءات يستخدمه الجدول ولوحة التفاصيل معًا.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, icon, ui, util: U, store, preorder, inventory } = ERP;
  const S = preorder.STATUS;

  function fail(err) {
    ui.toast({ title: 'تعذّر تنفيذ العملية', body: err.message || String(err), tone: 'err' });
  }

  const actions = {
    /* ---------------- الإجراء الأساسي حسب الحالة ---------------- */
    primary(order) {
      switch (order.status) {
        case S.PENDING:
          return { label: 'بانتظار الوصول', icon: 'truck', run: () => actions.confirmWaiting(order.id) };
        case S.WAITING_ARRIVAL:
          return { label: 'تسجيل الوصول', icon: 'inbox', run: () => actions.markArrived(order.id) };
        case S.ARRIVED:
          return { label: 'إشعار العميل', icon: 'whatsapp', tone: 'wa', run: () => actions.openMessage(order.id) };
        case S.CUSTOMER_NOTIFIED:
          return { label: 'حجز للعميل', icon: 'reserve', run: () => actions.openReserve(order.id) };
        case S.RESERVED:
          return { label: 'إتمام البيع', icon: 'receipt', tone: 'primary', run: () => actions.openSell(order.id) };
        case S.SOLD:
          return { label: 'الفاتورة', icon: 'receipt', run: () => actions.viewSale(order.id) };
        case S.CANCELLED:
        case S.EXPIRED:
          return { label: 'إعادة فتح', icon: 'undo', run: () => actions.reopen(order.id) };
        default:
          return null;
      }
    },

    /* ---------------- قائمة الإجراءات الكاملة ---------------- */
    menuItems(order) {
      const open = preorder.META[order.status].open;
      return [
        { label: 'عرض التفاصيل', icon: 'eye', run: () => ERP.views.detail.open(order.id) },
        { label: 'إرسال رسالة', icon: 'whatsapp', hidden: !open, run: () => actions.openMessage(order.id) },
        { label: 'حجز للعميل', icon: 'reserve', hidden: !(order.status === S.ARRIVED || order.status === S.CUSTOMER_NOTIFIED), run: () => actions.openReserve(order.id) },
        { label: 'فك الحجز', icon: 'undo', hidden: order.status !== S.RESERVED, run: () => actions.release(order.id) },
        { label: 'إتمام البيع', icon: 'receipt', hidden: order.status !== S.RESERVED, run: () => actions.openSell(order.id) },
        '-',
        { label: 'تعديل الطلب', icon: 'edit', hidden: !open, run: () => actions.openEdit(order.id) },
        { label: 'نسخ رقم الطلب', icon: 'link', run: () => ui.copy(order.code) },
        '-',
        { label: 'إلغاء الطلب', icon: 'x', tone: 'danger', hidden: !open, run: () => actions.cancel(order.id) },
        { label: 'حذف نهائيًا', icon: 'trash', tone: 'danger', run: () => actions.remove(order.id) },
      ];
    },

    /* ---------------- انتقالات سريعة ---------------- */
    confirmWaiting(id) {
      try {
        const o = preorder.confirmWaiting(id);
        ui.toast({ title: 'الطلب بانتظار الوصول', body: o.code, tone: 'ok' });
      } catch (err) { fail(err); }
    },

    markArrived(id) {
      try {
        const o = preorder.markArrived(id, { note: 'تسجيل وصول يدوي' });
        ui.toast({
          title: 'تم تسجيل الوصول', body: o.code + ' — يمكنك إشعار العميل الآن', tone: 'ok',
          action: { label: 'إشعار العميل', run: () => actions.openMessage(id) },
        });
      } catch (err) { fail(err); }
    },

    reopen(id) {
      try {
        preorder.reopen(id);
        ui.toast({ title: 'أُعيد فتح الطلب', tone: 'ok' });
      } catch (err) { fail(err); }
    },

    async cancel(id) {
      const order = preorder.get(id);
      const ok = await ui.confirm({
        title: 'إلغاء الطلب؟',
        body: `سيُلغى الطلب ${order.code}` + (order.stockItemIds.length ? ' وسيُفك حجز البضاعة المرتبطة به.' : '.'),
        confirmLabel: 'نعم، ألغِ الطلب', tone: 'danger',
      });
      if (!ok) return;
      try {
        preorder.cancel(id, 'أُلغي من الواجهة');
        ui.toast({ title: 'أُلغي الطلب', body: order.code, tone: 'warn' });
      } catch (err) { fail(err); }
    },

    async remove(id) {
      const order = preorder.get(id);
      const ok = await ui.confirm({
        title: 'حذف الطلب نهائيًا؟',
        body: `سيُحذف ${order.code} من السجل. لا يمكن التراجع.`,
        confirmLabel: 'حذف', tone: 'danger',
      });
      if (!ok) return;
      try {
        preorder.remove(id);
        ui.toast({ title: 'حُذف الطلب', tone: 'warn' });
      } catch (err) { fail(err); }
    },

    async release(id) {
      const ok = await ui.confirm({
        title: 'فك الحجز؟',
        body: 'ستعود القطع إلى المخزون المتاح، وسيرجع الطلب إلى حالة «تم إشعار العميل».',
        confirmLabel: 'فك الحجز',
      });
      if (!ok) return;
      try {
        preorder.release(id, 'فك حجز يدوي');
        preorder.transition(id, S.CUSTOMER_NOTIFIED, { note: 'فُكّ الحجز' });
        ui.toast({ title: 'فُكّ الحجز', tone: 'warn' });
      } catch (err) { fail(err); }
    },

    /* ---------------- الحجز ---------------- */
    openReserve(id) {
      const order = preorder.get(id);
      if (!order) return;
      const product = store.product(order.productId);
      const items = inventory.reservableFor(order);
      const selected = new Set((order.suggestedStockItemIds || []).filter((sid) =>
        items.some((it) => it.id === sid)).slice(0, order.quantity));

      if (!items.length) {
        ui.toast({
          title: 'لا توجد قطع متاحة', tone: 'warn',
          body: 'سجّل استلام البضاعة أولًا من شاشة المخزون.',
          action: { label: 'فتح المخزون', run: () => ERP.app.go('inventory') },
        });
        return;
      }

      const counter = h('span', { class: 'num fw-7' });
      const confirmBtn = h('button', { class: 'btn btn-primary' }, icon('reserve', 16), 'تأكيد الحجز');
      const list = h('div', { class: 'col gap-2' });

      function paint() {
        counter.textContent = `${selected.size} / ${order.quantity}`;
        confirmBtn.disabled = selected.size !== order.quantity;
        ERP.dom.qsa('.stock-row', list).forEach((row) => {
          row.setAttribute('aria-pressed', String(selected.has(row.dataset.id)));
        });
      }

      items.forEach((it, i) => {
        const row = h('button', {
          type: 'button', class: 'stock-row', dataset: { id: it.id }, 'aria-pressed': 'false',
          onclick: () => {
            if (selected.has(it.id)) selected.delete(it.id);
            else {
              if (selected.size >= order.quantity) {
                ui.toast({ title: `الكمية المطلوبة ${order.quantity} فقط`, tone: 'warn', timeout: 2200 });
                return;
              }
              selected.add(it.id);
            }
            paint();
          },
        },
          h('span', { class: 'box' }, icon('check', 12)),
          h('div', { class: 'cell-stack grow', style: { textAlign: 'start' } },
            h('span', { class: 'fw-6 fs-13' },
              product.tracksSerial && it.serial ? 'IMEI: ' + it.serial : `قطعة رقم ${i + 1}`),
            h('span', { class: 'cell-sub' },
              `${it.sku} · استُلمت ${U.fmtDateShort(it.receivedAt)} · ${it.supplier}`),
          ),
          it.preOrderId === order.id ? h('span', { class: 'chip chip-plain' }, 'مقترحة') : null,
        );
        list.appendChild(row);
      });

      const m = ui.modal({
        title: 'حجز للعميل',
        sub: `${order.code} · ${store.customer(order.customerId).name} · ${order.target.productName}`,
        body: h('div', { class: 'col gap-4' },
          product.tracksSerial
            ? ui.banner('هذا الجهاز يعتمد IMEI/Serial — اختر الجهاز الفعلي الذي سيُسلَّم للعميل.', 'info', 'lock')
            : ui.banner('اختر القطع التي ستُحجز باسم العميل.', 'info', 'info'),
          h('div', { class: 'row-between' },
            h('span', { class: 'label' }, 'القطع المتاحة'),
            h('span', { class: 'fs-12 t-2' }, 'المحدد: ', counter),
          ),
          list,
        ),
        foot: h('div', { class: 'row-between grow' },
          h('button', { class: 'btn btn-quiet', onclick: () => m.close() }, 'إلغاء'),
          confirmBtn,
        ),
      });

      confirmBtn.addEventListener('click', () => {
        try {
          preorder.reserve(id, Array.from(selected));
          m.close();
          ui.toast({
            title: 'تم الحجز باسم العميل', tone: 'ok',
            body: `${order.code} — جاهز للبيع`,
            action: { label: 'إتمام البيع', run: () => actions.openSell(id) },
          });
        } catch (err) { fail(err); }
      });
      paint();
    },

    /* ---------------- البيع ---------------- */
    openSell(id) {
      const order = preorder.get(id);
      if (!order) return;
      const customer = store.customer(order.customerId);
      let discount = 0;
      let payment = 'CASH';
      let unitPrice = order.unitPrice || 0;

      const totalEl = h('div', { class: 'fs-18 fw-7 num' });
      const dueEl = h('div', { class: 'fs-12 t-2' });

      function recalc() {
        const subtotal = unitPrice * order.quantity;
        const total = Math.max(0, subtotal - discount);
        totalEl.textContent = U.fmtMoney(total);
        dueEl.textContent = order.depositAmount
          ? `بعد خصم العربون ${U.fmtMoney(order.depositAmount)}: ${U.fmtMoney(Math.max(0, total - order.depositAmount))}`
          : '';
      }

      const priceInput = h('input', {
        class: 'input num', type: 'number', min: '0', step: '1000', value: unitPrice,
        oninput: (e) => { unitPrice = Number(e.target.value) || 0; recalc(); },
      });
      const discountInput = h('input', {
        class: 'input num', type: 'number', min: '0', step: '1000', value: '0',
        oninput: (e) => { discount = Number(e.target.value) || 0; recalc(); },
      });
      const payWrap = h('div');
      function paintPay() {
        ERP.dom.mount(payWrap, ui.segmented(
          Object.keys(ERP.sales.PAYMENT).map((k) => ({ value: k, label: ERP.sales.PAYMENT[k] })),
          payment, (v) => { payment = v; paintPay(); },
        ));
      }
      paintPay();

      const serials = order.stockItemIds.map((sid) => store.stockItem(sid)).filter(Boolean);

      const m = ui.modal({
        title: 'إتمام البيع',
        sub: `${order.code} · ${customer.name}`,
        body: h('div', { class: 'col gap-4' },
          h('div', { class: 'mini-card row gap-3' },
            ui.avatar(customer.name),
            h('div', { class: 'cell-stack grow' },
              h('span', { class: 'fw-6' }, order.target.productName),
              h('span', { class: 'cell-sub' }, preorder.variantLabel(order) + ' · الكمية ' + order.quantity),
            ),
          ),
          serials.some((s) => s.serial)
            ? h('div', { class: 'col gap-2' },
                h('div', { class: 'd-section-title' }, 'الأجهزة المسلَّمة'),
                h('div', { class: 'row wrap gap-2' },
                  ...serials.filter((s) => s.serial).map((s) => h('span', { class: 'tag-serial' }, icon('phone', 12), s.serial))),
              )
            : null,
          h('div', { class: 'grid grid-2' },
            ui.field('سعر الوحدة', priceInput),
            ui.field('الخصم', discountInput),
          ),
          ui.field('طريقة الدفع', payWrap),
          h('div', { class: 'summary-bar row-between' },
            h('span', { class: 't-2' }, 'الإجمالي المطلوب'),
            h('div', { class: 'col', style: { alignItems: 'flex-end' } }, totalEl, dueEl),
          ),
        ),
        foot: h('div', { class: 'row-between grow' },
          h('button', { class: 'btn btn-quiet', onclick: () => m.close() }, 'إلغاء'),
          h('button', {
            class: 'btn btn-primary',
            onclick: () => {
              try {
                const sale = ERP.sales.createFromPreOrder(id, { discount, paymentMethod: payment, unitPrice });
                m.close();
                ui.toast({
                  title: 'تم البيع بنجاح', tone: 'ok',
                  body: `${sale.code} · ${U.fmtMoney(sale.total)}`,
                  action: { label: 'عرض المبيعات', run: () => ERP.app.go('sales') },
                });
              } catch (err) { fail(err); }
            },
          }, icon('check', 16), 'تأكيد البيع'),
        ),
      });
      recalc();
    },

    viewSale(id) {
      const order = preorder.get(id);
      const sale = order && order.saleId ? store.sale(order.saleId) : null;
      if (!sale) { ui.toast({ title: 'لا توجد فاتورة مرتبطة', tone: 'warn' }); return; }
      const customer = store.customer(sale.customerId);
      ui.modal({
        title: 'فاتورة ' + sale.code, size: 'modal-sm',
        sub: U.fmtDateTime(sale.createdAt),
        body: h('dl', { class: 'kv' },
          h('dt', null, 'العميل'), h('dd', null, customer ? customer.name : '—'),
          h('dt', null, 'الطلب المسبق'), h('dd', { class: 'num' }, sale.preOrderCode || order.code),
          h('dt', null, 'المنتج'), h('dd', null, order.target.productName),
          h('dt', null, 'الكمية'), h('dd', { class: 'num' }, sale.items.length),
          h('dt', null, 'قبل الخصم'), h('dd', { class: 'num' }, U.fmtMoney(sale.subtotal)),
          h('dt', null, 'الخصم'), h('dd', { class: 'num' }, U.fmtMoney(sale.discount)),
          h('dt', null, 'الإجمالي'), h('dd', { class: 'num fs-15' }, U.fmtMoney(sale.total)),
          h('dt', null, 'الدفع'), h('dd', null, ERP.sales.PAYMENT[sale.paymentMethod] || sale.paymentMethod),
        ),
      });
    },

    /* ---------------- تعديل ---------------- */
    openEdit(id) {
      const order = preorder.get(id);
      if (!order) return;
      let qty = order.quantity;
      const expected = h('input', { class: 'input', type: 'date', value: U.dateInput(order.expectedAt) });
      const notes = h('textarea', { class: 'textarea', placeholder: 'ملاحظات…' }, order.notes);
      const deposit = h('input', { class: 'input num', type: 'number', min: '0', step: '5000', value: order.depositAmount || 0 });
      let priority = order.priority;
      const prioWrap = h('div');
      function paintPrio() {
        ERP.dom.mount(prioWrap, ui.segmented(
          Object.keys(preorder.PRIORITY).map((k) => ({ value: k, label: preorder.PRIORITY[k].label })),
          priority, (v) => { priority = v; paintPrio(); },
        ));
      }
      paintPrio();

      const m = ui.modal({
        title: 'تعديل الطلب', sub: order.code,
        body: h('div', { class: 'col gap-4' },
          h('div', { class: 'grid grid-2' },
            ui.field('الكمية', ui.stepper(qty, (v) => { qty = v; })),
            ui.field('الموعد المتوقع', expected),
          ),
          h('div', { class: 'grid grid-2' },
            ui.field('الأولوية', prioWrap),
            ui.field('العربون', deposit),
          ),
          ui.field('ملاحظات', notes),
        ),
        foot: h('div', { class: 'row-between grow' },
          h('button', { class: 'btn btn-quiet', onclick: () => m.close() }, 'إلغاء'),
          h('button', {
            class: 'btn btn-primary',
            onclick: () => {
              preorder.update(id, {
                quantity: qty,
                expectedAt: expected.value ? new Date(expected.value).toISOString() : null,
                notes: notes.value,
                priority,
                depositAmount: Number(deposit.value) || 0,
              });
              m.close();
              ui.toast({ title: 'حُفظت التعديلات', tone: 'ok' });
            },
          }, 'حفظ'),
        ),
      });
    },

    /* ---------------- الرسائل (عبر مزوّد الاتصال) ---------------- */
    openMessage(id) {
      const order = preorder.get(id);
      if (!order) return;
      const customer = store.customer(order.customerId);
      const templates = ERP.templates.list();
      let templateId = store.settings().defaultTemplateId || templates[0].id;
      let providerId = store.settings().defaultProvider;

      const textarea = h('textarea', { class: 'textarea', style: { minHeight: '150px' }, spellcheck: 'false' });
      const missingEl = h('div', { class: 'fs-11' });

      function applyTemplate() {
        const tpl = ERP.templates.get(templateId);
        const vars = ERP.templates.varsFromPreOrder(order);
        const r = ERP.templates.render(tpl.body, vars);
        textarea.value = r.text;
        ERP.dom.clear(missingEl);
        if (r.missing.length) {
          missingEl.appendChild(ui.banner(
            'متغيرات فارغة في هذا الطلب: ' + r.missing.join('، '), 'warn', 'alert'));
        }
      }

      const tplSelect = h('select', {
        class: 'select',
        onchange: (e) => { templateId = e.target.value; applyTemplate(); },
      }, ...templates.map((t) => h('option', { value: t.id, selected: t.id === templateId }, t.name)));

      const provSelect = h('select', {
        class: 'select',
        onchange: (e) => { providerId = e.target.value; },
      }, ...ERP.comm.list().map((p) => h('option', { value: p.id, selected: p.id === providerId }, p.name)));

      applyTemplate();

      const m = ui.modal({
        title: 'إرسال رسالة للعميل',
        sub: `${customer.name} · ${customer.phone}`,
        size: 'modal-lg',
        body: h('div', { class: 'col gap-4' },
          h('div', { class: 'grid grid-2' },
            ui.field('القالب', h('div', { class: 'select-wrap' }, tplSelect, h('span', { class: 'caret' }, icon('caret', 14)))),
            ui.field('قناة الإرسال', h('div', { class: 'select-wrap' }, provSelect, h('span', { class: 'caret' }, icon('caret', 14))),
              { hint: 'قابلة للتغيير — القوالب مستقلة عن القناة' }),
          ),
          ui.field('نص الرسالة', textarea, { hint: 'يمكنك التعديل قبل الإرسال دون تغيير القالب الأصلي.' }),
          missingEl,
          h('div', { class: 'row gap-2 wrap' },
            ...['customer_name', 'product_name', 'quantity', 'order_code', 'expected_date'].map((k) =>
              h('button', {
                type: 'button', class: 'var-pill',
                onclick: () => {
                  const pos = textarea.selectionStart || textarea.value.length;
                  const v = ERP.templates.varsFromPreOrder(order)[k] || '';
                  textarea.value = textarea.value.slice(0, pos) + v + textarea.value.slice(pos);
                  textarea.focus();
                },
              }, '{' + k + '}')),
          ),
        ),
        foot: h('div', { class: 'row-between grow' },
          h('button', {
            class: 'btn btn-quiet',
            onclick: () => ui.copy(textarea.value),
          }, icon('edit', 15), 'نسخ النص'),
          h('div', { class: 'row gap-2' },
            h('button', { class: 'btn btn-quiet', onclick: () => m.close() }, 'إلغاء'),
            h('button', {
              class: 'btn ' + (providerId === 'whatsapp' ? 'btn-wa' : 'btn-primary'),
              onclick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                const res = await ERP.messaging.sendForPreOrder({
                  preOrderId: id, providerId, templateId, text: textarea.value,
                });
                btn.disabled = false;
                if (res.ok) {
                  m.close();
                  ui.toast({ title: 'أُرسلت الرسالة', body: 'انتقل الطلب إلى «تم إشعار العميل»', tone: 'ok' });
                } else {
                  ui.toast({ title: 'فشل الإرسال', body: res.error, tone: 'err' });
                }
              },
            }, icon(providerId === 'whatsapp' ? 'whatsapp' : 'send', 16),
              providerId === 'whatsapp' ? 'إرسال عبر واتساب' : 'إرسال'),
          ),
        ),
      });
    },
  };

  ERP.actions = actions;
})(window);
