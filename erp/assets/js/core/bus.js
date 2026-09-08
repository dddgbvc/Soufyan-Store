/* ============================================================
   core/bus.js — ناقل أحداث داخلي (Domain Event Bus)
   يفصل منطق العمل عن الواجهة وعن مزوّدي الاتصال.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});

  const listeners = new Map();   // type -> Set<fn>
  const ANY = '*';

  const bus = {
    /** الاشتراك بنوع حدث (أو '*' لكل الأحداث). يعيد دالة إلغاء الاشتراك. */
    on(type, fn) {
      const types = Array.isArray(type) ? type : [type];
      types.forEach((t) => {
        if (!listeners.has(t)) listeners.set(t, new Set());
        listeners.get(t).add(fn);
      });
      return () => types.forEach((t) => listeners.get(t) && listeners.get(t).delete(fn));
    },

    once(type, fn) {
      const off = bus.on(type, (payload, meta) => { off(); fn(payload, meta); });
      return off;
    },

    off(type, fn) {
      if (listeners.has(type)) listeners.get(type).delete(fn);
    },

    /** إطلاق حدث. الأخطاء في المستمعين لا توقف بقية المستمعين. */
    emit(type, payload) {
      const meta = { type, at: Date.now() };
      const run = (fn) => {
        try { fn(payload, meta); }
        catch (err) { console.error(`[bus] listener error on "${type}"`, err); }
      };
      if (listeners.has(type)) Array.from(listeners.get(type)).forEach(run);
      if (listeners.has(ANY)) Array.from(listeners.get(ANY)).forEach(run);
      return payload;
    },

    clear() { listeners.clear(); },
  };

  ERP.bus = bus;
})(window);
