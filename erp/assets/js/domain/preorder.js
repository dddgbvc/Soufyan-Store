/* ============================================================
   domain/preorder.js — نطاق الطلب المسبق
   آلة حالات صريحة + قواعد انتقال + سجل تاريخي لكل طلب.
   لا تعرف شيئًا عن الواجهة ولا عن واتساب.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { store, bus, util: U } = ERP;

  /* ---------------- الحالات ---------------- */
  const STATUS = {
    PENDING: 'PENDING',
    WAITING_ARRIVAL: 'WAITING_ARRIVAL',
    ARRIVED: 'ARRIVED',
    CUSTOMER_NOTIFIED: 'CUSTOMER_NOTIFIED',
    RESERVED: 'RESERVED',
    SOLD: 'SOLD',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
  };

  const META = {
    PENDING:           { label: 'قيد الانتظار',   icon: 'clock',    color: 'var(--st-pending)',   order: 1, open: true,  matchable: true },
    WAITING_ARRIVAL:   { label: 'بانتظار الوصول', icon: 'truck',    color: 'var(--st-waiting)',   order: 2, open: true,  matchable: true },
    ARRIVED:           { label: 'وصلت',           icon: 'inbox',    color: 'var(--st-arrived)',   order: 3, open: true,  matchable: false },
    CUSTOMER_NOTIFIED: { label: 'تم إشعار العميل', icon: 'message',  color: 'var(--st-notified)',  order: 4, open: true,  matchable: false },
    RESERVED:          { label: 'محجوزة',         icon: 'reserve',  color: 'var(--st-reserved)',  order: 5, open: true,  matchable: false },
    SOLD:              { label: 'تم بيعها',       icon: 'receipt',  color: 'var(--st-sold)',      order: 6, open: false, matchable: false },
    CANCELLED:         { label: 'ملغاة',          icon: 'x',        color: 'var(--st-cancelled)', order: 7, open: false, matchable: false },
    EXPIRED:           { label: 'منتهية',         icon: 'alert',    color: 'var(--st-expired)',   order: 8, open: false, matchable: false },
  };

  /** الانتقالات المسموحة فقط — أي انتقال آخر يُرفض */
  const TRANSITIONS = {
    PENDING:           ['WAITING_ARRIVAL', 'ARRIVED', 'CANCELLED', 'EXPIRED'],
    WAITING_ARRIVAL:   ['ARRIVED', 'CANCELLED', 'EXPIRED'],
    ARRIVED:           ['CUSTOMER_NOTIFIED', 'RESERVED', 'WAITING_ARRIVAL', 'CANCELLED', 'EXPIRED'],
    CUSTOMER_NOTIFIED: ['RESERVED', 'ARRIVED', 'CANCELLED', 'EXPIRED'],
    RESERVED:          ['SOLD', 'CUSTOMER_NOTIFIED', 'CANCELLED'],
    SOLD:              [],
    CANCELLED:         ['PENDING'],
    EXPIRED:           ['PENDING', 'CANCELLED'],
  };

  const PRIORITY = {
    LOW:    { label: 'عادية جدًا', order: 3 },
    NORMAL: { label: 'عادية',      order: 2 },
    HIGH:   { label: 'عاجلة',      order: 1 },
  };

  const OPEN_STATUSES = Object.keys(META).filter((k) => META[k].open);
  const MATCHABLE_STATUSES = Object.keys(META).filter((k) => META[k].matchable);

  /* ============================================================
     خدمة الطلب المسبق
     ============================================================ */
  const preorder = {
    STATUS, META, TRANSITIONS, PRIORITY, OPEN_STATUSES, MATCHABLE_STATUSES,

    label(status) { return (META[status] || {}).label || status; },
    color(status) { return (META[status] || {}).color || 'var(--text-3)'; },
    icon(status) { return (META[status] || {}).icon || 'info'; },
    isOpen(order) { return !!(META[order.status] || {}).open; },

    all() { return store.preOrders(); },
    get(id) { return store.preOrder(id); },

    /* ---------------- إنشاء ---------------- */
    /**
     * @param {object} input {customerId, variantId, quantity, notes, expectedAt, priority, depositAmount}
     */
    create(input) {
      const errors = preorder.validate(input);
      if (errors.length) throw new Error(errors[0]);

      const product = store.productOfVariant(input.variantId);
      const variant = store.variant(input.variantId);
      const settings = store.settings();
      const code = store.nextCode('preorder');
      const now = U.nowISO();

      const order = {
        id: U.uid('po'),
        code,
        customerId: input.customerId,
        productId: product.id,
        variantId: variant.id,
        target: {
          productName: product.name,
          brand: product.brand,
          model: product.model,
          sku: variant.sku,
          storage: variant.storage,
          color: variant.color,
          colorHex: variant.colorHex,
        },
        quantity: U.clamp(input.quantity || 1, 1, 999),
        status: STATUS.PENDING,
        priority: input.priority || 'NORMAL',
        expectedAt: input.expectedAt || null,
        expiresAt: input.expiresAt || U.addDays(new Date(), settings.preorderValidityDays || 30).toISOString(),
        notes: (input.notes || '').trim(),
        depositAmount: Number(input.depositAmount) || 0,
        unitPrice: variant.price,
        createdAt: now,
        updatedAt: now,
        createdBy: input.createdBy || settings.staffName,
        stockItemIds: [],
        saleId: null,
        notifiedAt: null,
        arrivedAt: null,
        matchedAt: null,
        lastMessage: null,
        history: [{ at: now, from: null, to: STATUS.PENDING, by: input.createdBy || settings.staffName, note: 'إنشاء الطلب' }],
      };

      store.update((s) => s.preOrders.unshift(order));
      ERP.events.log('PREORDER_CREATED', {
        preOrderId: order.id, code: order.code,
        customerId: order.customerId, productName: order.target.productName,
        quantity: order.quantity,
      });
      bus.emit('preorder:created', order);

      // هل البضاعة متوفرة أصلًا؟ عندها الطلب يصل فورًا.
      if (ERP.matching) ERP.matching.checkExistingStock(order);
      return order;
    },

    validate(input) {
      const errors = [];
      if (!input.customerId || !store.customer(input.customerId)) errors.push('اختر العميل أولًا');
      if (!input.variantId || !store.variant(input.variantId)) errors.push('اختر المنتج والـ Variant');
      const q = Number(input.quantity);
      if (!q || q < 1) errors.push('الكمية يجب أن تكون 1 على الأقل');
      if (q > 999) errors.push('الكمية كبيرة جدًا');
      return errors;
    },

    update(id, patch) {
      return store.update((s) => {
        const o = s.preOrders.find((x) => x.id === id);
        if (!o) return null;
        const allowed = ['notes', 'expectedAt', 'priority', 'quantity', 'depositAmount', 'expiresAt', 'unitPrice'];
        allowed.forEach((k) => { if (k in patch) o[k] = patch[k]; });
        if ('quantity' in patch) o.quantity = U.clamp(patch.quantity, 1, 999);
        o.updatedAt = U.nowISO();
        ERP.events.log('PREORDER_UPDATED', { preOrderId: id, code: o.code, fields: Object.keys(patch) });
        return o;
      });
    },

    remove(id) {
      const order = store.preOrder(id);
      if (!order) return false;
      if (order.stockItemIds.length) preorder.release(id, 'حذف الطلب');
      store.update((s) => {
        const i = s.preOrders.findIndex((x) => x.id === id);
        if (i > -1) s.preOrders.splice(i, 1);
      });
      ERP.events.log('PREORDER_DELETED', { preOrderId: id, code: order.code });
      return true;
    },

    /* ---------------- آلة الحالات ---------------- */
    can(order, to) {
      if (!order) return { ok: false, reason: 'الطلب غير موجود' };
      if (order.status === to) return { ok: false, reason: 'الطلب في هذه الحالة بالفعل' };
      const allowed = TRANSITIONS[order.status] || [];
      if (!allowed.includes(to)) {
        return { ok: false, reason: `لا يمكن الانتقال من «${preorder.label(order.status)}» إلى «${preorder.label(to)}»` };
      }
      if (to === STATUS.RESERVED && order.stockItemIds.length < order.quantity) {
        return { ok: false, reason: 'يجب ربط قطع المخزون بالطلب قبل الحجز' };
      }
      if (to === STATUS.SOLD && order.status !== STATUS.RESERVED) {
        return { ok: false, reason: 'يجب حجز الطلب قبل البيع' };
      }
      return { ok: true };
    },

    allowed(order) { return (TRANSITIONS[order.status] || []).slice(); },

    /**
     * تنفيذ انتقال حالة مع تسجيله في التاريخ والسجل.
     * @param {string} id
     * @param {string} to
     * @param {object} opts {note, actor, meta}
     */
    transition(id, to, opts = {}) {
      const order = store.preOrder(id);
      const check = preorder.can(order, to);
      if (!check.ok) throw new Error(check.reason);

      const at = U.nowISO();
      const from = order.status;
      const by = opts.actor || store.settings().staffName;

      store.update((s) => {
        const o = s.preOrders.find((x) => x.id === id);
        o.status = to;
        o.updatedAt = at;
        o.history.push({ at, from, to, by, note: opts.note || '' });
        if (to === STATUS.ARRIVED && !o.arrivedAt) o.arrivedAt = at;
        if (to === STATUS.CUSTOMER_NOTIFIED) o.notifiedAt = at;
        if (to === STATUS.PENDING) {           // إعادة فتح
          o.expiresAt = U.addDays(new Date(), s.settings.preorderValidityDays || 30).toISOString();
        }
      });

      ERP.events.log('PREORDER_STATUS_CHANGED', {
        preOrderId: id, code: order.code, from, to, note: opts.note || '',
      }, by);

      if (to === STATUS.CANCELLED) ERP.events.log('PREORDER_CANCELLED', { preOrderId: id, code: order.code, reason: opts.note || '' }, by);
      if (to === STATUS.EXPIRED) {
        const cust = store.customer(order.customerId);
        ERP.events.log('PREORDER_EXPIRED', { preOrderId: id, code: order.code, customerName: cust ? cust.name : '' }, by);
      }

      bus.emit('preorder:status', { order: store.preOrder(id), from, to });
      return store.preOrder(id);
    },

    /* ---------------- اختصارات عملية ---------------- */
    confirmWaiting(id, note) { return preorder.transition(id, STATUS.WAITING_ARRIVAL, { note: note || 'تم تأكيد الطلب مع المورد' }); },

    markArrived(id, opts = {}) {
      const order = store.preOrder(id);
      if (!order) throw new Error('الطلب غير موجود');
      if (order.status === STATUS.PENDING || order.status === STATUS.WAITING_ARRIVAL) {
        return preorder.transition(id, STATUS.ARRIVED, opts);
      }
      return order;
    },

    cancel(id, reason) {
      const order = store.preOrder(id);
      if (order && order.stockItemIds.length) preorder.release(id, 'إلغاء الطلب');
      return preorder.transition(id, STATUS.CANCELLED, { note: reason || 'أُلغي الطلب' });
    },

    reopen(id) { return preorder.transition(id, STATUS.PENDING, { note: 'إعادة فتح الطلب' }); },

    /* ---------------- الحجز ---------------- */
    /**
     * ربط قطع مخزون فعلية بالطلب ثم نقله إلى «محجوزة».
     * إن كان المنتج يعتمد IMEI/Serial فالقطع المرتبطة هي الأجهزة نفسها.
     */
    reserve(id, stockItemIds, opts = {}) {
      const order = store.preOrder(id);
      if (!order) throw new Error('الطلب غير موجود');
      const ids = (stockItemIds || []).slice(0, order.quantity);
      if (!ids.length) throw new Error('اختر قطعة واحدة على الأقل من المخزون');
      if (ids.length < order.quantity) {
        throw new Error(`الطلب يحتاج ${order.quantity} قطعة، اخترت ${ids.length} فقط`);
      }

      const items = ids.map((sid) => store.stockItem(sid)).filter(Boolean);
      if (items.length !== ids.length) throw new Error('بعض القطع لم تعد موجودة');
      const bad = items.find((it) => it.status !== 'AVAILABLE' && it.preOrderId !== id);
      if (bad) throw new Error('إحدى القطع محجوزة أو مباعة بالفعل');
      const wrong = items.find((it) => it.variantId !== order.variantId);
      if (wrong) throw new Error('القطعة المختارة لا تطابق المنتج المطلوب');

      store.batch(() => {
        ERP.inventory.assign(ids, id);
        store.update((s) => {
          const o = s.preOrders.find((x) => x.id === id);
          o.stockItemIds = ids;
          o.updatedAt = U.nowISO();
        });
        if (order.status === STATUS.PENDING || order.status === STATUS.WAITING_ARRIVAL) {
          preorder.transition(id, STATUS.ARRIVED, { note: 'وصول مؤكد عند الحجز' });
        }
        preorder.transition(id, STATUS.RESERVED, { note: opts.note || 'حُجزت البضاعة باسم العميل' });
      });

      ERP.events.log('PREORDER_RESERVED', {
        preOrderId: id, code: order.code, stockItemIds: ids,
        serials: items.map((i) => i.serial).filter(Boolean),
      });
      return store.preOrder(id);
    },

    /** فك الحجز وإعادة القطع إلى المخزون المتاح */
    release(id, reason) {
      const order = store.preOrder(id);
      if (!order || !order.stockItemIds.length) return order;
      const ids = order.stockItemIds.slice();
      store.batch(() => {
        ERP.inventory.unassign(ids);
        store.update((s) => {
          const o = s.preOrders.find((x) => x.id === id);
          o.stockItemIds = [];
          o.updatedAt = U.nowISO();
        });
      });
      ERP.events.log('PREORDER_RELEASED', { preOrderId: id, code: order.code, stockItemIds: ids, reason: reason || '' });
      return store.preOrder(id);
    },

    /* ---------------- البيع ---------------- */
    sell(id, opts = {}) { return ERP.sales.createFromPreOrder(id, opts); },

    /* ---------------- الصلاحية ---------------- */
    /** يُشغَّل عند الإقلاع: ينقل الطلبات المفتوحة المنتهية إلى «منتهية» */
    checkExpiries() {
      const now = Date.now();
      const due = store.preOrders().filter((o) =>
        (o.status === STATUS.PENDING || o.status === STATUS.WAITING_ARRIVAL) &&
        o.expiresAt && new Date(o.expiresAt).getTime() < now);
      if (!due.length) return 0;
      store.batch(() => {
        due.forEach((o) => {
          try { preorder.transition(o.id, STATUS.EXPIRED, { note: 'انتهت المدة المحددة للطلب', actor: 'النظام' }); }
          catch (err) { console.warn('[preorder] expiry skip', o.code, err.message); }
        });
      });
      return due.length;
    },

    /* ---------------- تجميعات ---------------- */
    counts() {
      const out = { ALL: 0, OPEN: 0 };
      Object.keys(META).forEach((k) => { out[k] = 0; });
      store.preOrders().forEach((o) => {
        out.ALL++;
        out[o.status] = (out[o.status] || 0) + 1;
        if (META[o.status] && META[o.status].open) out.OPEN++;
      });
      return out;
    },

    /** طلبات تنتظر إجراءً من الموظف الآن */
    actionQueue() {
      return store.preOrders().filter((o) =>
        o.status === STATUS.ARRIVED || o.status === STATUS.CUSTOMER_NOTIFIED);
    },

    byCustomer(customerId) { return store.preOrders().filter((o) => o.customerId === customerId); },
    byVariant(variantId) { return store.preOrders().filter((o) => o.variantId === variantId); },

    /** ملخص سطر واحد للـ Variant */
    variantLabel(order) {
      const t = order.target || {};
      return [t.storage && t.storage !== '—' ? t.storage : null, t.color].filter(Boolean).join(' · ') || '—';
    },

    isLate(order) {
      if (!order.expectedAt || !META[order.status].open) return false;
      return new Date(order.expectedAt).getTime() < Date.now() &&
             (order.status === STATUS.PENDING || order.status === STATUS.WAITING_ARRIVAL);
    },
  };

  /* ============================================================
     ربط غير مباشر مع طبقة الاتصال:
     عندما تُرسل رسالة بنجاح لطلب في حالة «وصلت» ينتقل تلقائيًا
     إلى «تم إشعار العميل». منطق الطلب لا يستدعي واتساب أبدًا.
     ============================================================ */
  bus.on('event:MESSAGE_SENT', (ev) => {
    const { preOrderId, messageId, channel, templateId } = ev.payload || {};
    if (!preOrderId) return;
    const order = store.preOrder(preOrderId);
    if (!order) return;

    store.update((s) => {
      const o = s.preOrders.find((x) => x.id === preOrderId);
      if (o) o.lastMessage = { channel, at: ev.at, templateId: templateId || null, ref: messageId };
    });

    if (order.status === STATUS.ARRIVED) {
      try {
        preorder.transition(preOrderId, STATUS.CUSTOMER_NOTIFIED, { note: 'أُرسل إشعار للعميل' });
        ERP.events.log('PREORDER_NOTIFIED', { preOrderId, code: order.code, channel });
      } catch (err) {
        console.warn('[preorder] notify transition skipped:', err.message);
      }
    }
  });

  ERP.preorder = preorder;
})(window);
