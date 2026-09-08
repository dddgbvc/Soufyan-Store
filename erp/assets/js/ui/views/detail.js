/* ============================================================
   ui/views/detail.js — لوحة تفاصيل الطلب المسبق (Drawer)
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, dom, icon, ui, util: U, store, preorder, actions } = ERP;
  ERP.views = ERP.views || {};
  const S = preorder.STATUS;

  let current = null;

  function open(id) {
    if (current) { current.close(); current = null; }
    const order0 = preorder.get(id);
    if (!order0) return;

    const bodyWrap = h('div', { class: 'col gap-4' });
    const footWrap = h('div', { class: 'row gap-2' });
    const badgeWrap = h('span');

    function paint() {
      const o = preorder.get(id);
      if (!o) { d.close(); return; }
      const customer = store.customer(o.customerId);
      const product = store.product(o.productId);

      dom.mount(badgeWrap, ui.statusChip(o.status));
      dom.clear(bodyWrap);

      /* ----- بطاقة العميل ----- */
      bodyWrap.appendChild(h('div', { class: 'detail-hero' },
        ui.avatar(customer ? customer.name : '؟'),
        h('div', { class: 'cell-stack grow' },
          h('span', { class: 'fw-7 fs-15' }, customer ? customer.name : 'عميل محذوف'),
          h('span', { class: 'cell-sub num' }, customer ? customer.phone : '—'),
        ),
        customer ? h('button', {
          class: 'btn btn-sm btn-icon', title: 'نسخ الرقم', 'aria-label': 'نسخ رقم الهاتف',
          onclick: () => ui.copy(customer.phone),
        }, icon('link', 15)) : null,
      ));

      /* ----- تنبيه المطابقة ----- */
      if (o.matchInfo && (o.status === S.ARRIVED || o.status === S.CUSTOMER_NOTIFIED)) {
        bodyWrap.appendChild(h('div', { class: 'match-alert' },
          h('div', { class: 'ma-ic' }, icon('sparkle', 20)),
          h('div', { class: 'grow' },
            h('div', { class: 'ma-title' }, 'وصل منتج مطلوب مسبقًا'),
            h('div', { class: 'ma-body' },
              `${ERP.matching.confidenceLabel(o.matchInfo.confidence)} بنسبة ${o.matchInfo.score}% — ` +
              `تطابق: ${(o.matchInfo.reasons || []).join('، ')}`),
          ),
        ));
      }

      /* ----- تفاصيل المنتج ----- */
      const t = o.target;
      bodyWrap.appendChild(h('div', null,
        h('div', { class: 'd-section-title' }, 'المنتج المطلوب'),
        h('div', { class: 'card card-pad col gap-3' },
          h('div', { class: 'row-between' },
            h('div', { class: 'cell-stack' },
              h('span', { class: 'fw-7 fs-15' }, t.productName),
              h('span', { class: 'cell-sub' }, `${t.brand} · موديل ${t.model}`),
            ),
            h('span', { class: 'num fw-7' }, U.fmtMoney(o.unitPrice)),
          ),
          h('div', { class: 'row gap-2 wrap' },
            t.storage && t.storage !== '—' ? ui.attrChip(t.storage) : null,
            t.color ? ui.attrChip(t.color, t.colorHex) : null,
            ui.attrChip('SKU ' + t.sku),
            ui.attrChip('الكمية ' + o.quantity),
            product && product.tracksSerial ? h('span', { class: 'chip-attr' }, icon('lock', 11), 'IMEI/Serial') : null,
          ),
        ),
      ));

      /* ----- بيانات الطلب ----- */
      bodyWrap.appendChild(h('div', null,
        h('div', { class: 'd-section-title' }, 'بيانات الطلب'),
        h('div', { class: 'card card-pad' },
          h('dl', { class: 'kv' },
            h('dt', null, 'رقم الطلب'), h('dd', { class: 'num' }, o.code),
            h('dt', null, 'تاريخ الطلب'), h('dd', null, U.fmtDateTime(o.createdAt)),
            h('dt', null, 'الموعد المتوقع'), h('dd', null,
              o.expectedAt
                ? h('span', { style: preorder.isLate(o) ? { color: 'var(--err)' } : null },
                    U.fmtDateShort(o.expectedAt) + (preorder.isLate(o) ? ' (متأخر)' : ''))
                : 'غير محدد'),
            h('dt', null, 'الأولوية'), h('dd', null, preorder.PRIORITY[o.priority].label),
            h('dt', null, 'العربون'), h('dd', { class: 'num' }, U.fmtMoney(o.depositAmount || 0)),
            h('dt', null, 'الإجمالي'), h('dd', { class: 'num' }, U.fmtMoney((o.unitPrice || 0) * o.quantity)),
            h('dt', null, 'صلاحية الطلب'), h('dd', null, o.expiresAt ? U.fmtDateShort(o.expiresAt) : '—'),
            h('dt', null, 'أنشأه'), h('dd', null, o.createdBy || '—'),
          ),
          o.notes ? h('div', { class: 'mt-3' },
            h('div', { class: 'd-section-title' }, 'ملاحظات'),
            h('div', { class: 'fs-13 t-2' }, o.notes)) : null,
        ),
      ));

      /* ----- المخزون المرتبط ----- */
      const linked = o.stockItemIds.map((sid) => store.stockItem(sid)).filter(Boolean);
      const suggested = (o.suggestedStockItemIds || [])
        .map((sid) => store.stockItem(sid))
        .filter((it) => it && it.status === 'AVAILABLE');

      if (linked.length || suggested.length) {
        bodyWrap.appendChild(h('div', null,
          h('div', { class: 'd-section-title' }, linked.length ? 'القطع المحجوزة' : 'قطع مقترحة للحجز'),
          h('div', { class: 'col gap-2' },
            ...(linked.length ? linked : suggested).map((it, i) => h('div', { class: 'stock-row' },
              h('span', { class: 'box', style: linked.length ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' } : null },
                linked.length ? icon('check', 12) : null),
              h('div', { class: 'cell-stack grow' },
                h('span', { class: 'fw-6 fs-13 num' }, it.serial ? it.serial : `قطعة ${i + 1}`),
                h('span', { class: 'cell-sub' },
                  `${it.sku} · ${ERP.inventory.STATUS_LABEL[it.status]} · ${U.fmtDateShort(it.receivedAt)}`),
              ),
              it.serial ? h('button', {
                class: 'btn btn-sm btn-icon btn-quiet', title: 'نسخ IMEI', 'aria-label': 'نسخ IMEI',
                onclick: () => ui.copy(it.serial),
              }, icon('link', 14)) : null,
            )),
          ),
        ));
      }

      /* ----- الفاتورة ----- */
      if (o.saleId) {
        const sale = store.sale(o.saleId);
        if (sale) {
          bodyWrap.appendChild(h('div', null,
            h('div', { class: 'd-section-title' }, 'الفاتورة المرتبطة'),
            h('button', {
              class: 'card card-pad row gap-3', style: { width: '100%', textAlign: 'start' },
              onclick: () => actions.viewSale(o.id),
            },
              h('div', { class: 'avatar' }, icon('receipt', 16)),
              h('div', { class: 'cell-stack grow' },
                h('span', { class: 'fw-6 num' }, sale.code),
                h('span', { class: 'cell-sub' }, U.fmtDateTime(sale.createdAt) + ' · ' + (ERP.sales.PAYMENT[sale.paymentMethod] || '')),
              ),
              h('span', { class: 'num fw-7' }, U.fmtMoney(sale.total)),
            ),
          ));
        }
      }

      /* ----- الرسائل ----- */
      const msgs = ERP.messaging.outbox(o.id);
      if (msgs.length) {
        bodyWrap.appendChild(h('div', null,
          h('div', { class: 'd-section-title' }, 'الرسائل المرسلة'),
          h('div', { class: 'col gap-2' },
            ...msgs.slice(0, 4).map((msg) => h('div', { class: 'mini-card col gap-2' },
              h('div', { class: 'row-between' },
                h('span', { class: 'row gap-2 fs-12 fw-6' },
                  icon(msg.channel === 'whatsapp' ? 'whatsapp' : 'send', 14),
                  (ERP.comm.get(msg.providerId) || {}).name || msg.channel),
                h('span', { class: 'cell-sub' }, U.relTime(msg.at)),
              ),
              h('div', { class: 'fs-12 t-2 clamp-2' }, msg.text),
              msg.status === 'FAILED' ? h('span', { class: 'err-text' }, msg.error) : null,
            )),
          ),
        ));
      }

      /* ----- الخط الزمني ----- */
      bodyWrap.appendChild(h('div', null,
        h('div', { class: 'd-section-title' }, 'سجل الطلب'),
        h('div', { class: 'card card-pad' },
          h('div', { class: 'timeline' },
            ...o.history.slice().reverse().map((entry) => h('div', { class: 'tl-item' },
              h('div', { class: 'tl-rail', style: { '--tone': preorder.color(entry.to) } },
                h('i', { class: 'tl-dot' }),
                h('i', { class: 'tl-line' }),
              ),
              h('div', null,
                h('div', { class: 'tl-title' }, preorder.label(entry.to)),
                h('div', { class: 'tl-meta' }, `${U.fmtDateTime(entry.at)} · ${entry.by}`),
                entry.note ? h('div', { class: 'tl-note' }, entry.note) : null,
              ),
            )),
          ),
        ),
      ));

      /* ----- الإجراءات ----- */
      dom.clear(footWrap);
      const primary = actions.primary(o);
      if (primary) {
        footWrap.appendChild(h('button', {
          class: 'btn btn-lg grow ' + (primary.tone === 'wa' ? 'btn-wa' : 'btn-primary'),
          onclick: () => primary.run(),
        }, icon(primary.icon, 17), primary.label));
      }
      footWrap.appendChild(h('button', {
        class: 'btn btn-lg btn-icon', 'aria-label': 'إجراءات أخرى',
        onclick: (e) => ui.menu(e.currentTarget, actions.menuItems(o)),
      }, icon('more', 18)));
    }

    const off = ERP.bus.on('store:changed', () => paint());

    const d = ui.drawer({
      title: order0.code,
      sub: 'تفاصيل الطلب المسبق',
      badge: badgeWrap,
      body: bodyWrap,
      foot: footWrap,
      onClose: () => { off(); current = null; },
    });
    current = d;
    paint();
    return d;
  }

  ERP.views.detail = { open };
})(window);
