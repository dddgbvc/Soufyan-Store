/* ============================================================
   domain/customers.js — العملاء
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { store, util: U } = ERP;

  const customers = {
    all() { return store.customers(); },
    get(id) { return store.customer(id); },

    search(query, limit = 8) {
      const list = store.customers();
      if (!query || !query.trim()) return list.slice(0, limit);
      return list
        .filter((c) => U.matchQuery(query, c.name, c.phone, c.notes))
        .slice(0, limit);
    },

    findByPhone(phone) {
      const p = U.phoneIntl(phone);
      return store.customers().find((c) => U.phoneIntl(c.phone) === p) || null;
    },

    create({ name, phone, notes = '' }) {
      const clean = String(name || '').trim();
      if (!clean) throw new Error('اسم العميل مطلوب');
      if (!U.isValidPhone(phone)) throw new Error('رقم الهاتف غير صالح');
      const existing = customers.findByPhone(phone);
      if (existing) return existing;

      const c = {
        id: U.uid('cus'),
        name: clean,
        phone: String(phone).trim(),
        notes: notes.trim(),
        tags: [],
        createdAt: U.nowISO(),
      };
      store.update((s) => s.customers.unshift(c));
      ERP.events.log('CUSTOMER_CREATED', { customerId: c.id, name: c.name });
      return c;
    },

    update(id, patch) {
      return store.update((s) => {
        const c = s.customers.find((x) => x.id === id);
        if (!c) return null;
        ['name', 'phone', 'notes'].forEach((k) => { if (k in patch) c[k] = patch[k]; });
        return c;
      });
    },

    remove(id) {
      const linked = store.preOrders().some((o) => o.customerId === id);
      if (linked) throw new Error('لا يمكن حذف عميل مرتبط بطلبات مسبقة');
      store.update((s) => {
        const i = s.customers.findIndex((x) => x.id === id);
        if (i > -1) s.customers.splice(i, 1);
      });
      return true;
    },

    /** ملف العميل: طلباته ومبيعاته */
    profile(id) {
      const customer = store.customer(id);
      if (!customer) return null;
      const orders = store.preOrders().filter((o) => o.customerId === id);
      const purchases = ERP.sales.byCustomer(id);
      return {
        customer,
        orders,
        purchases,
        openCount: orders.filter((o) => ERP.preorder.META[o.status].open).length,
        spent: purchases.reduce((a, s) => a + s.total, 0),
      };
    },
  };

  ERP.customers = customers;
})(window);
