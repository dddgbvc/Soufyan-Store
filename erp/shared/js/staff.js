/* ==========================================================================
   Soufyan ERP — Staff / Inspectors (مشتركة)
   الفاحص المسؤول يُسجَّل في كل تقرير فحص.
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var staff = ERP.db.collection('staff');

  var SEED = [
    { id: 'stf_seed_1', name: 'سفيان',        role: 'مدير المركز' },
    { id: 'stf_seed_2', name: 'حيدر — الفني', role: 'فني صيانة' },
    { id: 'stf_seed_3', name: 'مروان — البيع', role: 'مبيعات' }
  ];

  function seed() {
    if (staff.count() === 0) {
      staff.putMany(SEED.map(function (s) { return Object.assign({ createdAt: Date.now() }, s); }));
    }
  }

  function create(input) {
    var name = String(input.name || '').trim();
    if (!name) throw new Error('اسم الفاحص مطلوب');
    var existing = staff.find(function (r) { return r.name === name; });
    if (existing) return existing;
    return staff.put({ id: ERP.uid('stf'), name: name, role: input.role || 'فاحص', createdAt: Date.now() });
  }

  ERP.staff = {
    store: staff,
    seed: seed,
    all: function () { return staff.all(); },
    get: function (id) { return staff.get(id); },
    create: create,
    label: function (id) {
      var s = id && staff.get(id);
      return s ? s.name : null;
    },
    /** آخر فاحص مستخدم — لتسريع بدء الفحص. */
    lastUsed: function () {
      var id = ERP.db.settings.get('lastInspectorId', null);
      return (id && staff.get(id)) || staff.all()[0] || null;
    },
    remember: function (id) { ERP.db.settings.set('lastInspectorId', id); }
  };
})(window);
