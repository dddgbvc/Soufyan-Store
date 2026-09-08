/* ============================================================
   core/store.js — مخزن الحالة + الحفظ المحلي
   مصدر الحقيقة الوحيد للنظام. كل تعديل يمرّ عبر update().
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const bus = ERP.bus;

  const KEY = 'soufyan.erp.preorder.v1';
  let state = null;
  let saveTimer = null;
  let batching = 0;
  let dirty = false;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.preOrders)) return null;
      return migrate(parsed);
    } catch (err) {
      console.warn('[store] تعذّر قراءة البيانات المحفوظة، سيتم البدء من جديد.', err);
      return null;
    }
  }

  function migrate(s) {
    s.outbox = s.outbox || [];
    s.notifications = s.notifications || [];
    s.events = s.events || [];
    s.sales = s.sales || [];
    s.templates = s.templates || [];
    s.counters = s.counters || { preorder: s.preOrders.length, sale: s.sales.length };
    return s;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      dirty = false;
    } catch (err) {
      console.error('[store] فشل الحفظ المحلي', err);
      bus.emit('store:save-failed', { error: err });
    }
  }

  function schedulePersist() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 180);
  }

  const store = {
    init() {
      state = load() || ERP.seed.build();
      persist();
      bus.emit('store:ready', state);
      return state;
    },

    get state() { return state; },

    /**
     * تعديل الحالة. mutator يستلم الحالة ويعدّلها مباشرة.
     * @returns القيمة التي يعيدها mutator (مفيد لإرجاع الكيان المنشأ)
     */
    update(mutator, meta = {}) {
      const result = mutator(state);
      schedulePersist();
      if (!batching) bus.emit('store:changed', meta);
      return result;
    },

    /** تجميع عدة تعديلات في إشعار واحد للواجهة */
    batch(fn, meta = {}) {
      batching++;
      let out;
      try { out = fn(); }
      finally {
        batching--;
        if (!batching) bus.emit('store:changed', meta);
      }
      return out;
    },

    /* ---------------- محدِّدات (Selectors) ---------------- */
    preOrders() { return state.preOrders; },
    preOrder(id) { return state.preOrders.find((o) => o.id === id) || null; },
    customers() { return state.customers; },
    customer(id) { return state.customers.find((c) => c.id === id) || null; },
    products() { return state.products; },
    product(id) { return state.products.find((p) => p.id === id) || null; },
    variant(id) {
      for (const p of state.products) {
        const v = p.variants.find((x) => x.id === id);
        if (v) return v;
      }
      return null;
    },
    productOfVariant(id) {
      return state.products.find((p) => p.variants.some((v) => v.id === id)) || null;
    },
    stockItems() { return state.stockItems; },
    stockItem(id) { return state.stockItems.find((s) => s.id === id) || null; },
    sales() { return state.sales; },
    sale(id) { return state.sales.find((s) => s.id === id) || null; },
    templates() { return state.templates; },
    template(id) { return state.templates.find((t) => t.id === id) || null; },
    settings() { return state.settings; },

    nextCode(kind) {
      return store.update((s) => {
        const year = new Date().getFullYear();
        if (kind === 'preorder') {
          s.counters.preorder += 1;
          return 'PO-' + year + '-' + String(s.counters.preorder).padStart(4, '0');
        }
        s.counters.sale += 1;
        return 'INV-' + year + '-' + String(s.counters.sale).padStart(4, '0');
      });
    },

    /* ---------------- صيانة ---------------- */
    flush() { clearTimeout(saveTimer); if (dirty) persist(); },

    exportJSON() { return JSON.stringify(state, null, 2); },

    importJSON(json) {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      if (!parsed || !Array.isArray(parsed.preOrders)) throw new Error('ملف غير صالح');
      state = migrate(parsed);
      persist();
      bus.emit('store:changed', { reason: 'import' });
    },

    resetToSeed() {
      state = ERP.seed.build();
      persist();
      bus.emit('store:changed', { reason: 'reset' });
    },

    wipe() {
      state = ERP.seed.build();
      state.preOrders = []; state.sales = []; state.events = [];
      state.notifications = []; state.outbox = [];
      state.counters = { preorder: 0, sale: 0 };
      persist();
      bus.emit('store:changed', { reason: 'wipe' });
    },
  };

  global.addEventListener('beforeunload', store.flush);

  ERP.store = store;
})(window);
