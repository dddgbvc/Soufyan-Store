/* ==========================================================================
   فحص الجهاز — محرّك الفحص (حالة الجلسة + الاحتساب + الحفظ)
   منطق الأعمال بالكامل هنا؛ الواجهة لا تحسب شيئًا بنفسها.
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var DI = global.DI;
  var cat = DI.catalog;
  var S = cat.STATUS;

  var store = ERP.db.collection('inspections');
  var ACTIVE_KEY = 'di.activeSessionId';

  /* ---- إنشاء جلسة -------------------------------------------------------- */
  function create(input) {
    var device = ERP.inventory.get(input.deviceId);
    if (!device) throw new Error('الجهاز غير موجود في المخزون');

    var inspector = input.inspectorId ? ERP.staff.get(input.inspectorId) : null;
    var session = {
      id: ERP.uid('insp'),
      deviceId: device.id,
      device: {
        modelId: device.modelId,
        brand: device.brand, model: device.model, variant: device.variant,
        storage: device.storage, color: device.color,
        imei: device.imei, imei2: device.imei2, serial: device.serial,
        osVersion: device.osVersion
      },
      caps: ERP.inventory.capsFor(device),
      purpose: input.purpose || 'sale',
      inspectorId: inspector ? inspector.id : null,
      inspectorName: inspector ? inspector.name : (input.inspectorName || '—'),
      customerId: input.customerId || device.customerId || null,
      startedAt: Date.now(),
      finishedAt: null,
      status: 'in_progress',
      plan: cat.planFor(device),
      results: {},
      generalNotes: ''
    };

    // الاختبارات غير المنطبقة تُحسم فورًا كـ"غير مدعوم"
    session.plan.forEach(function (p) {
      if (!p.applicable) {
        session.results[p.id] = {
          status: S.NOT_SUPPORTED,
          notes: '',
          reason: p.reason,
          auto: true,
          at: Date.now()
        };
      }
    });

    store.put(session);
    ERP.db.settings.set(ACTIVE_KEY, session.id);
    if (inspector) ERP.staff.remember(inspector.id);
    return session;
  }

  var saveNow = function (session) {
    session.updatedAt = Date.now();
    store.put(session);
    return session;
  };
  var saveSoon = ERP.debounce(function (session) { saveNow(session); }, 300);

  /* ---- تسجيل النتائج ------------------------------------------------------ */
  function setResult(session, testId, status, extra) {
    var test = cat.test(testId);
    if (!test) return null;
    var prev = session.results[testId] || {};
    var payload = extra || {};
    session.results[testId] = {
      status: status,
      notes: payload.notes !== undefined ? payload.notes : (prev.notes || ''),
      metrics: payload.metrics !== undefined ? payload.metrics : prev.metrics || null,
      reason: payload.reason !== undefined ? payload.reason : (status === S.NOT_SUPPORTED ? prev.reason : null),
      auto: !!payload.auto,
      at: Date.now()
    };
    saveSoon(session);
    return session.results[testId];
  }

  function setNotes(session, testId, notes) {
    var prev = session.results[testId] || { status: null, at: Date.now() };
    prev.notes = notes;
    session.results[testId] = prev;
    saveSoon(session);
    return prev;
  }

  function resultOf(session, testId) { return session.results[testId] || null; }

  function isApplicable(session, testId) {
    for (var i = 0; i < session.plan.length; i++) {
      if (session.plan[i].id === testId) return session.plan[i].applicable;
    }
    return true;
  }

  function applicableTests(session) {
    return session.plan.filter(function (p) { return p.applicable; })
      .map(function (p) { return cat.test(p.id); })
      .filter(Boolean);
  }

  /* ---- التقدّم ------------------------------------------------------------ */
  function progress(session) {
    var applicable = applicableTests(session);
    var done = 0;
    applicable.forEach(function (t) { if (session.results[t.id] && session.results[t.id].status) done++; });

    var byStage = {};
    cat.STAGES.forEach(function (stage) {
      var tests = cat.stageTests(stage.id);
      var appl = tests.filter(function (t) { return isApplicable(session, t.id); });
      var d = 0, failed = 0;
      appl.forEach(function (t) {
        var r = session.results[t.id];
        if (r && r.status) d++;
        if (r && r.status === S.FAILED) failed++;
      });
      byStage[stage.id] = {
        total: appl.length,
        done: d,
        failed: failed,
        skipped: tests.length - appl.length,
        state: appl.length === 0 ? 'na' : (d === 0 ? 'pending' : (d < appl.length ? 'active' : (failed ? 'failed' : 'done')))
      };
    });

    return {
      total: applicable.length,
      done: done,
      pct: applicable.length ? (done / applicable.length) * 100 : 0,
      remaining: applicable.length - done,
      byStage: byStage
    };
  }

  /* ---- الاحتساب ----------------------------------------------------------
     الدرجة = (مجموع أوزان الناجح ÷ مجموع أوزان المُختبَر) × 100
     المتخطّى وغير المدعوم لا يدخلان في المعادلة، لكن يُخفضان "التغطية".
     فشل اختبار جوهري (critical) يضع سقفًا صارمًا على الدرجة.
     ---------------------------------------------------------------------- */
  var CRITICAL_CAPS = [100, 65, 50, 35];

  function compute(session) {
    var applicable = applicableTests(session);
    var totalWeight = 0, earnedWeight = 0, counted = 0;
    var criticalFails = 0;
    var failures = [];
    var byCat = {};

    cat.CATEGORIES.forEach(function (c) {
      byCat[c.id] = { id: c.id, ar: c.ar, en: c.en, icon: c.icon, weight: 0, earned: 0, counted: 0, failed: 0, score: null };
    });

    applicable.forEach(function (test) {
      var r = session.results[test.id];
      if (!r || !r.status) return;
      var bucket = byCat[test.category] || byCat.other;

      if (r.status === S.PASSED || r.status === S.FAILED) {
        counted++;
        totalWeight += test.weight;
        bucket.weight += test.weight;
        bucket.counted++;
        if (r.status === S.PASSED) {
          earnedWeight += test.weight;
          bucket.earned += test.weight;
        } else {
          bucket.failed++;
          if (test.critical) criticalFails++;
          failures.push({
            testId: test.id,
            stage: test.stage,
            stageAr: cat.stage(test.stage) ? cat.stage(test.stage).ar : test.stage,
            category: test.category,
            ar: test.ar, en: test.en,
            critical: !!test.critical,
            notes: r.notes || '',
            metrics: r.metrics || null,
            at: r.at
          });
        }
      }
    });

    var raw = totalWeight ? (earnedWeight / totalWeight) * 100 : 0;
    var cap = CRITICAL_CAPS[Math.min(criticalFails, CRITICAL_CAPS.length - 1)];
    var score = Math.round(Math.min(raw, cap));
    if (counted === 0) score = 0;

    Object.keys(byCat).forEach(function (k) {
      var b = byCat[k];
      b.score = b.weight ? Math.round((b.earned / b.weight) * 100) : null;
    });

    var coverage = applicable.length ? (counted / applicable.length) * 100 : 0;
    var grade = cat.gradeFor(score);

    return {
      score: score,
      rawScore: Math.round(raw),
      capped: raw > cap,
      grade: grade,
      criticalFails: criticalFails,
      counted: counted,
      coverage: Math.round(coverage),
      breakdown: cat.CATEGORIES.map(function (c) { return byCat[c.id]; }),
      failures: failures.sort(function (a, b) { return (b.critical ? 1 : 0) - (a.critical ? 1 : 0); }),
      finalStatus: finalStatus(score, criticalFails, failures.length)
    };
  }

  var FINAL_STATUSES = {
    ready:      { id: 'ready',      ar: 'جاهز للبيع',        en: 'Ready',            tone: 'ok' },
    with_notes: { id: 'with_notes', ar: 'صالح مع ملاحظات',   en: 'Passed w/ Notes',  tone: 'ok' },
    repair:     { id: 'repair',     ar: 'يحتاج صيانة',       en: 'Needs Repair',     tone: 'warn' },
    rejected:   { id: 'rejected',   ar: 'مرفوض',             en: 'Rejected',         tone: 'bad' }
  };

  function finalStatus(score, criticalFails, failCount) {
    if (criticalFails >= 2 || score < 50) return FINAL_STATUSES.rejected;
    if (criticalFails === 1 || score < 70) return FINAL_STATUSES.repair;
    if (failCount > 0 || score < 85) return FINAL_STATUSES.with_notes;
    return FINAL_STATUSES.ready;
  }

  /* ---- إنهاء الجلسة ------------------------------------------------------- */
  function complete(session, options) {
    var opts = options || {};
    if (opts.skipRemaining) {
      applicableTests(session).forEach(function (t) {
        if (!session.results[t.id] || !session.results[t.id].status) {
          session.results[t.id] = { status: S.SKIPPED, notes: '', auto: true, reason: 'أُنهي الفحص قبل تنفيذه', at: Date.now() };
        }
      });
    }
    var summary = compute(session);
    session.status = 'completed';
    session.finishedAt = opts.at || Date.now();
    session.durationMs = session.finishedAt - session.startedAt;
    session.summary = summary;
    saveNow(session);
    if (ERP.db.settings.get(ACTIVE_KEY) === session.id) ERP.db.settings.set(ACTIVE_KEY, null);

    // اربط النتيجة بسجل الجهاز في المخزون
    ERP.inventory.update(session.deviceId, {
      lastInspectionId: session.id,
      lastInspectionAt: session.finishedAt,
      lastInspectionScore: summary.score,
      lastInspectionStatus: summary.finalStatus.id
    });
    return session;
  }

  function abandon(session) {
    session.status = 'abandoned';
    session.finishedAt = Date.now();
    saveNow(session);
    if (ERP.db.settings.get(ACTIVE_KEY) === session.id) ERP.db.settings.set(ACTIVE_KEY, null);
    return session;
  }

  /* ---- استعلامات ---------------------------------------------------------- */
  function load(id) { return store.get(id); }

  function activeSession() {
    var id = ERP.db.settings.get(ACTIVE_KEY, null);
    if (!id) return null;
    var s = store.get(id);
    if (!s || s.status !== 'in_progress') { ERP.db.settings.set(ACTIVE_KEY, null); return null; }
    return s;
  }

  function listForDevice(deviceId) {
    return store.query(function (r) { return r.deviceId === deviceId && r.status === 'completed'; })
      .sort(function (a, b) { return (b.finishedAt || 0) - (a.finishedAt || 0); });
  }

  function listAll(filter) {
    var f = filter || {};
    var rows = store.all().filter(function (r) { return f.includeDrafts ? true : r.status === 'completed'; });
    if (f.term) {
      var term = String(f.term).toLowerCase();
      rows = rows.filter(function (r) {
        return [r.device.brand, r.device.model, r.device.imei, r.device.serial, r.inspectorName]
          .join(' ').toLowerCase().indexOf(term) >= 0;
      });
    }
    return rows.sort(function (a, b) { return (b.finishedAt || b.startedAt || 0) - (a.finishedAt || a.startedAt || 0); });
  }

  function removeSession(id) {
    store.remove(id);
    if (ERP.db.settings.get(ACTIVE_KEY) === id) ERP.db.settings.set(ACTIVE_KEY, null);
  }

  /** مقارنة بآخر فحص مكتمل لنفس الجهاز (تدهور/تحسّن). */
  function deltaForDevice(deviceId, excludeId) {
    var rows = listForDevice(deviceId).filter(function (r) { return r.id !== excludeId; });
    if (!rows.length) return null;
    var last = rows[0];
    return { previous: last, score: last.summary ? last.summary.score : null, at: last.finishedAt };
  }

  /* ---- بيانات تجريبية للسجل (تُنشأ مرة واحدة) ---------------------------- */
  function seedHistory() {
    if (ERP.db.settings.get('di.seededHistory')) return;
    var devices = ERP.inventory.devices.all();
    if (!devices.length) return;

    var recipes = [
      { deviceIndex: 0, daysAgo: 30, fail: ['camera.ultrawide'], skip: ['cell.call'], inspector: 1 },
      { deviceIndex: 0, daysAgo: 4,  fail: [], skip: ['bt.pairing'], inspector: 0 },
      { deviceIndex: 2, daysAgo: 12, fail: ['mic.main', 'charging.port'], skip: [], inspector: 1 },
      { deviceIndex: 4, daysAgo: 7,  fail: ['battery.health'], skip: ['conn.hotspot'], inspector: 2 }
    ];
    var staff = ERP.staff.all();

    recipes.forEach(function (recipe) {
      var device = devices[recipe.deviceIndex];
      if (!device) return;
      var inspector = staff[recipe.inspector] || staff[0];
      var when = Date.now() - recipe.daysAgo * 86400000;
      var session = create({ deviceId: device.id, purpose: 'sale', inspectorId: inspector && inspector.id });
      session.startedAt = when;

      applicableTests(session).forEach(function (t) {
        var status = S.PASSED;
        var notes = '';
        if (recipe.fail.indexOf(t.id) >= 0) {
          status = S.FAILED;
          notes = t.id === 'mic.main' ? 'الصوت مكتوم ومشوّش عند التسجيل — يحتاج تبديل المايك.'
                : t.id === 'battery.health' ? 'صحة البطارية 74% — يُنصح بالاستبدال.'
                : t.id === 'charging.port' ? 'المنفذ فيه غبار وتلامس غير ثابت.'
                : 'انحراف واضح في الحواف عند التصوير.';
        } else if (recipe.skip.indexOf(t.id) >= 0) {
          status = S.SKIPPED;
        }
        session.results[t.id] = { status: status, notes: notes, auto: false, at: when + 60000 };
      });

      complete(session, { at: when + 14 * 60000 });
    });

    ERP.db.settings.set('di.seededHistory', true);
    ERP.db.settings.set(ACTIVE_KEY, null);
  }

  DI.engine = {
    create: create,
    load: load,
    save: saveNow,
    setResult: setResult,
    setNotes: setNotes,
    resultOf: resultOf,
    isApplicable: isApplicable,
    applicableTests: applicableTests,
    progress: progress,
    compute: compute,
    complete: complete,
    abandon: abandon,
    activeSession: activeSession,
    listForDevice: listForDevice,
    listAll: listAll,
    remove: removeSession,
    deltaForDevice: deltaForDevice,
    seedHistory: seedHistory,
    FINAL_STATUSES: FINAL_STATUSES,
    store: store
  };
})(window);
