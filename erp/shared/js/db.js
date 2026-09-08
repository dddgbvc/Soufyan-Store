/* ==========================================================================
   Soufyan ERP — Storage layer
   طبقة تخزين مشتركة (localStorage) بمساحات أسماء وإصدارات.
   كل نظام يقرأ ويكتب عبرها فقط — لا يلمس localStorage مباشرة.
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var NS = 'soufyan.erp.v1';
  var memory = {};           // fallback عند تعطّل التخزين (وضع خاص / حصة ممتلئة)
  var available = (function () {
    try {
      var k = NS + '.probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  function key(name) { return NS + '.' + name; }

  function read(name, fallback) {
    try {
      var raw = available ? localStorage.getItem(key(name)) : memory[name];
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[erp.db] read failed:', name, e);
      return fallback;
    }
  }

  function write(name, value) {
    var raw = JSON.stringify(value);
    try {
      if (available) localStorage.setItem(key(name), raw);
      else memory[name] = raw;
    } catch (e) {
      // الحصة ممتلئة → أكمل في الذاكرة ونبّه المستخدم مرة واحدة
      available = false;
      memory[name] = raw;
      if (!write._warned) {
        write._warned = true;
        console.warn('[erp.db] storage unavailable, falling back to memory', e);
        if (ERP.ui && ERP.ui.toast) ERP.ui.toast('تعذّر الحفظ الدائم — البيانات محفوظة مؤقتًا بالذاكرة', 'bad');
      }
    }
    return value;
  }

  function remove(name) {
    try { if (available) localStorage.removeItem(key(name)); } catch (e) { /* ignore */ }
    delete memory[name];
  }

  /**
   * مجموعة بيانات بسيطة (مصفوفة كائنات لها id).
   */
  function collection(name) {
    var api = {
      name: name,
      all: function () { return read(name, []); },
      get: function (id) {
        return api.all().filter(function (r) { return r.id === id; })[0] || null;
      },
      find: function (predicate) { return api.all().filter(predicate)[0] || null; },
      query: function (predicate) { return api.all().filter(predicate); },
      put: function (record) {
        var rows = api.all();
        var idx = -1;
        for (var i = 0; i < rows.length; i++) { if (rows[i].id === record.id) { idx = i; break; } }
        record.updatedAt = Date.now();
        if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], record);
        else { record.createdAt = record.createdAt || Date.now(); rows.push(record); }
        write(name, rows);
        return record;
      },
      putMany: function (records) { records.forEach(api.put); return records; },
      remove: function (id) {
        write(name, api.all().filter(function (r) { return r.id !== id; }));
      },
      clear: function () { write(name, []); },
      count: function () { return api.all().length; }
    };
    return api;
  }

  /** إعداد عام (مفتاح/قيمة). */
  var settings = {
    get: function (k, fallback) {
      var all = read('settings', {});
      return Object.prototype.hasOwnProperty.call(all, k) ? all[k] : fallback;
    },
    set: function (k, v) {
      var all = read('settings', {});
      all[k] = v;
      write('settings', all);
      return v;
    },
    all: function () { return read('settings', {}); }
  };

  /** تصدير/استيراد كل بيانات الـERP (نسخة احتياطية). */
  function exportAll() {
    var out = { _ns: NS, _at: Date.now(), data: {} };
    ['models', 'devices', 'customers', 'staff', 'inspections', 'settings'].forEach(function (n) {
      out.data[n] = read(n, n === 'settings' ? {} : []);
    });
    return out;
  }

  function importAll(payload) {
    if (!payload || payload._ns !== NS || !payload.data) throw new Error('ملف نسخة احتياطية غير صالح');
    Object.keys(payload.data).forEach(function (n) { write(n, payload.data[n]); });
    return true;
  }

  ERP.db = {
    read: read,
    write: write,
    remove: remove,
    collection: collection,
    settings: settings,
    exportAll: exportAll,
    importAll: importAll,
    isPersistent: function () { return available; }
  };
})(window);
