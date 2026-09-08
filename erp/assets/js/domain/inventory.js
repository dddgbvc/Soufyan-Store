/* ============================================================
   domain/inventory.js — المخزون وقطعه الفعلية (Stock Items)
   كل قطعة = وحدة واحدة. الأجهزة التي تعتمد IMEI/Serial تحمل رقمها.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { store, bus, util: U } = ERP;

  const STATUS = { AVAILABLE: 'AVAILABLE', RESERVED: 'RESERVED', SOLD: 'SOLD' };
  const STATUS_LABEL = { AVAILABLE: 'متاحة', RESERVED: 'محجوزة', SOLD: 'مباعة' };

  const inventory = {
    STATUS, STATUS_LABEL,

    all() { return store.stockItems(); },
    get(id) { return store.stockItem(id); },

    byVariant(variantId) { return store.stockItems().filter((s) => s.variantId === variantId); },
    availableFor(variantId) {
      return store.stockItems().filter((s) => s.variantId === variantId && s.status === STATUS.AVAILABLE);
    },
    countAvailable(variantId) { return inventory.availableFor(variantId).length; },

    forPreOrder(preOrderId) {
      return store.stockItems().filter((s) => s.preOrderId === preOrderId);
    },

    /** القطع القابلة للحجز لطلب معين: المتاحة + المرتبطة به مسبقًا */
    reservableFor(order) {
      return store.stockItems().filter((s) =>
        s.variantId === order.variantId &&
        (s.status === STATUS.AVAILABLE || s.preOrderId === order.id));
    },

    /**
     * استلام بضاعة جديدة — نقطة الدخول التي تُشغّل المطابقة التلقائية.
     * @param {object} input {variantId, quantity, serials[], supplier, cost, note}
     * @returns {{batchId, items, matches}}
     */
    receive(input) {
      const variant = store.variant(input.variantId);
      const product = store.productOfVariant(input.variantId);
      if (!variant || !product) throw new Error('المنتج أو الـ Variant غير موجود');

      const qty = U.clamp(input.quantity || 1, 1, 500);
      const serials = (input.serials || []).map((s) => String(s || '').trim()).filter(Boolean);

      if (product.tracksSerial) {
        if (serials.length && serials.length !== qty) {
          throw new Error(`أدخل ${qty} رقم IMEI أو اتركها كلها فارغة`);
        }
        const dupInside = serials.filter((s, i) => serials.indexOf(s) !== i);
        if (dupInside.length) throw new Error('يوجد رقم IMEI مكرر في الإدخال: ' + dupInside[0]);
        const exists = serials.find((s) => store.stockItems().some((it) => it.serial === s));
        if (exists) throw new Error('رقم IMEI مسجّل مسبقًا في المخزون: ' + exists);
      }

      const batchId = U.uid('bat');
      const at = U.nowISO();
      const items = [];
      for (let i = 0; i < qty; i++) {
        items.push({
          id: U.uid('stk'),
          productId: product.id,
          variantId: variant.id,
          sku: variant.sku,
          serial: product.tracksSerial ? (serials[i] || null) : null,
          status: STATUS.AVAILABLE,
          preOrderId: null,
          cost: input.cost !== undefined && input.cost !== '' ? Number(input.cost) : variant.cost,
          supplier: (input.supplier || '').trim() || 'غير محدد',
          receivedAt: at,
          batchId,
          note: (input.note || '').trim(),
        });
      }

      store.update((s) => { s.stockItems.push(...items); });

      ERP.events.log('INVENTORY_RECEIVED', {
        batchId, variantId: variant.id, sku: variant.sku,
        productName: product.name, storage: variant.storage, color: variant.color,
        quantity: qty, supplier: items[0].supplier,
        serials: items.map((i) => i.serial).filter(Boolean),
      });
      bus.emit('inventory:received', { batchId, items });

      // ← هنا تبدأ المطابقة التلقائية مع الطلبات المسبقة
      const matches = ERP.matching.runForStockItems(items, { batchId });

      return { batchId, items, matches };
    },

    /** ربط قطع بطلب (حجز) */
    assign(ids, preOrderId) {
      store.update((s) => {
        ids.forEach((id) => {
          const it = s.stockItems.find((x) => x.id === id);
          if (!it) return;
          it.status = STATUS.RESERVED;
          it.preOrderId = preOrderId;
          it.reservedAt = U.nowISO();
        });
      });
      ERP.events.log('STOCK_RESERVED', { stockItemIds: ids, preOrderId });
    },

    /** تحرير قطع محجوزة */
    unassign(ids) {
      store.update((s) => {
        ids.forEach((id) => {
          const it = s.stockItems.find((x) => x.id === id);
          if (!it || it.status === STATUS.SOLD) return;
          it.status = STATUS.AVAILABLE;
          it.preOrderId = null;
          it.reservedAt = null;
        });
      });
      ERP.events.log('STOCK_RELEASED', { stockItemIds: ids });
    },

    /** تعليم القطع كمباعة ضمن فاتورة */
    markSold(ids, saleId) {
      store.update((s) => {
        ids.forEach((id) => {
          const it = s.stockItems.find((x) => x.id === id);
          if (!it) return;
          it.status = STATUS.SOLD;
          it.saleId = saleId;
          it.soldAt = U.nowISO();
        });
      });
      ERP.events.log('STOCK_SOLD', { stockItemIds: ids, saleId });
    },

    remove(id) {
      const item = store.stockItem(id);
      if (!item) return false;
      if (item.status !== STATUS.AVAILABLE) throw new Error('لا يمكن حذف قطعة محجوزة أو مباعة');
      store.update((s) => {
        const i = s.stockItems.findIndex((x) => x.id === id);
        if (i > -1) s.stockItems.splice(i, 1);
      });
      return true;
    },

    /** ملخص المخزون لكل Variant */
    summary() {
      const rows = [];
      store.products().forEach((p) => {
        p.variants.forEach((v) => {
          const items = inventory.byVariant(v.id);
          const available = items.filter((i) => i.status === STATUS.AVAILABLE).length;
          const reserved = items.filter((i) => i.status === STATUS.RESERVED).length;
          const demand = store.preOrders()
            .filter((o) => o.variantId === v.id && ERP.preorder.META[o.status].open)
            .reduce((sum, o) => sum + o.quantity, 0);
          rows.push({ product: p, variant: v, available, reserved, sold: items.length - available - reserved, demand });
        });
      });
      return rows;
    },
  };

  ERP.inventory = inventory;
})(window);
