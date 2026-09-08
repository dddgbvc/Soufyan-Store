/* ==========================================================================
   Soufyan ERP — Inventory architecture (مشتركة بين كل الأنظمة)
   models   : كتالوج الموديلات + قدرات كل موديل (تُستخدم لتوسيع/تقليص الفحوصات)
   devices  : وحدات الأجهزة الفعلية (IMEI / Serial) سواء مخزون أو جهاز زبون
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var models = ERP.db.collection('models');
  var devices = ERP.db.collection('devices');

  /* ---- IMEI helpers ----------------------------------------------------- */
  var imei = {
    clean: function (v) { return String(v || '').replace(/\D/g, ''); },

    /** رقم التحقق (Luhn) لأول 14 خانة. */
    checkDigit: function (first14) {
      var digits = imei.clean(first14).slice(0, 14);
      if (digits.length !== 14) return null;
      var sum = 0;
      for (var i = 0; i < 14; i++) {
        var d = Number(digits[i]);
        // خانات الترتيب الزوجي (من اليسار، صفرية الفهرسة: 1,3,5…) تُضاعف
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
      }
      return (10 - (sum % 10)) % 10;
    },

    isValid: function (v) {
      var d = imei.clean(v);
      if (d.length !== 15) return false;
      return String(imei.checkDigit(d.slice(0, 14))) === d[14];
    },

    /** Type Allocation Code — أول 8 خانات (تحدد الشركة/الموديل). */
    tac: function (v) { return imei.clean(v).slice(0, 8); },

    /**
     * وصف الحالة للمستخدم: صالح / ناقص / رقم تحقق خاطئ.
     */
    validate: function (v) {
      var d = imei.clean(v);
      if (!d.length) return { ok: false, code: 'empty', message: 'أدخل رقم IMEI' };
      if (d.length < 15) return { ok: false, code: 'short', message: 'الرقم ناقص — IMEI يتكوّن من 15 رقمًا (' + d.length + '/15)' };
      if (d.length > 15) return { ok: false, code: 'long', message: 'الرقم أطول من 15 رقمًا' };
      if (!imei.isValid(d)) {
        return {
          ok: false, code: 'checksum',
          message: 'رقم التحقق غير مطابق (Luhn) — تأكد من قراءة الرقم',
          expected: imei.checkDigit(d.slice(0, 14))
        };
      }
      return { ok: true, code: 'valid', message: 'IMEI صالح', tac: imei.tac(d) };
    },

    /** يبني IMEI كامل من 14 خانة (يُستخدم في البيانات التجريبية والإدخال اليدوي). */
    complete: function (first14) {
      var d = imei.clean(first14).slice(0, 14);
      var c = imei.checkDigit(d);
      return c === null ? null : d + c;
    }
  };

  /* ---- Capabilities ------------------------------------------------------ */
  var DEFAULT_CAPS = {
    formFactor: 'phone',
    cellular: true, wifi: true, bluetooth: true, gps: true, nfc: false,
    faceId: false, fingerprint: true, vibration: true, torch: true,
    wirelessCharging: false, headphoneJack: false, dualSim: true, esim: false,
    gyroscope: true, compass: true, barometer: false, proximity: true, ambientLight: true,
    frontCamera: true, rearCameras: 1, ultraWide: false, telephoto: false, macro: false,
    stereoSpeakers: false, secondaryMic: true, alwaysOnDisplay: false, foldable: false
  };

  function capsFor(device) {
    var model = device && device.modelId ? models.get(device.modelId) : null;
    return Object.assign({}, DEFAULT_CAPS, (model && model.caps) || {}, (device && device.capsOverride) || {});
  }

  /* ---- Seed data (كتالوج مطابق لكتالوج المتجر) -------------------------- */
  var SEED_MODELS = [
    { id: 'mdl_s24u', brand: 'Samsung', model: 'Galaxy S24 Ultra', os: 'Android', osDefault: 'Android 14 · One UI 6.1',
      variants: ['SM-S928B'], storages: ['256GB', '512GB', '1TB'], colors: ['Titanium Gray', 'Titanium Black', 'Titanium Violet'],
      caps: { nfc: true, faceId: false, fingerprint: true, wirelessCharging: true, esim: true, rearCameras: 4, ultraWide: true, telephoto: true, stereoSpeakers: true, barometer: true } },

    { id: 'mdl_ip15pm', brand: 'Apple', model: 'iPhone 15 Pro Max', os: 'iOS', osDefault: 'iOS 17',
      variants: ['A2849'], storages: ['256GB', '512GB', '1TB'], colors: ['Natural Titanium', 'Blue Titanium', 'Black Titanium'],
      caps: { nfc: true, faceId: true, fingerprint: false, wirelessCharging: true, esim: true, dualSim: true, rearCameras: 3, ultraWide: true, telephoto: true, stereoSpeakers: true, barometer: true } },

    { id: 'mdl_ip15', brand: 'Apple', model: 'iPhone 15', os: 'iOS', osDefault: 'iOS 17',
      variants: ['A3090'], storages: ['128GB', '256GB', '512GB'], colors: ['Black', 'Blue', 'Pink', 'Yellow'],
      caps: { nfc: true, faceId: true, fingerprint: false, wirelessCharging: true, esim: true, rearCameras: 2, ultraWide: true, stereoSpeakers: true, barometer: true } },

    { id: 'mdl_ip13', brand: 'Apple', model: 'iPhone 13', os: 'iOS', osDefault: 'iOS 16',
      variants: ['A2633'], storages: ['128GB', '256GB'], colors: ['Midnight', 'Starlight', 'Blue', 'Red'],
      caps: { nfc: true, faceId: true, fingerprint: false, wirelessCharging: true, esim: true, rearCameras: 2, ultraWide: true, stereoSpeakers: true, barometer: true } },

    { id: 'mdl_a55', brand: 'Samsung', model: 'Galaxy A55', os: 'Android', osDefault: 'Android 14 · One UI 6.1',
      variants: ['SM-A556E'], storages: ['128GB', '256GB'], colors: ['Awesome Navy', 'Awesome Iceblue', 'Awesome Lilac'],
      caps: { nfc: true, rearCameras: 3, ultraWide: true, macro: true, stereoSpeakers: true } },

    { id: 'mdl_a15', brand: 'Samsung', model: 'Galaxy A15', os: 'Android', osDefault: 'Android 14 · One UI 6',
      variants: ['SM-A155F'], storages: ['128GB', '256GB'], colors: ['Blue Black', 'Light Blue', 'Yellow'],
      caps: { nfc: false, rearCameras: 3, ultraWide: true, macro: true, headphoneJack: true, gyroscope: false, compass: false } },

    { id: 'mdl_rn13p', brand: 'Xiaomi', model: 'Redmi Note 13 Pro', os: 'Android', osDefault: 'Android 13 · MIUI 14',
      variants: ['2312DRA50G'], storages: ['128GB', '256GB'], colors: ['Midnight Black', 'Aurora Purple', 'Ocean Teal'],
      caps: { nfc: true, rearCameras: 3, ultraWide: true, macro: true, headphoneJack: true, stereoSpeakers: true } },

    { id: 'mdl_pocox6p', brand: 'Xiaomi', model: 'Poco X6 Pro', os: 'Android', osDefault: 'Android 14 · HyperOS',
      variants: ['24069PC21G'], storages: ['256GB', '512GB'], colors: ['Black', 'Grey', 'Yellow'],
      caps: { nfc: true, rearCameras: 3, ultraWide: true, macro: true, stereoSpeakers: true, headphoneJack: false } },

    { id: 'mdl_r13c', brand: 'Xiaomi', model: 'Redmi 13C', os: 'Android', osDefault: 'Android 13 · MIUI 14',
      variants: ['23100RN82L'], storages: ['128GB', '256GB'], colors: ['Midnight Black', 'Navy Blue', 'Clover Green'],
      caps: { nfc: false, rearCameras: 3, macro: true, headphoneJack: true, gyroscope: false, compass: false } },

    { id: 'mdl_note40p', brand: 'Infinix', model: 'Note 40 Pro', os: 'Android', osDefault: 'Android 14 · XOS 14',
      variants: ['X6850'], storages: ['256GB'], colors: ['Obsidian Black', 'Titan Gold', 'Vintage Green'],
      caps: { nfc: true, rearCameras: 3, ultraWide: true, macro: true, wirelessCharging: true, stereoSpeakers: true } },

    { id: 'mdl_hot40i', brand: 'Infinix', model: 'Hot 40i', os: 'Android', osDefault: 'Android 13 · XOS 13',
      variants: ['X6528'], storages: ['128GB', '256GB'], colors: ['Starlit Black', 'Palm Blue', 'Horizon Gold'],
      caps: { nfc: false, rearCameras: 2, macro: true, headphoneJack: true, gyroscope: false, compass: false } },

    { id: 'mdl_tabs9fe', brand: 'Samsung', model: 'Galaxy Tab S9 FE (Wi-Fi)', os: 'Android', osDefault: 'Android 14 · One UI 6',
      variants: ['SM-X510'], storages: ['128GB', '256GB'], colors: ['Gray', 'Mint', 'Silver'],
      caps: { formFactor: 'tablet', cellular: false, dualSim: false, esim: false, nfc: false, faceId: false, fingerprint: true,
              vibration: false, rearCameras: 1, stereoSpeakers: true, headphoneJack: true, barometer: false, proximity: false } }
  ];

  // 14 خانة فقط — رقم التحقق يُحسب تلقائيًا حتى تبقى الأرقام صالحة دائمًا.
  var SEED_DEVICES = [
    { modelId: 'mdl_ip15pm', imei14: '35328711234567', serial: 'F2LX9QK7PLJM', storage: '256GB', color: 'Natural Titanium', osVersion: 'iOS 17.5.1', status: 'in_stock', ownership: 'stock', location: 'رف A1' },
    { modelId: 'mdl_s24u',   imei14: '35674509876543', serial: 'RF8W20JQKZL',  storage: '512GB', color: 'Titanium Black',   osVersion: 'Android 14 · One UI 6.1', status: 'in_stock', ownership: 'stock', location: 'رف A2' },
    { modelId: 'mdl_ip13',   imei14: '35291607654321', serial: 'DX3H8N2QWERT', storage: '128GB', color: 'Midnight',         osVersion: 'iOS 16.7.8', status: 'in_service', ownership: 'customer', location: 'قسم الصيانة' },
    { modelId: 'mdl_a55',    imei14: '35770212345678', serial: 'RZ8T61MKPQA',  storage: '256GB', color: 'Awesome Navy',     osVersion: 'Android 14 · One UI 6.1', status: 'in_stock', ownership: 'stock', location: 'رف B1' },
    { modelId: 'mdl_rn13p',  imei14: '86991204567890', serial: 'XM24P7K19DD',  storage: '256GB', color: 'Aurora Purple',    osVersion: 'Android 13 · MIUI 14.0.6', status: 'reserved', ownership: 'stock', location: 'رف B3' },
    { modelId: 'mdl_r13c',   imei14: '86754301122334', serial: 'XM13C55ATRQ',  storage: '128GB', color: 'Navy Blue',        osVersion: 'Android 13 · MIUI 14.0.2', status: 'in_stock', ownership: 'stock', location: 'رف C1' },
    { modelId: 'mdl_note40p',imei14: '86112390011223', serial: 'INX40P8821K',  storage: '256GB', color: 'Titan Gold',       osVersion: 'Android 14 · XOS 14', status: 'in_stock', ownership: 'stock', location: 'رف C2' },
    { modelId: 'mdl_a15',    imei14: '35880155667788', serial: 'RZ9A15TTPLM',  storage: '128GB', color: 'Light Blue',       osVersion: 'Android 14 · One UI 6', status: 'external', ownership: 'trade_in', location: 'استلام' },
    { modelId: 'mdl_tabs9fe',imei14: '35990177889900', serial: 'RQ9TABS9FE12', storage: '128GB', color: 'Mint',             osVersion: 'Android 14 · One UI 6', status: 'in_stock', ownership: 'stock', location: 'رف D1' }
  ];

  function seed() {
    if (models.count() === 0) {
      models.putMany(SEED_MODELS.map(function (m) { return Object.assign({}, m); }));
    }
    if (devices.count() === 0) {
      devices.putMany(SEED_DEVICES.map(function (d, i) {
        var m = models.get(d.modelId) || {};
        return {
          id: 'dev_seed_' + (i + 1),
          modelId: d.modelId,
          brand: m.brand, model: m.model,
          variant: (m.variants && m.variants[0]) || '—',
          storage: d.storage, color: d.color,
          imei: imei.complete(d.imei14),
          imei2: null,
          serial: d.serial,
          osVersion: d.osVersion || m.osDefault || '—',
          status: d.status, ownership: d.ownership,
          location: d.location,
          customerId: null,
          createdAt: Date.now() - (i + 2) * 86400000
        };
      }));
    }
  }

  /* ---- Queries ----------------------------------------------------------- */
  function findByImei(value) {
    var d = imei.clean(value);
    if (!d) return null;
    return devices.find(function (r) { return imei.clean(r.imei) === d || imei.clean(r.imei2 || '') === d; });
  }

  function findBySerial(value) {
    var s = String(value || '').trim().toUpperCase();
    if (!s) return null;
    return devices.find(function (r) { return String(r.serial || '').toUpperCase() === s; });
  }

  function search(q) {
    var term = String(q || '').trim().toLowerCase();
    var rows = devices.all().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (!term) return rows;
    return rows.filter(function (r) {
      return [r.brand, r.model, r.variant, r.storage, r.color, r.imei, r.serial, r.osVersion, r.location]
        .join(' ').toLowerCase().indexOf(term) >= 0;
    });
  }

  /** موديلات مقترحة لنفس الـTAC (تعرّف تقريبي على الجهاز غير المسجّل). */
  function guessByTac(value) {
    var tac = imei.tac(value);
    if (tac.length < 8) return null;
    var match = devices.find(function (r) { return imei.tac(r.imei) === tac; });
    return match ? models.get(match.modelId) : null;
  }

  function createDevice(input) {
    var m = input.modelId ? models.get(input.modelId) : null;
    var record = {
      id: ERP.uid('dev'),
      modelId: input.modelId || null,
      brand: input.brand || (m && m.brand) || '—',
      model: input.model || (m && m.model) || '—',
      variant: input.variant || (m && m.variants && m.variants[0]) || '—',
      storage: input.storage || '—',
      color: input.color || '—',
      imei: imei.clean(input.imei) || null,
      imei2: input.imei2 ? imei.clean(input.imei2) : null,
      serial: (input.serial || '').trim().toUpperCase() || null,
      osVersion: input.osVersion || (m && m.osDefault) || '—',
      status: input.status || 'external',
      ownership: input.ownership || 'customer',
      customerId: input.customerId || null,
      location: input.location || null,
      capsOverride: input.capsOverride || null,
      note: input.note || null,
      createdAt: Date.now()
    };
    return devices.put(record);
  }

  function label(device) {
    if (!device) return '—';
    return [device.brand, device.model].filter(Boolean).join(' ');
  }

  var STATUS_LABELS = {
    in_stock: 'في المخزن',
    sold: 'مباع',
    reserved: 'محجوز',
    in_service: 'في الصيانة',
    external: 'جهاز خارجي'
  };

  var OWNERSHIP_LABELS = {
    stock: 'مخزون المحل',
    customer: 'جهاز زبون',
    trade_in: 'استبدال / شراء',
    service: 'صيانة'
  };

  ERP.inventory = {
    models: models,
    devices: devices,
    imei: imei,
    seed: seed,
    capsFor: capsFor,
    defaultCaps: DEFAULT_CAPS,
    findByImei: findByImei,
    findBySerial: findBySerial,
    guessByTac: guessByTac,
    search: search,
    create: createDevice,
    get: function (id) { return devices.get(id); },
    update: function (id, patch) {
      var row = devices.get(id);
      if (!row) return null;
      return devices.put(Object.assign({}, row, patch, { id: id }));
    },
    label: label,
    statusLabel: function (s) { return STATUS_LABELS[s] || s || '—'; },
    ownershipLabel: function (s) { return OWNERSHIP_LABELS[s] || s || '—'; },
    statusLabels: STATUS_LABELS,
    ownershipLabels: OWNERSHIP_LABELS
  };
})(window);
