/* ============================================================
   domain/events.js — سجل أحداث النظام (Domain Events)
   كل ما يحدث في منطق العمل يُسجَّل هنا ويُبثّ على الـ bus.
   الواجهة والإشعارات تستمع فقط — لا تُستدعى من داخل منطق العمل.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { store, bus, util: U } = ERP;

  const MAX_EVENTS = 800;

  /** أنواع الأحداث المعروفة */
  const TYPES = {
    PREORDER_CREATED:        { label: 'إنشاء طلب مسبق', tone: 'info' },
    PREORDER_UPDATED:        { label: 'تعديل طلب', tone: 'info' },
    PREORDER_STATUS_CHANGED: { label: 'تغيير حالة', tone: 'info' },
    PREORDER_MATCHED:        { label: 'مطابقة مخزون', tone: 'success', hot: true },
    PREORDER_RESERVED:       { label: 'حجز للعميل', tone: 'info' },
    PREORDER_RELEASED:       { label: 'فك الحجز', tone: 'warn' },
    PREORDER_NOTIFIED:       { label: 'إشعار العميل', tone: 'info' },
    PREORDER_SOLD:           { label: 'تحويل إلى بيع', tone: 'success' },
    PREORDER_CANCELLED:      { label: 'إلغاء طلب', tone: 'warn' },
    PREORDER_EXPIRED:        { label: 'انتهاء صلاحية', tone: 'warn' },
    PREORDER_DELETED:        { label: 'حذف طلب', tone: 'warn' },
    INVENTORY_RECEIVED:      { label: 'استلام بضاعة', tone: 'info' },
    STOCK_RESERVED:          { label: 'حجز قطعة', tone: 'info' },
    STOCK_RELEASED:          { label: 'تحرير قطعة', tone: 'info' },
    STOCK_SOLD:              { label: 'بيع قطعة', tone: 'info' },
    CUSTOMER_CREATED:        { label: 'عميل جديد', tone: 'info' },
    MESSAGE_SENT:            { label: 'إرسال رسالة', tone: 'success' },
    MESSAGE_FAILED:          { label: 'فشل إرسال', tone: 'error' },
    TEMPLATE_UPDATED:        { label: 'تعديل قالب', tone: 'info' },
    SALE_CREATED:            { label: 'فاتورة بيع', tone: 'success' },
  };

  const events = {
    TYPES,

    /**
     * تسجيل حدث في السجل وبثّه.
     * @param {string} type   نوع الحدث (من TYPES)
     * @param {object} payload بيانات الحدث
     * @param {string} [actor] من قام بالعملية
     */
    log(type, payload = {}, actor) {
      const record = {
        id: U.uid('ev'),
        type,
        payload,
        at: U.nowISO(),
        actor: actor || store.settings().staffName || 'النظام',
      };
      store.update((s) => {
        s.events.unshift(record);
        if (s.events.length > MAX_EVENTS) s.events.length = MAX_EVENTS;
      }, { silent: true });

      bus.emit('event', record);
      bus.emit('event:' + type, record);
      return record;
    },

    all() { return store.state.events; },

    byRef(preOrderId) {
      return store.state.events.filter((e) => e.payload && e.payload.preOrderId === preOrderId);
    },

    label(type) { return (TYPES[type] || {}).label || type; },
    isHot(type) { return !!(TYPES[type] || {}).hot; },
  };

  ERP.events = events;
})(window);
