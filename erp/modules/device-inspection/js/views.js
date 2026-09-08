/* ==========================================================================
   فحص الجهاز — الشاشات: بدء الفحص · التعرّف على الجهاز · مساحة الفحص
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var DI = global.DI;
  var cat = DI.catalog;
  var engine = DI.engine;
  var S = cat.STATUS;
  var el = ERP.el, $ = ERP.$, clear = ERP.clear;

  var views = DI.views = DI.views || {};
  var cleanups = [];

  function registerCleanup(fn) { if (typeof fn === 'function') cleanups.push(fn); }

  function runCleanups() {
    cleanups.splice(0).forEach(function (fn) { try { fn(); } catch (e) { console.warn(e); } });
  }
  views.cleanup = runCleanups;

  function mountScreen(children) {
    runCleanups();
    var app = $('#app');
    clear(app);
    ERP.append(app, children);
    app.scrollTop = 0;
    global.scrollTo({ top: 0, behavior: 'auto' });
    return app;
  }

  function go(path) { DI.app.router.go(path); }

  /* ======================================================================
     شاشة البداية — فحص جهاز جديد
     ====================================================================== */
  views.home = function () {
    var active = engine.activeSession();
    var recent = engine.listAll().slice(0, 5);
    var devices = ERP.inventory.devices.count();
    var today = engine.listAll().filter(function (r) {
      return r.finishedAt && (Date.now() - r.finishedAt) < 86400000;
    });
    var avg = recent.length
      ? Math.round(recent.reduce(function (a, r) { return a + ((r.summary && r.summary.score) || 0); }, 0) / recent.length)
      : null;

    var methods = [
      { id: 'scan', ar: 'مسح IMEI', en: 'Scan IMEI', icon: 'scan', desc: 'استخدم الكاميرا لقراءة باركود IMEI من العلبة أو الشاشة.', onClick: views.scanImei },
      { id: 'enter', ar: 'إدخال IMEI', en: 'Enter IMEI', icon: 'keyboard', desc: 'اكتب الرقم يدويًا مع تحقق فوري من صحّته.', onClick: views.enterImei },
      { id: 'select', ar: 'اختيار جهاز', en: 'Select Device', icon: 'list', desc: 'اختر من أجهزة المخزون أو أجهزة الزبائن المسجّلة.', onClick: views.selectDevice }
    ];

    mountScreen([
      el('section.hero.enter', {}, [
        el('.hero__text', {}, [
          el('span.badge.badge--info', { text: 'نظام مستقل داخل ERP' }),
          el('h1', { text: 'فحص جهاز جديد' }),
          el('p.sub', { text: 'افحص حالة الهاتف الفنية قبل البيع أو الشراء أو الاستلام أو الصيانة — ١٨ مرحلة، نتيجة رقمية، وتقرير قابل للطباعة.' })
        ]),
        el('.hero__stats.glass', {}, [
          statTile('أجهزة مسجّلة', devices),
          statTile('فحوصات اليوم', today.length),
          statTile('متوسط آخر النتائج', avg === null ? '—' : avg + '/100')
        ])
      ]),

      active ? el('.resume.glass.enter.enter-1', {}, [
        el('.row', {}, [
          el('span.resume__pulse'),
          el('div.grow', {}, [
            el('strong', { text: 'فحص غير مكتمل: ' + active.device.brand + ' ' + active.device.model }),
            el('.micro', { text: 'بدأ ' + ERP.fmt.dateTime(active.startedAt) + ' · ' + Math.round(engine.progress(active).pct) + '% مكتمل' })
          ])
        ]),
        el('.row.wrap', {}, [
          el('button.btn.btn--primary.btn--sm', { type: 'button', text: 'أكمل الفحص', onclick: function () { go('inspect/' + active.id); } }),
          el('button.btn.btn--quiet.btn--sm', {
            type: 'button', text: 'إلغاء الفحص',
            onclick: function () {
              ERP.ui.confirm({ title: 'إلغاء الفحص؟', message: 'ستفقد نتائج هذا الفحص غير المكتمل.', confirmText: 'إلغاء الفحص', danger: true })
                .then(function (ok) { if (ok) { engine.abandon(active); views.home(); } });
            }
          })
        ])
      ]) : null,

      el('h2.section-title.enter.enter-1', { text: 'ابدأ بالتعرّف على الجهاز' }),
      el('.methods.enter.enter-2', {}, methods.map(function (m) {
        return el('button.method.card', { type: 'button', onclick: m.onClick }, [
          el('.method__icon', { html: ERP.icon(m.icon, 22) }),
          el('.method__body', {}, [
            el('h3', { text: m.ar }),
            el('.method__en.mono', { text: m.en }),
            el('p.sub', { text: m.desc })
          ]),
          el('.method__go', { html: ERP.icon('chevron', 18) })
        ]);
      })),

      recent.length ? el('section.enter.enter-3', {}, [
        el('.row-between', { style: { marginBottom: '12px' } }, [
          el('h2.section-title', { text: 'آخر الفحوصات' }),
          el('button.btn.btn--quiet.btn--sm', { type: 'button', text: 'كل السجل', onclick: function () { go('history'); } })
        ]),
        el('.stack', {}, recent.map(inspectionRow))
      ]) : null
    ]);
  };

  function statTile(label, value) {
    return el('.stat-tile', {}, [
      el('.stat-tile__v.mono', { text: String(value) }),
      el('.stat-tile__k', { text: label })
    ]);
  }

  function inspectionRow(row) {
    var score = row.summary ? row.summary.score : null;
    var tone = row.summary ? row.summary.grade.tone : 'mute';
    return el('button.list-row.card.card--pad-sm', {
      type: 'button', onclick: function () { go('report/' + row.id); }
    }, [
      el('.list-row__score', { dataset: { tone: tone } }, [
        el('span.mono', { text: score === null ? '—' : String(score) }),
        el('span.micro', { text: 'من 100' })
      ]),
      el('.grow', {}, [
        el('strong', { text: row.device.brand + ' ' + row.device.model }),
        el('.micro.mono', { text: ERP.fmt.imei(row.device.imei) || row.device.serial || '—' })
      ]),
      el('.list-row__meta', {}, [
        el('.micro', { text: ERP.fmt.dateShort(row.finishedAt || row.startedAt) }),
        row.summary ? el('span.badge.badge--' + row.summary.finalStatus.tone, { text: row.summary.finalStatus.ar }) : null
      ])
    ]);
  }
  views.inspectionRow = inspectionRow;

  /* ======================================================================
     التعرّف على الجهاز
     ====================================================================== */

  /** مسح IMEI بالكاميرا (BarcodeDetector) مع تراجع للإدخال اليدوي. */
  views.scanImei = function () {
    if (!ERP.caps.barcode || !ERP.caps.media) {
      ERP.ui.toast('قارئ الباركود غير متاح في هذا المتصفح — استخدم الإدخال اليدوي', 'bad', 3200);
      views.enterImei();
      return;
    }

    var video = el('video.scan__video', { autoplay: '', playsinline: '', muted: '' });
    video.muted = true;
    var status = el('.scan__status.sub', { text: 'وجّه الكاميرا نحو باركود IMEI…' });
    var stream = null, raf = null, detector = null, stopped = false;

    var handle = ERP.ui.modal({
      title: 'مسح IMEI',
      body: el('.stack', {}, [
        el('.scan', {}, [video, el('.scan__frame')]),
        status,
        el('button.btn.btn--ghost.btn--block', {
          type: 'button', text: 'إدخال الرقم يدويًا بدل المسح',
          onclick: function () { handle.close(); views.enterImei(); }
        })
      ]),
      onClose: stop
    });

    function stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }

    function loop() {
      if (stopped || !detector || video.readyState < 2) { raf = requestAnimationFrame(loop); return; }
      detector.detect(video).then(function (codes) {
        for (var i = 0; i < codes.length; i++) {
          var raw = ERP.inventory.imei.clean(codes[i].rawValue);
          if (raw.length >= 15) {
            var value = raw.slice(0, 15);
            if (ERP.inventory.imei.isValid(value)) {
              stop();
              handle.close();
              ERP.ui.toast('تمت قراءة IMEI', 'ok');
              views.resolveImei(value);
              return;
            }
            status.textContent = 'قُرئ رقم غير صالح (' + value + ') — حاول مرة أخرى.';
          }
        }
        raf = requestAnimationFrame(loop);
      }).catch(function () { raf = requestAnimationFrame(loop); });
    }

    try {
      detector = new global.BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'itf', 'qr_code', 'data_matrix'] });
    } catch (e) {
      detector = new global.BarcodeDetector();
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      .then(function (s) { stream = s; video.srcObject = s; loop(); })
      .catch(function (err) {
        status.textContent = 'تعذّر تشغيل الكاميرا: ' + (err.message || err.name);
        status.classList.add('is-bad');
      });
  };

  /** إدخال IMEI يدويًا مع تحقق Luhn فوري. */
  views.enterImei = function () {
    var input = el('input.input.input--imei', {
      type: 'text', inputmode: 'numeric', maxlength: '18', placeholder: '15 رقمًا',
      autocomplete: 'off', 'data-autofocus': '', 'aria-label': 'رقم IMEI'
    });
    var feedback = el('.field__hint', { text: 'اطبع *#06# على الجهاز لعرض الرقم.' });
    var submit = el('button.btn.btn--primary', { type: 'submit', text: 'بحث عن الجهاز', disabled: true });

    function check() {
      var value = ERP.inventory.imei.clean(input.value);
      input.value = value.replace(/(\d{6})(\d{2})(\d{1,6})/, '$1 $2 $3').trim();
      var v = ERP.inventory.imei.validate(value);
      feedback.textContent = value.length ? v.message : 'اطبع *#06# على الجهاز لعرض الرقم.';
      feedback.className = value.length && !v.ok ? 'field__error' : 'field__hint';
      submit.disabled = !v.ok;
      if (v.ok) {
        var known = ERP.inventory.findByImei(value);
        feedback.className = 'field__hint';
        feedback.textContent = known
          ? 'مسجّل في المخزون: ' + known.brand + ' ' + known.model
          : 'IMEI صالح — غير مسجّل بعد، ستُسجّله بالخطوة التالية.';
      }
    }

    var form = el('form.stack', {
      onsubmit: function (e) {
        e.preventDefault();
        var value = ERP.inventory.imei.clean(input.value);
        if (!ERP.inventory.imei.isValid(value)) return;
        handle.close();
        views.resolveImei(value);
      }
    }, [
      el('.field', {}, [el('label', { text: 'رقم IMEI' }), input, feedback]),
      el('.row', { style: { justifyContent: 'flex-end' } }, [submit])
    ]);

    input.addEventListener('input', check);
    var handle = ERP.ui.modal({ title: 'إدخال IMEI', body: form });
  };

  /** بعد الحصول على IMEI: افتح الجهاز أو اعرض تسجيله. */
  views.resolveImei = function (value) {
    var found = ERP.inventory.findByImei(value);
    if (found) { go('device/' + found.id); return; }
    var guess = ERP.inventory.guessByTac(value);
    views.registerDevice({ imei: value, modelId: guess ? guess.id : null });
  };

  /** اختيار جهاز من المخزون. */
  views.selectDevice = function () {
    ERP.ui.picker({
      title: 'اختيار جهاز',
      searchPlaceholder: 'ابحث بالماركة أو الموديل أو IMEI…',
      emptyText: 'لا يوجد جهاز مطابق — يمكنك تسجيل جهاز جديد.',
      items: function (term) {
        return ERP.inventory.search(term).map(function (d) {
          return {
            id: d.id,
            title: d.brand + ' ' + d.model + ' · ' + d.storage,
            sub: ERP.fmt.imei(d.imei) || d.serial || '',
            badge: ERP.inventory.statusLabel(d.status),
            badgeKind: d.status === 'in_stock' ? 'ok' : d.status === 'in_service' ? 'warn' : null
          };
        });
      },
      onPick: function (item) { go('device/' + item.id); },
      footer: el('button.btn.btn--ghost.btn--block', {
        type: 'button', style: { marginTop: '12px' }, text: '+ تسجيل جهاز جديد',
        onclick: function () {
          var open = document.querySelector('.modal button[aria-label="إغلاق"]');
          if (open) open.click();
          views.registerDevice({});
        }
      })
    });
  };

  /** تسجيل جهاز غير موجود في المخزون. */
  views.registerDevice = function (prefill) {
    var data = prefill || {};
    var modelSelect = el('select.select', {}, [el('option', { value: '', text: 'موديل غير مدرج (إدخال يدوي)' })]
      .concat(ERP.inventory.models.all().map(function (m) {
        return el('option', { value: m.id, text: m.brand + ' — ' + m.model, selected: data.modelId === m.id ? '' : null });
      })));

    var brand = el('input.input', { placeholder: 'مثال: Samsung', value: data.brand || '' });
    var model = el('input.input', { placeholder: 'مثال: Galaxy A55', value: data.model || '' });
    var variant = el('input.input', { placeholder: 'مثال: SM-A556E', value: data.variant || '' });
    var storage = el('input.input', { placeholder: 'مثال: 128GB', value: data.storage || '' });
    var color = el('input.input', { placeholder: 'مثال: أسود', value: data.color || '' });
    var imei = el('input.input.mono', { placeholder: '15 رقمًا', value: data.imei || '', inputmode: 'numeric' });
    var serial = el('input.input.mono', { placeholder: 'Serial', value: data.serial || '' });
    var osVersion = el('input.input', { placeholder: 'مثال: Android 14', value: data.osVersion || '' });
    var ownership = el('select.select', {}, Object.keys(ERP.inventory.ownershipLabels).map(function (k) {
      return el('option', { value: k, text: ERP.inventory.ownershipLabels[k], selected: k === 'customer' ? '' : null });
    }));

    function applyModel() {
      var m = ERP.inventory.models.get(modelSelect.value);
      if (!m) return;
      brand.value = m.brand;
      model.value = m.model;
      variant.value = (m.variants && m.variants[0]) || '';
      if (!storage.value) storage.value = (m.storages && m.storages[0]) || '';
      if (!color.value) color.value = (m.colors && m.colors[0]) || '';
      if (!osVersion.value) osVersion.value = m.osDefault || '';
    }
    modelSelect.addEventListener('change', applyModel);
    if (data.modelId) applyModel();

    var error = el('.field__error');

    var form = el('form.stack', {
      onsubmit: function (e) {
        e.preventDefault();
        var imeiValue = ERP.inventory.imei.clean(imei.value);
        if (imeiValue && !ERP.inventory.imei.isValid(imeiValue)) {
          error.textContent = 'رقم IMEI غير صالح — تحقق من الرقم أو اتركه فارغًا.';
          return;
        }
        if (!brand.value.trim() || !model.value.trim()) {
          error.textContent = 'الماركة والموديل مطلوبان.';
          return;
        }
        var device = ERP.inventory.create({
          modelId: modelSelect.value || null,
          brand: brand.value.trim(), model: model.value.trim(),
          variant: variant.value.trim(), storage: storage.value.trim(),
          color: color.value.trim(), imei: imeiValue,
          serial: serial.value.trim(), osVersion: osVersion.value.trim(),
          ownership: ownership.value,
          status: ownership.value === 'stock' ? 'in_stock' : 'external'
        });
        handle.close();
        ERP.ui.toast('تم تسجيل الجهاز', 'ok');
        go('device/' + device.id);
      }
    }, [
      el('.field', {}, [el('label', { text: 'الموديل من الكتالوج' }), modelSelect]),
      el('.form-grid', {}, [
        el('.field', {}, [el('label', { text: 'Brand — الماركة' }), brand]),
        el('.field', {}, [el('label', { text: 'Model — الموديل' }), model]),
        el('.field', {}, [el('label', { text: 'Variant — الإصدار' }), variant]),
        el('.field', {}, [el('label', { text: 'Storage — التخزين' }), storage]),
        el('.field', {}, [el('label', { text: 'Color — اللون' }), color]),
        el('.field', {}, [el('label', { text: 'OS Version — نظام التشغيل' }), osVersion]),
        el('.field', {}, [el('label', { text: 'IMEI' }), imei]),
        el('.field', {}, [el('label', { text: 'Serial — الرقم التسلسلي' }), serial])
      ]),
      el('.field', {}, [el('label', { text: 'ملكية الجهاز' }), ownership]),
      error,
      el('.row', { style: { justifyContent: 'flex-end' } }, [
        el('button.btn.btn--primary', { type: 'submit', text: 'تسجيل وبدء الفحص' })
      ])
    ]);

    var handle = ERP.ui.modal({ title: 'تسجيل جهاز جديد', body: form });
  };

  /* ======================================================================
     شاشة الجهاز — الهوية وإعداد الفحص
     ====================================================================== */
  views.device = function (deviceId) {
    var device = ERP.inventory.get(deviceId);
    if (!device) { ERP.ui.toast('الجهاز غير موجود', 'bad'); go(''); return; }

    var caps = ERP.inventory.capsFor(device);
    var history = engine.listForDevice(device.id);
    var setup = {
      purpose: 'sale',
      inspectorId: (ERP.staff.lastUsed() || {}).id || null,
      customerId: device.customerId || null
    };

    var identity = [
      ['Brand — الماركة', device.brand],
      ['Model — الموديل', device.model],
      ['Variant — الإصدار', device.variant],
      ['Storage — التخزين', device.storage],
      ['Color — اللون', device.color],
      ['IMEI', ERP.fmt.imei(device.imei) || '—'],
      ['Serial — التسلسلي', device.serial || '—'],
      ['OS Version — النظام', device.osVersion]
    ];

    var purposeRow = el('.row.wrap');
    cat.PURPOSES.forEach(function (p) {
      purposeRow.appendChild(el('button.chip', {
        type: 'button', 'aria-pressed': setup.purpose === p.id ? 'true' : 'false',
        html: ERP.icon(p.icon, 15) + '<span>' + p.ar + '</span>',
        onclick: function () {
          setup.purpose = p.id;
          ERP.$$('.chip', purposeRow).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
          this.setAttribute('aria-pressed', 'true');
        }
      }));
    });

    var inspectorSelect = el('select.select', {}, ERP.staff.all().map(function (s) {
      return el('option', { value: s.id, text: s.name + ' — ' + s.role, selected: s.id === setup.inspectorId ? '' : null });
    }).concat([el('option', { value: '__new', text: '+ فاحص جديد…' })]));

    inspectorSelect.addEventListener('change', function () {
      if (inspectorSelect.value === '__new') {
        var name = el('input.input', { placeholder: 'اسم الفاحص', 'data-autofocus': '' });
        var role = el('input.input', { placeholder: 'الدور (مثال: فني صيانة)' });
        var h = ERP.ui.modal({
          title: 'إضافة فاحص',
          body: el('.stack', {}, [
            el('.field', {}, [el('label', { text: 'الاسم' }), name]),
            el('.field', {}, [el('label', { text: 'الدور' }), role])
          ]),
          actions: [el('button.btn.btn--primary', {
            type: 'button', text: 'حفظ',
            onclick: function () {
              try {
                var s = ERP.staff.create({ name: name.value, role: role.value });
                setup.inspectorId = s.id;
                inspectorSelect.appendChild(el('option', { value: s.id, text: s.name + ' — ' + s.role }));
                inspectorSelect.value = s.id;
                h.close();
              } catch (err) { ERP.ui.toast(err.message, 'bad'); }
            }
          })],
          onClose: function () { if (inspectorSelect.value === '__new') inspectorSelect.value = setup.inspectorId || ''; }
        });
      } else setup.inspectorId = inspectorSelect.value;
    });

    var customerLabel = el('span', { text: ERP.customers.label(setup.customerId) || 'بدون ربط' });
    var customerBtn = el('button.btn.btn--ghost.btn--block', {
      type: 'button', html: ERP.icon('user', 16) + '<span></span>',
      onclick: function () {
        ERP.ui.picker({
          title: 'ربط بزبون',
          searchPlaceholder: 'ابحث بالاسم أو الهاتف…',
          items: function (term) {
            return [{ id: '__none', title: 'بدون ربط', sub: '' }].concat(
              ERP.customers.search(term).map(function (c) {
                return { id: c.id, title: c.name, sub: c.phone || '', meta: c.city || '' };
              })
            );
          },
          onPick: function (item) {
            setup.customerId = item.id === '__none' ? null : item.id;
            customerLabel.textContent = ERP.customers.label(setup.customerId) || 'بدون ربط';
            customerBtn.querySelector('span').textContent = customerLabel.textContent;
          },
          footer: el('button.btn.btn--ghost.btn--block', {
            type: 'button', style: { marginTop: '12px' }, text: '+ زبون جديد',
            onclick: function () {
              var closeBtn = document.querySelector('.modal button[aria-label="إغلاق"]');
              if (closeBtn) closeBtn.click();
              var name = el('input.input', { placeholder: 'اسم الزبون', 'data-autofocus': '' });
              var phone = el('input.input.mono', { placeholder: '07XXXXXXXXX', inputmode: 'tel' });
              var city = el('input.input', { placeholder: 'المدينة / المنطقة' });
              var h = ERP.ui.modal({
                title: 'زبون جديد',
                body: el('.stack', {}, [
                  el('.field', {}, [el('label', { text: 'الاسم' }), name]),
                  el('.field', {}, [el('label', { text: 'الهاتف' }), phone]),
                  el('.field', {}, [el('label', { text: 'المدينة' }), city])
                ]),
                actions: [el('button.btn.btn--primary', {
                  type: 'button', text: 'حفظ',
                  onclick: function () {
                    try {
                      var c = ERP.customers.create({ name: name.value, phone: phone.value, city: city.value });
                      setup.customerId = c.id;
                      customerBtn.querySelector('span').textContent = c.name;
                      h.close();
                    } catch (err) { ERP.ui.toast(err.message, 'bad'); }
                  }
                })]
              });
            }
          })
        });
      }
    });
    customerBtn.querySelector('span').textContent = ERP.customers.label(setup.customerId) || 'بدون ربط';

    var plan = cat.planFor(device);
    var applicableCount = plan.filter(function (p) { return p.applicable; }).length;
    var skippedCaps = plan.filter(function (p) { return !p.applicable; });

    mountScreen([
      backBar('العودة', function () { go(''); }),

      el('section.device-head.card.enter', {}, [
        el('.device-head__mark', { html: ERP.icon('device', 26) }),
        el('.grow', {}, [
          el('h1', { text: device.brand + ' ' + device.model }),
          el('.row.wrap', { style: { marginTop: '6px' } }, [
            el('span.badge', { text: device.storage }),
            el('span.badge', { text: device.color }),
            el('span.badge.badge--info', { text: ERP.inventory.statusLabel(device.status) }),
            el('span.badge', { text: ERP.inventory.ownershipLabel(device.ownership) })
          ])
        ]),
        history.length ? el('.device-head__last', {}, [
          el('.micro', { text: 'آخر فحص' }),
          el('.device-head__score.mono', { text: (history[0].summary ? history[0].summary.score : '—') + '/100' }),
          el('.micro', { text: ERP.fmt.date(history[0].finishedAt) })
        ]) : null
      ]),

      el('.cols.enter.enter-1', {}, [
        el('section.card', {}, [
          el('h3', { text: 'هوية الجهاز' }),
          el('.kv', { style: { marginTop: '12px' } }, identity.map(function (pair) {
            return el('.kv__row', {}, [
              el('span.kv__k', { text: pair[0] }),
              el('span.kv__v' + (/IMEI|Serial/.test(pair[0]) ? '.mono' : ''), { text: pair[1] || '—' })
            ]);
          })),
          el('button.btn.btn--quiet.btn--sm', {
            type: 'button', style: { marginTop: '10px' },
            html: ERP.icon('history', 15) + '<span>سجل فحوصات هذا الجهاز (' + history.length + ')</span>',
            onclick: function () { go('history/' + device.id); }
          })
        ]),

        el('section.card', {}, [
          el('h3', { text: 'إعداد الفحص' }),
          el('.stack', { style: { marginTop: '12px' } }, [
            el('.field', {}, [el('label', { text: 'غرض الفحص' }), purposeRow]),
            el('.field', {}, [el('label', { text: 'الفاحص المسؤول' }), inspectorSelect]),
            el('.field', {}, [el('label', { text: 'الزبون (اختياري)' }), customerBtn])
          ]),
          el('.plan-summary.glass--thin', { style: { marginTop: '14px' } }, [
            el('.row-between', {}, [
              el('span.sub', { text: 'اختبارات ستُنفَّذ' }),
              el('strong.mono', { text: String(applicableCount) })
            ]),
            skippedCaps.length ? el('.row-between', {}, [
              el('span.sub', { text: 'غير مدعومة على هذا الموديل' }),
              el('strong.mono', { text: String(skippedCaps.length) })
            ]) : null,
            el('.micro', { text: 'تُبنى الخطة تلقائيًا من قدرات الموديل: ' + capsSummary(caps) })
          ]),
          el('button.btn.btn--primary.btn--lg.btn--block', {
            type: 'button', style: { marginTop: '16px' },
            html: ERP.icon('play', 18) + '<span>ابدأ الفحص</span>',
            onclick: function () {
              var session = engine.create({
                deviceId: device.id, purpose: setup.purpose,
                inspectorId: inspectorSelect.value === '__new' ? setup.inspectorId : inspectorSelect.value,
                customerId: setup.customerId
              });
              go('inspect/' + session.id);
            }
          })
        ])
      ]),

      history.length ? el('section.enter.enter-2', {}, [
        el('h2.section-title', { text: 'سجل الفحوصات' }),
        el('.stack', {}, history.slice(0, 4).map(inspectionRow))
      ]) : null
    ]);
  };

  function capsSummary(caps) {
    var on = [];
    if (caps.nfc) on.push('NFC');
    if (caps.faceId) on.push('Face ID');
    if (caps.fingerprint) on.push('بصمة');
    if (caps.wirelessCharging) on.push('شحن لاسلكي');
    if (caps.cellular) on.push(caps.dualSim ? 'شريحتان' : 'شريحة');
    else on.push('واي فاي فقط');
    if (caps.stereoSpeakers) on.push('ستيريو');
    return on.join(' · ');
  }

  function backBar(label, onBack) {
    return el('.backbar', {}, [
      el('button.btn.btn--quiet.btn--sm', {
        type: 'button', html: ERP.icon('back', 16) + '<span>' + label + '</span>', onclick: onBack
      })
    ]);
  }
  views.backBar = backBar;

  /* ======================================================================
     مساحة الفحص
     ====================================================================== */
  views.inspect = function (sessionId) {
    var session = engine.load(sessionId);
    if (!session) { ERP.ui.toast('جلسة الفحص غير موجودة', 'bad'); go(''); return; }
    if (session.status === 'completed') { go('result/' + session.id); return; }

    var state = {
      stageId: firstUnfinishedStage(session),
      runnerCleanups: [],
      cards: {}
    };

    /* -- عناصر رأس التقدّم -- */
    var ring = ERP.ui.ring(58, 6);
    var pctText = el('.progress__pct.mono', { text: '0%' });
    var doneText = el('.micro', { text: '' });
    var timerText = el('.micro.mono', { text: '0:00' });

    var stageList = el('.stages', { role: 'tablist', 'aria-label': 'مراحل الفحص' });
    var stageArea = el('.stage-area');

    var header = el('.workspace__head.glass', {}, [
      el('.row.grow', {}, [
        el('.workspace__device', {}, [
          el('strong', { text: session.device.brand + ' ' + session.device.model }),
          el('.micro.mono', { text: ERP.fmt.imei(session.device.imei) || session.device.serial || '—' })
        ])
      ]),
      el('.progress', {}, [
        el('.progress__ring', {}, [ring.node, pctText]),
        el('.progress__facts', {}, [
          el('.progress__label', { text: 'التقدّم الكلي' }),
          doneText,
          el('.row', { style: { gap: '4px' } }, [el('span', { html: ERP.icon('clock', 12) }), timerText])
        ])
      ]),
      el('.row.wrap', {}, [
        el('button.btn.btn--ghost.btn--sm', {
          type: 'button', html: ERP.icon('save', 15) + '<span>حفظ وخروج</span>',
          onclick: function () { engine.save(session); ERP.ui.toast('حُفظ الفحص — يمكنك إكماله لاحقًا', 'ok'); go(''); }
        }),
        el('button.btn.btn--primary.btn--sm', {
          type: 'button', html: ERP.icon('check', 15) + '<span>إنهاء الفحص</span>',
          onclick: finish
        })
      ])
    ]);

    function firstUnfinishedStage(s) {
      var progress = engine.progress(s);
      for (var i = 0; i < cat.STAGES.length; i++) {
        var st = progress.byStage[cat.STAGES[i].id];
        if (st.total > 0 && st.done < st.total) return cat.STAGES[i].id;
      }
      return cat.STAGES[0].id;
    }

    function refreshProgress() {
      var p = engine.progress(session);
      ring.set(p.pct, p.pct >= 100 ? 'ok' : null);
      pctText.textContent = Math.round(p.pct) + '%';
      doneText.textContent = p.done + ' من ' + p.total + ' اختبارًا';
      renderStageList(p);
    }

    function renderStageList(p) {
      clear(stageList);
      cat.STAGES.forEach(function (stage) {
        var st = p.byStage[stage.id];
        var glyph = st.state === 'done' ? '✓' : st.state === 'failed' ? '✕' : st.state === 'active' ? '⏳' : st.state === 'na' ? '∅' : '○';
        var item = el('button.stage-item', {
          type: 'button', role: 'tab',
          'aria-selected': state.stageId === stage.id ? 'true' : 'false',
          dataset: { state: st.state, stage: stage.id },
          onclick: function () { openStage(stage.id); }
        }, [
          el('span.stage-item__glyph', { text: glyph }),
          el('span.grow', {}, [
            el('span.stage-item__title', { text: stage.n + '. ' + stage.ar }),
            el('span.stage-item__en', { text: stage.en })
          ]),
          el('span.stage-item__count.mono', { text: st.total ? st.done + '/' + st.total : '—' })
        ]);
        stageList.appendChild(item);
      });
      var current = stageList.querySelector('[aria-selected="true"]');
      if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function unmountRunners() {
      state.runnerCleanups.splice(0).forEach(function (fn) { try { fn(); } catch (e) { console.warn(e); } });
      state.cards = {};
    }

    function openStage(stageId) {
      state.stageId = stageId;
      unmountRunners();
      var stage = cat.stage(stageId);
      var tests = cat.stageTests(stageId);
      var applicable = tests.filter(function (t) { return engine.isApplicable(session, t.id); });
      var unsupportedTests = tests.filter(function (t) { return !engine.isApplicable(session, t.id); });

      clear(stageArea);
      stageArea.appendChild(el('.stage-head.enter', {}, [
        el('.stage-head__icon', { html: ERP.icon(stage.icon, 22) }),
        el('div.grow', {}, [
          el('h2', { text: stage.n + '. ' + stage.ar }),
          el('.micro.mono', { text: stage.en })
        ]),
        el('span.badge', { text: applicable.length + ' اختبار' })
      ]));

      applicable.forEach(function (test, i) {
        var card = buildTestCard(test, i);
        stageArea.appendChild(card);
      });

      if (unsupportedTests.length) {
        stageArea.appendChild(el('details.unsupported.glass--thin', {}, [
          el('summary', { text: 'غير مدعومة على هذا الموديل (' + unsupportedTests.length + ')' }),
          el('.stack', { style: { marginTop: '10px' } }, unsupportedTests.map(function (t) {
            return el('.row-between', {}, [
              el('div', {}, [el('strong', { text: t.ar }), el('.micro.mono', { text: t.en })]),
              el('button.btn.btn--quiet.btn--sm', {
                type: 'button', text: 'افحصه يدويًا',
                onclick: function () {
                  session.plan.forEach(function (p) { if (p.id === t.id) { p.applicable = true; p.reason = null; } });
                  delete session.results[t.id];
                  engine.save(session);
                  openStage(stageId);
                  refreshProgress();
                }
              })
            ]);
          }))
        ]));
      }

      stageArea.appendChild(stageNav(stageId));
      renderStageList(engine.progress(session));
    }

    function stageNav(stageId) {
      var idx = cat.STAGES.findIndex(function (s) { return s.id === stageId; });
      var prev = cat.STAGES[idx - 1], next = cat.STAGES[idx + 1];
      return el('.stage-nav', {}, [
        prev ? el('button.btn.btn--ghost', {
          type: 'button', html: ERP.icon('back', 16) + '<span>' + prev.ar + '</span>',
          onclick: function () { openStage(prev.id); }
        }) : el('span'),
        next ? el('button.btn.btn--primary', {
          type: 'button', html: '<span>' + next.ar + '</span>' + ERP.icon('chevron', 16),
          onclick: function () { openStage(next.id); }
        }) : el('button.btn.btn--primary', {
          type: 'button', html: ERP.icon('check', 16) + '<span>إنهاء الفحص</span>', onclick: finish
        })
      ]);
    }

    /* -- بطاقة اختبار واحدة -- */
    function buildTestCard(test, index) {
      var current = engine.resultOf(session, test.id);
      var badge = el('span.badge', {});
      var runnerMount = el('.test__runner');
      var askArea = el('.test__ask');
      var metricsArea = el('.test__metrics');
      var notesWrap = el('.test__notes', { hidden: true });
      var notes = el('textarea.textarea', {
        placeholder: 'ملاحظة الفاحص — تظهر في التقرير…', rows: '2', value: (current && current.notes) || ''
      });
      notes.value = (current && current.notes) || '';
      notesWrap.appendChild(notes);

      var card = el('article.test.card.enter', {
        dataset: { test: test.id },
        style: { animationDelay: Math.min(index * 45, 220) + 'ms' }
      });

      function renderBadge() {
        var r = engine.resultOf(session, test.id);
        var meta = r && r.status ? cat.STATUS_META[r.status] : null;
        badge.className = 'badge' + (meta ? ' badge--' + meta.tone : '');
        badge.textContent = meta ? meta.ar : 'بانتظار الفحص';
        card.dataset.status = (r && r.status) || 'pending';
        ERP.$$('.statusbar button', card).forEach(function (b) {
          b.setAttribute('aria-pressed', r && r.status === b.dataset.status ? 'true' : 'false');
        });
        if (r && r.notes && !notes.value) notes.value = r.notes;
        if (r && r.notes) notesWrap.hidden = false;
      }

      function renderMetrics() {
        var r = engine.resultOf(session, test.id);
        clear(metricsArea);
        if (!r || !r.metrics) return;
        Object.keys(r.metrics).forEach(function (k) {
          var v = r.metrics[k];
          if (v === null || v === undefined || v === false) return;
          metricsArea.appendChild(el('span.metric.mono', { text: metricLabel(k) + ': ' + metricValue(v) }));
        });
      }

      function setStatus(status, extra) {
        var payload = extra || {};
        if (notes.value.trim()) payload.notes = notes.value.trim();
        engine.setResult(session, test.id, status, payload);
        renderBadge();
        renderMetrics();
        refreshProgress();
        clear(askArea);
        if (status === S.PASSED) flashSuccess(card);
        if (status === S.FAILED && !notes.value.trim()) notesWrap.hidden = false;
      }

      var statusbar = el('.statusbar', { role: 'group', 'aria-label': 'نتيجة الاختبار' }, [
        statusButton(S.PASSED, 'ناجح', 'check', setStatus),
        statusButton(S.FAILED, 'فاشل', 'x', setStatus),
        statusButton(S.SKIPPED, 'متخطّى', 'minus', setStatus),
        statusButton(S.NOT_SUPPORTED, 'غير مدعوم', 'slash', setStatus)
      ]);

      ERP.append(card, [
        el('.test__head', {}, [
          el('.grow', {}, [
            el('.row.wrap', { style: { gap: '8px' } }, [
              el('h4', { text: test.ar }),
              test.critical ? el('span.badge.badge--warn', { text: 'أساسي' }) : null
            ]),
            el('.test__en.mono', { text: test.en }),
            test.hint ? el('p.test__hint', { text: test.hint }) : null
          ]),
          badge
        ]),
        runnerMount,
        askArea,
        metricsArea,
        el('.test__foot', {}, [
          statusbar,
          el('button.btn.btn--quiet.btn--sm', {
            type: 'button', html: ERP.icon('doc', 15) + '<span>ملاحظة</span>',
            onclick: function () { notesWrap.hidden = !notesWrap.hidden; if (!notesWrap.hidden) notes.focus(); }
          })
        ]),
        notesWrap
      ]);

      notes.addEventListener('input', ERP.debounce(function () {
        engine.setNotes(session, test.id, notes.value.trim());
      }, 400));

      // تشغيل المشغّل التفاعلي إن وُجد
      if (test.runner && DI.runners.has(test.runner)) {
        var ctx = {
          mount: runnerMount,
          test: test,
          options: test.options || {},
          device: session.device,
          caps: session.caps,
          result: current,
          setResult: function (status, extra) { setStatus(status, Object.assign({ auto: true }, extra || {})); },
          setMetrics: function (metrics) {
            var r = engine.resultOf(session, test.id) || {};
            engine.setResult(session, test.id, r.status || null, { metrics: metrics, notes: r.notes });
            renderMetrics();
          },
          ask: function (question) {
            clear(askArea);
            askArea.appendChild(el('.ask.glass--thin', {}, [
              el('span.grow', { text: question }),
              el('button.btn.btn--sm', { type: 'button', html: ERP.icon('check', 15) + '<span>نعم</span>', onclick: function () { setStatus(S.PASSED); } }),
              el('button.btn.btn--sm.btn--danger', { type: 'button', html: ERP.icon('x', 15) + '<span>لا</span>', onclick: function () { setStatus(S.FAILED); } })
            ]));
          }
        };
        state.runnerCleanups.push(DI.runners.run(test.runner, ctx));
      }

      renderBadge();
      renderMetrics();
      state.cards[test.id] = { card: card, renderBadge: renderBadge };
      return card;
    }

    function statusButton(status, label, iconName, onSet) {
      var meta = cat.STATUS_META[status];
      return el('button', {
        type: 'button', dataset: { status: status, tone: meta.tone },
        'aria-pressed': 'false',
        html: ERP.icon(iconName, 15) + '<span>' + label + '</span>',
        onclick: function () { onSet(status); }
      });
    }

    function flashSuccess(card) {
      card.classList.remove('is-pass');
      void card.offsetWidth;
      card.classList.add('is-pass');
    }

    function metricLabel(k) {
      var map = {
        coverage: 'التغطية', cells: 'المربعات', maxSimultaneous: 'أصابع', deviceMax: 'حد الجهاز',
        panels: 'شاشات', shots: 'لقطات', brightness: 'إضاءة', sharpness: 'وضوح', resolution: 'الدقة',
        facing: 'العدسة', peakDb: 'ذروة', avgDb: 'متوسط', level: 'شحن', charging: 'يشحن',
        healthPct: 'صحة البطارية', cycles: 'دورات', detected: 'كُشف', wireless: 'لاسلكي',
        levelAtStart: 'شحن البداية', levelNow: 'شحن الآن', online: 'متصل', rttMs: 'استجابة',
        type: 'النوع', downlink: 'سرعة', radioAvailable: 'المذياع', scanned: 'مسح', device: 'جهاز',
        serialNumber: 'رقم البطاقة', records: 'سجلات', accuracyM: 'الدقة (م)', timeToFixMs: 'زمن الالتقاط',
        lat: 'خط العرض', lon: 'خط الطول', rangeX: 'مدى X', rangeY: 'مدى Y', rangeZ: 'مدى Z',
        betaRange: 'مدى β', gammaRange: 'مدى γ', sectors: 'قطاعات', platformAuthenticator: 'مستشعر النظام',
        unlocks: 'فتحات', power: 'التشغيل', volUp: 'رفع الصوت', volDown: 'خفض الصوت', mute: 'الصامت',
        home: 'الرئيسية', left: 'يسار', right: 'يمين', tonePlayed: 'نغمة', sweepPlayed: 'مسح ترددي',
        patternPlayed: 'نمط', pulsed: 'نبضة', torchToggled: 'الفلاش', alreadyCharging: 'يشحن مسبقًا'
      };
      return map[k] || k;
    }

    function metricValue(v) {
      if (v === true) return 'نعم';
      if (typeof v === 'number') return String(v);
      return String(v);
    }

    function finish() {
      var p = engine.progress(session);
      var pending = p.total - p.done;
      var proceed = pending === 0
        ? Promise.resolve(true)
        : ERP.ui.confirm({
            title: 'إنهاء الفحص؟',
            message: 'ما زال ' + pending + ' اختبارًا بلا نتيجة — ستُسجَّل كـ«متخطّاة» ولن تدخل في الدرجة.',
            confirmText: 'إنهاء وحساب النتيجة'
          });
      proceed.then(function (ok) {
        if (!ok) return;
        unmountRunners();
        engine.complete(session, { skipRemaining: true });
        go('result/' + session.id);
      });
    }

    /* -- المؤقّت -- */
    var timer = setInterval(function () {
      timerText.textContent = ERP.fmt.duration(Date.now() - session.startedAt);
    }, 1000);
    registerCleanup(function () { clearInterval(timer); unmountRunners(); });

    mountScreen([
      el('.workspace', {}, [
        header,
        el('.workspace__body', {}, [
          el('aside.workspace__side', {}, [stageList]),
          el('main.workspace__main', {}, [stageArea])
        ])
      ])
    ]);

    refreshProgress();
    openStage(state.stageId);
  };
})(window);
