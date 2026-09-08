/* ============================================================
   domain/notifications.js — مركز التنبيهات (للموظفين والمدير)
   يستمع لأحداث النطاق ويحوّل المهم منها إلى تنبيهات ظاهرة.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { store, bus, util: U } = ERP;

  const MAX = 200;

  const notifications = {
    push({ type, title, body, severity = 'info', refType = null, refId = null, audience = ['staff', 'manager'] }) {
      const n = {
        id: U.uid('ntf'), type, title, body, severity,
        refType, refId, audience,
        at: U.nowISO(), read: false,
      };
      store.update((s) => {
        s.notifications.unshift(n);
        if (s.notifications.length > MAX) s.notifications.length = MAX;
      });
      bus.emit('notification:new', n);
      return n;
    },

    all(audience) {
      const list = store.state.notifications;
      return audience ? list.filter((n) => n.audience.includes(audience)) : list;
    },

    unread(audience) { return notifications.all(audience).filter((n) => !n.read); },
    unreadCount(audience) { return notifications.unread(audience).length; },

    markRead(id) {
      store.update((s) => {
        const n = s.notifications.find((x) => x.id === id);
        if (n) n.read = true;
      });
    },

    markAllRead() {
      store.update((s) => s.notifications.forEach((n) => { n.read = true; }));
    },

    remove(id) {
      store.update((s) => {
        const i = s.notifications.findIndex((x) => x.id === id);
        if (i > -1) s.notifications.splice(i, 1);
      });
    },

    clearAll() { store.update((s) => { s.notifications = []; }); },
  };

  /* ------------------------------------------------------------
     ربط الأحداث بالتنبيهات — هذا هو المكان الوحيد الذي يقرر
     أي حدث يستحق تنبيهًا، فيبقى منطق العمل نظيفًا.
     ------------------------------------------------------------ */
  bus.on('event:PREORDER_MATCHED', (ev) => {
    const p = ev.payload;
    notifications.push({
      type: 'PREORDER_MATCHED',
      severity: 'success',
      title: 'وصل منتج مطلوب مسبقًا',
      body: `${p.customerName} · ${p.productName}${p.storage && p.storage !== '—' ? ' · ' + p.storage : ''}${p.color ? ' ' + p.color : ''} · الكمية ${p.quantity}`,
      refType: 'preorder',
      refId: p.preOrderId,
      audience: ['staff', 'manager'],
    });
  });

  bus.on('event:PREORDER_SOLD', (ev) => {
    const p = ev.payload;
    notifications.push({
      type: 'PREORDER_SOLD', severity: 'success',
      title: 'اكتمل طلب مسبق ببيع',
      body: `${p.code} · ${U.fmtMoney(p.total)}`,
      refType: 'preorder', refId: p.preOrderId,
      audience: ['manager'],
    });
  });

  bus.on('event:PREORDER_EXPIRED', (ev) => {
    const p = ev.payload;
    notifications.push({
      type: 'PREORDER_EXPIRED', severity: 'warn',
      title: 'انتهت صلاحية طلب مسبق',
      body: `${p.code} · ${p.customerName || ''}`,
      refType: 'preorder', refId: p.preOrderId,
      audience: ['manager'],
    });
  });

  bus.on('event:MESSAGE_FAILED', (ev) => {
    notifications.push({
      type: 'MESSAGE_FAILED', severity: 'error',
      title: 'تعذّر إرسال رسالة',
      body: ev.payload.reason || 'خطأ غير معروف',
      refType: 'preorder', refId: ev.payload.preOrderId,
      audience: ['staff'],
    });
  });

  ERP.notifications = notifications;
})(window);
