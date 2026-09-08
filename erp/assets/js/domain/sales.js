/* ============================================================
   domain/sales.js — المبيعات
   العلاقة مع الطلب المسبق محفوظة في الاتجاهين:
   sale.preOrderId  ⇄  preOrder.saleId
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { store, bus, util: U } = ERP;

  const PAYMENT = {
    CASH:     'نقدًا',
    CARD:     'بطاقة',
    TRANSFER: 'تحويل',
    INSTALLMENT: 'أقساط',
  };

  const sales = {
    PAYMENT,

    all() { return store.sales(); },
    get(id) { return store.sale(id); },
    byPreOrder(preOrderId) { return store.sales().find((s) => s.preOrderId === preOrderId) || null; },
    byCustomer(customerId) { return store.sales().filter((s) => s.customerId === customerId); },

    /**
     * تحويل طلب مسبق محجوز إلى عملية بيع.
     * Pre-Order → Reserved → Sale
     * @param {string} preOrderId
     * @param {object} opts {discount, paymentMethod, unitPrice, note}
     */
    createFromPreOrder(preOrderId, opts = {}) {
      const order = store.preOrder(preOrderId);
      if (!order) throw new Error('الطلب غير موجود');
      if (order.status !== ERP.preorder.STATUS.RESERVED) {
        throw new Error('يجب أن يكون الطلب محجوزًا قبل إتمام البيع');
      }
      if (order.saleId) throw new Error('هذا الطلب مرتبط بفاتورة بالفعل');

      const items = order.stockItemIds.map((id) => store.stockItem(id)).filter(Boolean);
      if (items.length !== order.stockItemIds.length) throw new Error('بعض القطع المحجوزة لم تعد موجودة');

      const unitPrice = opts.unitPrice !== undefined && opts.unitPrice !== ''
        ? Number(opts.unitPrice) : order.unitPrice;
      const qty = order.quantity;
      const subtotal = unitPrice * qty;
      const discount = U.clamp(Number(opts.discount) || 0, 0, subtotal);
      const total = subtotal - discount;
      const code = store.nextCode('sale');

      const sale = {
        id: U.uid('sal'),
        code,
        preOrderId: order.id,          // ← العلاقة محفوظة
        preOrderCode: order.code,
        customerId: order.customerId,
        items: items.map((it) => ({
          productId: it.productId,
          variantId: it.variantId,
          stockItemId: it.id,
          serial: it.serial,
          qty: 1,
          unitPrice,
        })),
        subtotal,
        discount,
        depositApplied: order.depositAmount || 0,
        total,
        due: Math.max(0, total - (order.depositAmount || 0)),
        paymentMethod: opts.paymentMethod || 'CASH',
        note: (opts.note || '').trim(),
        createdAt: U.nowISO(),
        createdBy: opts.actor || store.settings().staffName,
      };

      store.batch(() => {
        store.update((s) => s.sales.unshift(sale));
        ERP.inventory.markSold(order.stockItemIds, sale.id);
        store.update((s) => {
          const o = s.preOrders.find((x) => x.id === preOrderId);
          o.saleId = sale.id;
          o.unitPrice = unitPrice;
        });
        ERP.preorder.transition(preOrderId, ERP.preorder.STATUS.SOLD, {
          note: `تم البيع بالفاتورة ${code}`,
          actor: sale.createdBy,
        });
      }, { reason: 'sale' });

      ERP.events.log('SALE_CREATED', {
        saleId: sale.id, code, preOrderId, total, customerId: sale.customerId,
      }, sale.createdBy);
      ERP.events.log('PREORDER_SOLD', {
        preOrderId, code: order.code, saleId: sale.id, saleCode: code, total,
      }, sale.createdBy);
      bus.emit('sale:created', sale);

      return sale;
    },

    /** إحصاءات موجزة تربط المبيعات بالطلبات المسبقة */
    stats() {
      const list = store.sales();
      const fromPreOrders = list.filter((s) => s.preOrderId);
      const revenue = list.reduce((a, s) => a + s.total, 0);
      const preRevenue = fromPreOrders.reduce((a, s) => a + s.total, 0);
      return {
        count: list.length,
        fromPreOrders: fromPreOrders.length,
        revenue,
        preOrderRevenue: preRevenue,
        share: list.length ? Math.round((fromPreOrders.length / list.length) * 100) : 0,
      };
    },
  };

  ERP.sales = sales;
})(window);
