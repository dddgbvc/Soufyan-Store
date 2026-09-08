/* ==========================================================================
   فحص الجهاز — Device Inspection · كتالوج المراحل والاختبارات
   منطق أعمال مستقل تمامًا عن (تجربة 24 ساعة) و(الحجز المسبق).
   يشترك معهما فقط في: نظام التصميم + المخزون + بنية الزبائن.
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var DI = global.DI || (global.DI = {});

  /* ---- حالات النتيجة ------------------------------------------------------ */
  var STATUS = {
    PASSED: 'passed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
    NOT_SUPPORTED: 'not_supported'
  };

  var STATUS_META = {
    passed:        { ar: 'ناجح',       en: 'Passed',        tone: 'ok',   icon: 'check',  glyph: '✓' },
    failed:        { ar: 'فاشل',       en: 'Failed',        tone: 'bad',  icon: 'x',      glyph: '✕' },
    skipped:       { ar: 'متخطّى',     en: 'Skipped',       tone: 'warn', icon: 'minus',  glyph: '–' },
    not_supported: { ar: 'غير مدعوم',  en: 'Not Supported', tone: 'mute', icon: 'slash',  glyph: '∅' }
  };

  /* ---- تصنيفات التقييم (Breakdown) --------------------------------------- */
  var CATEGORIES = [
    { id: 'display',      ar: 'الشاشة',    en: 'Display',      icon: 'display' },
    { id: 'battery',      ar: 'البطارية',  en: 'Battery',      icon: 'battery' },
    { id: 'camera',       ar: 'الكاميرا',  en: 'Camera',       icon: 'camera' },
    { id: 'audio',        ar: 'الصوت',     en: 'Audio',        icon: 'speaker' },
    { id: 'connectivity', ar: 'الاتصال',   en: 'Connectivity', icon: 'wifi' },
    { id: 'sensors',      ar: 'الحساسات',  en: 'Sensors',      icon: 'sensor' },
    { id: 'other',        ar: 'أخرى',      en: 'Other',        icon: 'grid' }
  ];

  /* ---- التقديرات النهائية -------------------------------------------------- */
  var GRADES = [
    { id: 'excellent', min: 90, ar: 'ممتاز',          en: 'Excellent',       tone: 'ok'   },
    { id: 'very_good', min: 80, ar: 'جيد جدًا',        en: 'Very Good',       tone: 'ok'   },
    { id: 'good',      min: 70, ar: 'جيد',            en: 'Good',            tone: 'warn' },
    { id: 'attention', min: 50, ar: 'يحتاج انتباه',    en: 'Needs Attention', tone: 'warn' },
    { id: 'critical',  min: 0,  ar: 'حرج',            en: 'Critical',        tone: 'bad'  }
  ];

  /* ---- أغراض الفحص (Business context) ------------------------------------- */
  var PURPOSES = [
    { id: 'sale',     ar: 'قبل البيع',    en: 'Before Sale',        icon: 'device' },
    { id: 'purchase', ar: 'قبل الشراء',   en: 'Before Purchase',    icon: 'search' },
    { id: 'receive',  ar: 'عند الاستلام', en: 'On Receiving',       icon: 'save' },
    { id: 'repair',   ar: 'قبل الصيانة',  en: 'Before Maintenance', icon: 'shield' }
  ];

  /* ---- المراحل (18 مرحلة، قابلة للتوسّع حسب نوع الجهاز) -------------------- */
  var STAGES = [
    { id: 'display',      n: 1,  ar: 'الشاشة',              en: 'Display',              icon: 'display' },
    { id: 'touch',        n: 2,  ar: 'اللمس',               en: 'Touch',                icon: 'touch' },
    { id: 'cameras',      n: 3,  ar: 'الكاميرات',           en: 'Cameras',              icon: 'camera' },
    { id: 'audio',        n: 4,  ar: 'الصوت',               en: 'Audio',                icon: 'speaker' },
    { id: 'microphones',  n: 5,  ar: 'المايكروفونات',       en: 'Microphones',          icon: 'mic' },
    { id: 'battery',      n: 6,  ar: 'البطارية',            en: 'Battery',              icon: 'battery' },
    { id: 'charging',     n: 7,  ar: 'الشحن',               en: 'Charging',             icon: 'bolt' },
    { id: 'wifi',         n: 8,  ar: 'الواي فاي',           en: 'Wi-Fi',                icon: 'wifi' },
    { id: 'bluetooth',    n: 9,  ar: 'البلوتوث',            en: 'Bluetooth',            icon: 'bluetooth' },
    { id: 'cellular',     n: 10, ar: 'شبكة الاتصال',        en: 'Cellular',             icon: 'signal' },
    { id: 'nfc',          n: 11, ar: 'NFC',                 en: 'NFC',                  icon: 'nfc' },
    { id: 'gps',          n: 12, ar: 'تحديد الموقع',        en: 'GPS',                  icon: 'gps' },
    { id: 'sensors',      n: 13, ar: 'الحساسات',            en: 'Sensors',              icon: 'sensor' },
    { id: 'biometrics',   n: 14, ar: 'البصمة / الوجه',      en: 'Face ID / Fingerprint', icon: 'fingerprint' },
    { id: 'buttons',      n: 15, ar: 'الأزرار',             en: 'Buttons',              icon: 'button' },
    { id: 'vibration',    n: 16, ar: 'الهزّاز',             en: 'Vibration',            icon: 'vibrate' },
    { id: 'flash',        n: 17, ar: 'الفلاش',              en: 'Flash',                icon: 'flash' },
    { id: 'connectivity', n: 18, ar: 'المنافذ والاتصال',    en: 'Connectivity',         icon: 'connect' }
  ];

  /* ---- الاختبارات ---------------------------------------------------------
     weight   : وزن الاختبار داخل معادلة الدرجة
     critical : فشله يضع سقفًا على الدرجة النهائية (خلل جوهري)
     runner   : اسم مشغّل تفاعلي من runners.js — بدونه يكون الفحص يدويًا
     applies  : شرط توفّر الميزة على هذا الموديل (caps من المخزون)
     ---------------------------------------------------------------------- */
  function has(flag) {
    return function (caps) { return !!caps[flag]; };
  }

  var TESTS = [
    /* 1 — Display */
    { id: 'display.pixels', stage: 'display', category: 'display', weight: 5, critical: true,
      ar: 'الألوان والبكسل الميت', en: 'Colors & Dead Pixels', runner: 'displayColors',
      hint: 'اعرض الألوان بملء الشاشة وافحص النقاط الميتة أو البقع أو تغيّر اللون.' },
    { id: 'display.uniformity', stage: 'display', category: 'display', weight: 3,
      ar: 'تجانس الإضاءة والتدرّج', en: 'Brightness Uniformity', runner: 'displayGradient',
      hint: 'ابحث عن تفاوت الإضاءة (Backlight bleed) أو أثر الاحتراق (Burn-in).' },
    { id: 'display.physical', stage: 'display', category: 'display', weight: 4,
      ar: 'السلامة الفيزيائية للشاشة', en: 'Physical Condition',
      hint: 'الزجاج، الخدوش، الكسور، وحواف الإطار.' },

    /* 2 — Touch */
    { id: 'touch.grid', stage: 'touch', category: 'display', weight: 5, critical: true,
      ar: 'تغطية اللمس الكاملة', en: 'Touch Coverage', runner: 'touchGrid',
      hint: 'مرّر إصبعك على كامل الشاشة حتى تُملأ كل المربعات.' },
    { id: 'touch.multi', stage: 'touch', category: 'display', weight: 2,
      ar: 'اللمس المتعدّد', en: 'Multi-touch', runner: 'touchMulti',
      hint: 'ضع أكثر من إصبع في نفس الوقت.' },

    /* 3 — Cameras */
    { id: 'camera.rear', stage: 'cameras', category: 'camera', weight: 5, critical: true,
      ar: 'الكاميرا الخلفية', en: 'Rear Camera', runner: 'cameraTest', options: { facing: 'environment' },
      hint: 'معاينة حيّة + التقاط صورة وقياس الوضوح والإضاءة.' },
    { id: 'camera.front', stage: 'cameras', category: 'camera', weight: 3,
      ar: 'الكاميرا الأمامية', en: 'Front Camera', runner: 'cameraTest', options: { facing: 'user' },
      hint: 'معاينة حيّة + التقاط صورة.', applies: has('frontCamera') },
    { id: 'camera.ultrawide', stage: 'cameras', category: 'camera', weight: 2,
      ar: 'العدسة العريضة', en: 'Ultra-wide Lens',
      hint: 'بدّل للعدسة العريضة من كاميرا النظام وقارن الحواف.', applies: has('ultraWide') },
    { id: 'camera.telephoto', stage: 'cameras', category: 'camera', weight: 2,
      ar: 'عدسة التقريب', en: 'Telephoto Lens',
      hint: 'قرّب حتى أقصى تقريب بصري وتحقق من الثبات.', applies: has('telephoto') },
    { id: 'camera.video', stage: 'cameras', category: 'camera', weight: 2,
      ar: 'تصوير الفيديو والتثبيت', en: 'Video & Stabilization',
      hint: 'سجّل 10 ثوانٍ وتحقق من الاهتزاز والصوت.' },

    /* 4 — Audio */
    { id: 'audio.loudspeaker', stage: 'audio', category: 'audio', weight: 4, critical: true,
      ar: 'السمّاعة الخارجية', en: 'Loudspeaker', runner: 'speakerTone',
      hint: 'تشغيل نغمات متدرّجة — استمع للتشويش أو الخشخشة.' },
    { id: 'audio.earpiece', stage: 'audio', category: 'audio', weight: 3,
      ar: 'سمّاعة المكالمات', en: 'Earpiece',
      hint: 'أجرِ مكالمة تجريبية واستمع من سماعة الأذن العلوية.' },
    { id: 'audio.stereo', stage: 'audio', category: 'audio', weight: 2,
      ar: 'توازن القناتين (Stereo)', en: 'Stereo Balance', runner: 'speakerChannels',
      hint: 'تشغيل القناة اليمنى واليسرى منفصلتين.', applies: has('stereoSpeakers') },
    { id: 'audio.jack', stage: 'audio', category: 'audio', weight: 1,
      ar: 'منفذ السمّاعات 3.5', en: 'Headphone Jack',
      hint: 'وصّل سمّاعة سلكية وتحقق من القناتين.', applies: has('headphoneJack') },

    /* 5 — Microphones */
    { id: 'mic.main', stage: 'microphones', category: 'audio', weight: 4, critical: true,
      ar: 'المايك الرئيسي', en: 'Main Microphone', runner: 'micRecord',
      hint: 'تسجيل صوتي قصير مع مؤشر مستوى حيّ ثم إعادة تشغيله.' },
    { id: 'mic.secondary', stage: 'microphones', category: 'audio', weight: 2,
      ar: 'مايك إلغاء الضوضاء', en: 'Noise-cancelling Mic',
      hint: 'سجّل فيديو وتحدّث من الأعلى — قارن وضوح الصوت.', applies: has('secondaryMic') },

    /* 6 — Battery */
    { id: 'battery.status', stage: 'battery', category: 'battery', weight: 2,
      ar: 'حالة البطارية الحيّة', en: 'Live Battery Status', runner: 'batteryStatus',
      hint: 'قراءة نسبة الشحن وحالة الشحن من المتصفح.' },
    { id: 'battery.health', stage: 'battery', category: 'battery', weight: 5, critical: true,
      ar: 'صحة البطارية', en: 'Battery Health', runner: 'batteryHealth',
      hint: 'أدخل نسبة الصحة من إعدادات الجهاز — أقل من 80% يعني استبدالًا قريبًا.' },
    { id: 'battery.drain', stage: 'battery', category: 'battery', weight: 3,
      ar: 'سرعة النفاد', en: 'Discharge Rate',
      hint: 'راقب هبوط النسبة خلال الفحص — الهبوط السريع مؤشر عطل.' },
    { id: 'battery.swelling', stage: 'battery', category: 'battery', weight: 4, critical: true,
      ar: 'انتفاخ البطارية', en: 'Battery Swelling',
      hint: 'افحص ارتفاع الشاشة عن الإطار أو تقوّس الظهر.' },

    /* 7 — Charging */
    { id: 'charging.wired', stage: 'charging', category: 'battery', weight: 4, critical: true,
      ar: 'الشحن السلكي', en: 'Wired Charging', runner: 'chargingDetect',
      hint: 'وصّل الشاحن — سيُكتشف تغيّر حالة الشحن تلقائيًا.' },
    { id: 'charging.wireless', stage: 'charging', category: 'battery', weight: 2,
      ar: 'الشحن اللاسلكي', en: 'Wireless Charging', runner: 'chargingDetect', options: { wireless: true },
      hint: 'ضع الجهاز على قاعدة الشحن اللاسلكي.', applies: has('wirelessCharging') },
    { id: 'charging.port', stage: 'charging', category: 'battery', weight: 3,
      ar: 'حالة منفذ الشحن', en: 'Charging Port',
      hint: 'افحص المنفذ من الغبار والتآكل وثبات الكيبل.' },

    /* 8 — Wi-Fi */
    { id: 'wifi.link', stage: 'wifi', category: 'connectivity', weight: 3,
      ar: 'الاتصال والاستجابة', en: 'Link & Latency', runner: 'networkTest',
      hint: 'قياس الاتصال الفعلي وزمن الاستجابة.' },
    { id: 'wifi.stability', stage: 'wifi', category: 'connectivity', weight: 2,
      ar: 'ثبات الإشارة', en: 'Signal Stability',
      hint: 'ابتعد عن الراوتر وراقب ثبات الاتصال.' },

    /* 9 — Bluetooth */
    { id: 'bt.radio', stage: 'bluetooth', category: 'connectivity', weight: 2,
      ar: 'مذياع البلوتوث', en: 'Bluetooth Radio', runner: 'bluetoothTest',
      hint: 'التحقق من تفعيل البلوتوث وإمكانية البحث عن الأجهزة.', applies: has('bluetooth') },
    { id: 'bt.pairing', stage: 'bluetooth', category: 'connectivity', weight: 2,
      ar: 'الاقتران وتشغيل الصوت', en: 'Pairing & Audio',
      hint: 'اقترن بسمّاعة وشغّل صوتًا لثوانٍ.', applies: has('bluetooth') },

    /* 10 — Cellular */
    { id: 'cell.sim1', stage: 'cellular', category: 'connectivity', weight: 5, critical: true,
      ar: 'قراءة الشريحة الأولى', en: 'SIM 1 Detection',
      hint: 'أدخل الشريحة وتأكد من ظهور اسم المزوّد والإشارة.', applies: has('cellular') },
    { id: 'cell.sim2', stage: 'cellular', category: 'connectivity', weight: 2,
      ar: 'قراءة الشريحة الثانية', en: 'SIM 2 Detection',
      hint: 'للأجهزة ثنائية الشريحة فقط.', applies: has('dualSim') },
    { id: 'cell.call', stage: 'cellular', category: 'connectivity', weight: 4, critical: true,
      ar: 'مكالمة اختبارية', en: 'Test Call',
      hint: 'أجرِ مكالمة قصيرة — تحقق من الصوت بالاتجاهين.', applies: has('cellular') },
    { id: 'cell.data', stage: 'cellular', category: 'connectivity', weight: 3,
      ar: 'بيانات الشبكة', en: 'Mobile Data', runner: 'networkTest', options: { expect: 'cellular' },
      hint: 'أطفئ الواي فاي واختبر البيانات.', applies: has('cellular') },

    /* 11 — NFC */
    { id: 'nfc.read', stage: 'nfc', category: 'connectivity', weight: 2,
      ar: 'قراءة بطاقة NFC', en: 'NFC Read', runner: 'nfcTest',
      hint: 'قرّب بطاقة NFC من ظهر الجهاز.', applies: has('nfc') },

    /* 12 — GPS */
    { id: 'gps.fix', stage: 'gps', category: 'sensors', weight: 3,
      ar: 'التقاط الموقع', en: 'Location Fix', runner: 'gpsTest',
      hint: 'قياس زمن التقاط الإشارة ودقّتها بالأمتار.', applies: has('gps') },

    /* 13 — Sensors */
    { id: 'sensor.accel', stage: 'sensors', category: 'sensors', weight: 3,
      ar: 'حسّاس التسارع', en: 'Accelerometer', runner: 'motionTest',
      hint: 'حرّك الجهاز بالاتجاهات الثلاثة — القراءات تتغيّر حيًّا.' },
    { id: 'sensor.gyro', stage: 'sensors', category: 'sensors', weight: 2,
      ar: 'الجيروسكوب', en: 'Gyroscope', runner: 'orientationTest',
      hint: 'أدر الجهاز — زوايا الميلان تتغيّر حيًّا.', applies: has('gyroscope') },
    { id: 'sensor.compass', stage: 'sensors', category: 'sensors', weight: 1,
      ar: 'البوصلة', en: 'Compass', runner: 'compassTest',
      hint: 'أدر الجهاز أفقيًا 360 درجة.', applies: has('compass') },
    { id: 'sensor.proximity', stage: 'sensors', category: 'sensors', weight: 2,
      ar: 'حسّاس القرب', en: 'Proximity Sensor',
      hint: 'أثناء المكالمة، غطِّ أعلى الشاشة — يجب أن تنطفئ.', applies: has('proximity') },
    { id: 'sensor.light', stage: 'sensors', category: 'sensors', weight: 1,
      ar: 'حسّاس الإضاءة', en: 'Ambient Light',
      hint: 'فعّل السطوع التلقائي وغطِّ الحسّاس.', applies: has('ambientLight') },

    /* 14 — Face ID / Fingerprint */
    { id: 'bio.face', stage: 'biometrics', category: 'other', weight: 4,
      ar: 'التعرّف على الوجه', en: 'Face Unlock', runner: 'biometricTest',
      hint: 'سجّل وجهًا جديدًا وافتح القفل مرّتين.', applies: has('faceId') },
    { id: 'bio.finger', stage: 'biometrics', category: 'other', weight: 4,
      ar: 'بصمة الإصبع', en: 'Fingerprint', runner: 'biometricTest',
      hint: 'سجّل بصمة جديدة وافتح القفل مرّتين.', applies: has('fingerprint') },

    /* 15 — Buttons */
    { id: 'buttons.hardware', stage: 'buttons', category: 'other', weight: 4, critical: true,
      ar: 'الأزرار الفيزيائية', en: 'Hardware Buttons', runner: 'buttonsTest',
      hint: 'اضغط كل زر وسجّل استجابته.' },

    /* 16 — Vibration */
    { id: 'vibration.motor', stage: 'vibration', category: 'other', weight: 2,
      ar: 'محرّك الهزّاز', en: 'Vibration Motor', runner: 'vibrationTest',
      hint: 'تشغيل نمط اهتزاز — تحقق من قوّته وصوته.', applies: has('vibration') },

    /* 17 — Flash */
    { id: 'flash.torch', stage: 'flash', category: 'camera', weight: 2,
      ar: 'فلاش الكاميرا', en: 'Camera Flash', runner: 'torchTest',
      hint: 'تشغيل وإطفاء الفلاش والتحقق من الشدّة.', applies: has('torch') },

    /* 18 — Connectivity */
    { id: 'conn.port_data', stage: 'connectivity', category: 'connectivity', weight: 3,
      ar: 'نقل البيانات عبر المنفذ', en: 'Data over Port',
      hint: 'وصّل الجهاز بالحاسبة وتأكد من ظهور التخزين.' },
    { id: 'conn.sim_tray', stage: 'connectivity', category: 'connectivity', weight: 2,
      ar: 'درج الشريحة', en: 'SIM Tray',
      hint: 'افحص الدرج والمسامير وأثر الماء.', applies: has('cellular') },
    { id: 'conn.hotspot', stage: 'connectivity', category: 'connectivity', weight: 1,
      ar: 'نقطة الاتصال', en: 'Hotspot',
      hint: 'شغّل نقطة الاتصال واربط جهازًا آخر.', applies: has('cellular') },
    { id: 'conn.lock', stage: 'connectivity', category: 'other', weight: 5, critical: true,
      ar: 'قفل الحساب والشبكة', en: 'Account / Network Lock',
      hint: 'تأكد من عدم وجود قفل iCloud أو FRP أو قفل مزوّد الشبكة.' }
  ];

  var TEST_INDEX = {};
  TESTS.forEach(function (t) { TEST_INDEX[t.id] = t; });

  var STAGE_INDEX = {};
  STAGES.forEach(function (s) { STAGE_INDEX[s.id] = s; });

  var CATEGORY_INDEX = {};
  CATEGORIES.forEach(function (c) { CATEGORY_INDEX[c.id] = c; });

  /**
   * خطة الفحص لجهاز معيّن: كل الاختبارات مع تحديد المنطبق منها.
   * الاختبارات غير المنطبقة تُسجَّل تلقائيًا "غير مدعوم" مع السبب.
   */
  function planFor(device) {
    var caps = ERP.inventory.capsFor(device);
    return TESTS.map(function (t) {
      var applicable = t.applies ? !!t.applies(caps, device) : true;
      return {
        id: t.id,
        applicable: applicable,
        reason: applicable ? null : 'غير متوفّرة على هذا الموديل'
      };
    });
  }

  function stageTests(stageId) {
    return TESTS.filter(function (t) { return t.stage === stageId; });
  }

  function gradeFor(score) {
    for (var i = 0; i < GRADES.length; i++) {
      if (score >= GRADES[i].min) return GRADES[i];
    }
    return GRADES[GRADES.length - 1];
  }

  DI.catalog = {
    STATUS: STATUS,
    STATUS_META: STATUS_META,
    CATEGORIES: CATEGORIES,
    CATEGORY_INDEX: CATEGORY_INDEX,
    GRADES: GRADES,
    PURPOSES: PURPOSES,
    STAGES: STAGES,
    STAGE_INDEX: STAGE_INDEX,
    TESTS: TESTS,
    TEST_INDEX: TEST_INDEX,
    test: function (id) { return TEST_INDEX[id]; },
    stage: function (id) { return STAGE_INDEX[id]; },
    stageTests: stageTests,
    planFor: planFor,
    gradeFor: gradeFor
  };
})(window);
