/* ==========================================================================
   Soufyan ERP — Customer architecture (مشتركة)
   يستخدمها: فحص الجهاز · تجربة 24 ساعة · الحجز المسبق
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var customers = ERP.db.collection('customers');

  var SEED = [
    { id: 'cus_seed_1', name: 'أحمد الجبوري',  phone: '07731644450', city: 'سامراء — الحويش', note: 'زبون دائم' },
    { id: 'cus_seed_2', name: 'مصطفى العزاوي', phone: '07744485771', city: 'سامراء — الشارع الرئيسي', note: '' },
    { id: 'cus_seed_3', name: 'زينب حسن',      phone: '07701122334', city: 'بلد', note: 'استبدال جهاز' },
    { id: 'cus_seed_4', name: 'عمر السامرائي', phone: '07809988776', city: 'سامراء', note: '' }
  ];

  function seed() {
    if (customers.count() === 0) {
      customers.putMany(SEED.map(function (c) { return Object.assign({ createdAt: Date.now() }, c); }));
    }
  }

  function normalizePhone(v) { return String(v || '').replace(/[^\d+]/g, ''); }

  function search(q) {
    var term = String(q || '').trim().toLowerCase();
    var rows = customers.all().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
    if (!term) return rows;
    return rows.filter(function (r) {
      return [r.name, r.phone, r.city, r.note].join(' ').toLowerCase().indexOf(term) >= 0;
    });
  }

  function create(input) {
    var name = String(input.name || '').trim();
    if (!name) throw new Error('اسم الزبون مطلوب');
    var phone = normalizePhone(input.phone);
    var existing = phone ? customers.find(function (r) { return normalizePhone(r.phone) === phone; }) : null;
    if (existing) return existing;
    return customers.put({
      id: ERP.uid('cus'),
      name: name,
      phone: phone || null,
      city: input.city || null,
      note: input.note || null,
      createdAt: Date.now()
    });
  }

  ERP.customers = {
    store: customers,
    seed: seed,
    search: search,
    create: create,
    get: function (id) { return customers.get(id); },
    label: function (id) {
      var c = id && customers.get(id);
      return c ? c.name : null;
    }
  };
})(window);
