/* ==========================================================================
   مكتب سفيان للموبايل — محرّك المطبوعات
   لا يعتمد على أي مكتبة خارجية. يعمل في المتصفح مباشرة أو عبر <script>.

   الاستخدام من البرنامج:
     SufyanPrint.html("sticker.phone", data)   → نص HTML للملصق
     SufyanPrint.mount(el, "sticker.phone", data)
     SufyanPrint.print("sticker.phone", data)  → يفتح نافذة الطباعة بالمقاس الصحيح
     SufyanPrint.printMany("sticker.accessory", [d1, d2, ...])
     SufyanPrint.SIZES["sticker.phone"]        → { w: 75, h: 50 }
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SufyanPrint = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ======================================================================
     بيانات المحل — عدّلها من مكان واحد
     ====================================================================== */
  var SHOP = {
    name: "مكتب سفيان للموبايل",
    latin: "SUFYAN MOBILE",
    address: "سامراء — الحويش — الشارع الرئيسي",
    phone1: "0773 164 4450",
    phone2: "0774 448 5771",
    net: "0772 909 6991",
    hours: "يومياً 9:00 — 22:00"
  };

  /* ======================================================================
     المقاسات الحقيقية بالمليمتر
     ====================================================================== */
  var SIZES = {
    "sticker.service":   { w: 90,  h: 50,  label: "ستيكر الصيانة" },
    "sticker.phone":     { w: 75,  h: 50,  label: "ستيكر الموبايلات" },
    "sticker.accessory": { w: 50,  h: 30,  label: "ستيكر الإكسسوارات" },
    "sticker.box":       { w: 60,  h: 40,  label: "ستيكر العلب" },
    "sticker.small":     { w: 40,  h: 25,  label: "ستيكر القطع الصغيرة" },
    "sticker.void":      { w: 25,  h: 15,  label: "ستيكر قابل للكسر" },
    "sticker.voidRound": { w: 20,  h: 20,  label: "ستيكر قابل للكسر — دائري" },
    "sticker.logoRound": { w: 54,  h: 54,  label: "ستيكر الشعار الدائري" },
    "sticker.badge":     { w: 40,  h: 40,  label: "شارة دائرية" },
    "sticker.bar":       { w: 80,  h: 25,  label: "شريط واتساب / الاسم" },
    "sticker.icon":      { w: 20,  h: 20,  label: "أيقونة صغيرة" },
    "sticker.price":     { w: 54,  h: 29,  label: "ملصق السعر" },
    "sticker.seal":      { w: 170, h: 14,  label: "شريط الختم" },
    "thermal.serviceCustomer": { w: 80, h: null, label: "وصل صيانة 80 مم — نسخة الزبون" },
    "thermal.serviceShop":     { w: 80, h: null, label: "وصل صيانة 80 مم — نسخة المحل" },
    "thermal.sale":            { w: 80, h: null, label: "فاتورة بيع جهاز 80 مم" }
  };

  /* ======================================================================
     أدوات
     ====================================================================== */
  /** يعزل نصاً لاتينياً داخل فقرة عربية بمحارف يونيكود — لا يعتمد على CSS */
  function ltr(v) { return "\u2066" + v + "\u2069"; }

  function esc(v) {
    if (v === null || v === undefined) return "";
    return String(v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /** 385000 → "385,000" */
  function money(n) {
    if (n === null || n === undefined || n === "") return "";
    var num = typeof n === "number" ? n : Number(String(n).replace(/[^\d.-]/g, ""));
    if (!isFinite(num)) return esc(n);
    return num.toLocaleString("en-US");
  }

  function iqd(n) { return money(n) + " د.ع"; }

  /** صف في قائمة تعريف — يُحذف كلياً إذا كانت القيمة فارغة */
  function row(dt, dd, opts) {
    if (dd === null || dd === undefined || dd === "") return "";
    var isLtr = opts && opts.ltr;
    var cls = isLtr ? ' class="sp-num"' : "";
    var val = isLtr ? ltr(esc(dd)) : esc(dd);
    return "<dt>" + esc(dt) + "</dt><dd" + cls + ">" + val + "</dd>";
  }

  /* ======================================================================
     الرمز — ثلاثة أعمدة، بلا قاعدة (مطابق لـ brand/mark.svg)
     ====================================================================== */
  function mark(variant) {
    return '<svg class="sp-mark sp-mark--' + (variant || "deep") + '" viewBox="0 0 100 100" aria-hidden="true">' +
      '<rect x="16.75" y="49" width="16.5" height="30" rx="8.25"/>' +
      '<rect x="41.75" y="35" width="16.5" height="44" rx="8.25"/>' +
      '<rect x="66.75" y="21" width="16.5" height="58" rx="8.25"/>' +
      "</svg>";
  }

  /* ======================================================================
     باركود Code 128 — تنفيذ كامل بلا مكتبات
     ====================================================================== */
  var C128 = [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
    "114131","311141","411131","211412","211214","211232","2331112"
  ];
  var START_B = 104, START_C = 105, STOP = 106;

  /** يحوّل النص إلى قيم Code 128 (يختار C للأرقام الزوجية الصِرفة، وإلا B) */
  function c128values(text) {
    var s = String(text);
    var values = [];
    if (/^\d+$/.test(s) && s.length % 2 === 0) {
      values.push(START_C);
      for (var i = 0; i < s.length; i += 2) values.push(parseInt(s.substr(i, 2), 10));
    } else {
      values.push(START_B);
      for (var j = 0; j < s.length; j++) {
        var code = s.charCodeAt(j);
        // Code B يغطي ASCII 32..126 — أي شيء خارجه يُستبدل بمسافة
        values.push(code >= 32 && code <= 126 ? code - 32 : 0);
      }
    }
    var sum = values[0];
    for (var k = 1; k < values.length; k++) sum += values[k] * k;
    values.push(sum % 103);
    values.push(STOP);
    return values;
  }

  /**
   * باركود Code 128 كـ SVG يملأ العرض المتاح.
   * @param {string} text النص المُرمَّز
   * @param {object} [opts] { height: نسبة ارتفاع الأشرطة 0..1, quiet: وحدات الهامش }
   */
  function barcode(text, opts) {
    opts = opts || {};
    var quiet = opts.quiet === undefined ? 10 : opts.quiet;
    var values = c128values(text);
    var bars = [], x = quiet, total;

    for (var i = 0; i < values.length; i++) {
      var pattern = C128[values[i]];
      for (var j = 0; j < pattern.length; j++) {
        var w = parseInt(pattern[j], 10);
        if (j % 2 === 0) bars.push('<rect x="' + x + '" y="0" width="' + w + '" height="100"/>');
        x += w;
      }
    }
    total = x + quiet;

    return '<svg class="sp-barcode" viewBox="0 0 ' + total + ' 100" preserveAspectRatio="none" ' +
      'role="img" aria-label="' + esc(text) + '">' + bars.join("") + "</svg>";
  }

  /* ======================================================================
     القوالب
     ====================================================================== */
  var T = {};

  /* --- 1) ستيكر الصيانة 90×50 --- */
  T["sticker.service"] = function (d) {
    return '<div class="sp-service">' +
      '<div class="sp-service__head">' +
        '<div class="sp-service__title">' + mark("deep") + "<span>وصل صيانة</span></div>" +
        '<div class="sp-service__code sp-num">' + esc(d.code || "") + "</div>" +
      "</div>" +
      '<dl class="sp-service__rows">' +
        row("الزبون", d.customer) +
        row("الهاتف", d.phone, { ltr: true }) +
        row("الجهاز", d.device) +
        row("IMEI", d.imei, { ltr: true }) +
        row("الخلل", d.fault) +
      "</dl>" +
      '<div class="sp-service__foot">' +
        '<div class="sp-service__phone sp-num">' + esc(d.shopPhone || SHOP.phone1) + "</div>" +
        (d.code ? barcode(d.code) : "") +
      "</div>" +
    "</div>";
  };

  /* --- 2) ستيكر الهاتف 75×50 --- */
  T["sticker.phone"] = function (d) {
    return '<div class="sp-phone">' +
      '<div class="sp-phone__head">' +
        '<div class="sp-phone__name">' + esc(d.name || "") + mark("deep") + "</div>" +
        '<div class="sp-phone__price"><span class="sp-num">' + money(d.price) + "</span><small>د.ع</small></div>" +
      "</div>" +
      '<div class="sp-phone__rule"></div>' +
      '<dl class="sp-phone__rows">' +
        row("الذاكرة", d.storage) +
        row("اللون", d.color) +
        row("IMEI", d.imei, { ltr: true }) +
        row("البطارية", d.battery) +
        row("الحالة", d.condition) +
        row("ملاحظات", d.notes) +
      "</dl>" +
      '<div class="sp-phone__foot">' + barcode(d.sku || d.imei || "") + "</div>" +
    "</div>";
  };

  /* --- 3–5) الإكسسوارات / العلب / القطع الصغيرة --- */
  function itemTemplate(d) {
    return '<div class="sp-item">' +
      "<div>" +
        '<div class="sp-item__name">' + esc(d.name || "") + "</div>" +
        (d.spec ? '<div class="sp-item__spec">' + esc(d.spec) + "</div>" : "") +
      "</div>" +
      '<div class="sp-item__price"><span class="sp-num">' + money(d.price) + "</span> د.ع</div>" +
      '<div class="sp-item__foot">' + barcode(d.sku || "") + "</div>" +
    "</div>";
  }
  T["sticker.accessory"] = itemTemplate;
  T["sticker.box"] = itemTemplate;
  T["sticker.small"] = itemTemplate;

  /* --- 6) الستيكر القابل للكسر --- */
  T["sticker.void"] = function (d) {
    return '<div class="sp-void">' +
      mark("sand") +
      '<div class="sp-void__word sp-latin">VOID</div>' +
      '<div class="sp-void__note">' + esc(d.note || "الكفالة تسقط عند النزع") + "</div>" +
      (d.serial ? '<div class="sp-void__serial sp-num">' + esc(d.serial) + "</div>" : "") +
    "</div>";
  };
  T["sticker.voidRound"] = function (d) {
    return '<div class="sp-void sp-void--round">' +
      mark("sand") +
      '<div class="sp-void__word sp-latin">VOID</div>' +
      '<div class="sp-void__serial sp-num">' + esc(d.serial || "") + "</div>" +
    "</div>";
  };

  /* --- 7) الشعار الدائري --- */
  T["sticker.logoRound"] = function (d) {
    var light = d && d.variant === "light";
    return '<div class="sp-round' + (light ? " sp-round--light" : "") + '">' +
      mark(light ? "deep" : "sand") +
      '<div class="sp-round__name">' + esc(SHOP.name) + "</div>" +
      '<div class="sp-round__latin">' + esc(SHOP.latin) + "</div>" +
    "</div>";
  };

  /* --- 8) الشارات --- */
  var BADGE_ICONS = {
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z"/></svg>',
    check:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.5"/></svg>',
    heart:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.6-7 9-7 9z"/></svg>'
  };
  T["sticker.badge"] = function (d) {
    var bg = d.bg || "var(--sp-deep)", fg = d.fg || "var(--sp-sand)";
    return '<div class="sp-badge" style="background:' + bg + ";color:" + fg + '">' +
      (BADGE_ICONS[d.icon] || BADGE_ICONS.shield) +
      '<div class="sp-badge__text">' + esc(d.text || "") + "</div>" +
    "</div>";
  };

  /* --- 9) الشريط --- */
  T["sticker.bar"] = function (d) {
    var light = d.variant === "light";
    return '<div class="sp-bar' + (light ? " sp-bar--light" : "") + '">' +
      '<div class="sp-bar__stack">' +
        '<div class="sp-bar__label">' + esc(d.label || "اطلب عبر واتساب") + "</div>" +
        (d.sub === "" ? "" : '<div class="sp-bar__sub sp-num">' + esc(d.sub || SHOP.phone1) + "</div>") +
      "</div>" +
      mark(light ? "deep" : "sand") +
    "</div>";
  };

  /* --- 10) الأيقونة --- */
  T["sticker.icon"] = function (d) {
    d = d || {};
    var cls = "sp-icon";
    if (d.shape === "round") cls += " sp-icon--round";
    if (d.tone) cls += " sp-icon--" + d.tone;
    return '<div class="' + cls + '">' + mark(d.tone === "light" ? "deep" : "sand") + "</div>";
  };

  /* --- 11) ملصق السعر --- */
  T["sticker.price"] = function (d) {
    var dark = d.variant === "dark";
    return '<div class="sp-price' + (dark ? " sp-price--dark" : "") + '">' +
      "<div>" +
        '<div class="sp-price__label">' + esc(d.label || "السعر") + "</div>" +
        '<div class="sp-price__value"><span class="sp-num">' + money(d.price) + "</span> <small>د.ع</small></div>" +
      "</div>" +
      mark(dark ? "sand" : "deep") +
    "</div>";
  };

  /* --- 12) شريط الختم --- */
  T["sticker.seal"] = function (d) {
    d = d || {};
    return '<div class="sp-seal">' +
      '<div class="sp-seal__bars"><i></i><i></i><i></i></div>' +
      '<div class="sp-seal__text">' + esc(d.text || "مغلق بإحكام — " + SHOP.name) + "</div>" +
      '<div class="sp-seal__phone sp-num">' + esc(d.phone || SHOP.phone1) + "</div>" +
      '<div class="sp-seal__bars"><i></i><i></i><i></i></div>' +
    "</div>";
  };

  /* ======================================================================
     الوصولات الحرارية 80 مم
     ====================================================================== */
  function rollHead() {
    return '<div class="sp-roll__head">' +
      mark("black") +
      '<div class="sp-roll__shop">' + esc(SHOP.name) + "</div>" +
      '<div class="sp-roll__latin">' + esc(SHOP.latin) + "</div>" +
      '<div class="sp-roll__contact">' + esc(SHOP.address) +
        '<br><span class="sp-num">' + ltr(esc(SHOP.phone1) + "  ·  " + esc(SHOP.phone2)) + "</span>" +
        '<br>إنترنت: <span class="sp-num">' + ltr(esc(SHOP.net)) + "</span>" +
      "</div>" +
    "</div>";
  }

  function rollFoot(code, thanks) {
    return '<div class="sp-roll__foot">' +
      (code ? barcode(code) + '<div class="sp-roll__doc-code sp-num">' + esc(code) + "</div>" : "") +
      (thanks ? '<div class="sp-roll__thanks">' + esc(thanks) + "</div>" : "") +
    "</div>";
  }

  var SERVICE_TERMS = [
    "المحل غير مسؤول عن البيانات داخل الجهاز — يُرجى أخذ نسخة احتياطية.",
    "الجهاز غير المستلَم خلال 30 يوماً من موعد التسليم لا يتحمّل المحل مسؤوليته.",
    "لا يُسلَّم الجهاز إلا بإبراز هذا الوصل أو مسح الباركود.",
    "الكلفة تقديرية وقد تتغيّر بعد الفحص، ولا يُباشَر التصليح إلا بموافقتك."
  ];

  function serviceBody(d, opts) {
    opts = opts || {};
    var paid = Number(d.paid || 0);
    var estimate = Number(d.estimate || 0);
    var rest = d.rest !== undefined ? Number(d.rest) : Math.max(estimate - paid, 0);

    var html =
      '<div class="sp-roll__doc">' +
        '<div class="sp-roll__doc-title">وصل استلام صيانة</div>' +
        '<div class="sp-roll__doc-code sp-num">' + esc(d.code || "") + "</div>" +
      "</div>" +
      '<hr class="sp-roll__rule">' +
      '<dl class="sp-roll__rows">' +
        row("التاريخ", d.date, { ltr: true }) +
        row("الموظّف", d.staff) +
      "</dl>" +

      '<div class="sp-roll__section">بيانات الزبون</div>' +
      '<dl class="sp-roll__rows">' +
        row("الاسم", d.customer) +
        row("الهاتف", d.phone, { ltr: true }) +
      "</dl>" +

      '<div class="sp-roll__section">بيانات الجهاز</div>' +
      '<dl class="sp-roll__rows">' +
        row("الجهاز", d.device) +
        row("IMEI", d.imei, { ltr: true }) +
        row("رمز القفل", d.lock, { ltr: true }) +
        row("الملحقات", d.accessories) +
        row("نوع الخلل", Array.isArray(d.faults) ? d.faults.join(" · ") : d.faults) +
      "</dl>";

    if (d.description) {
      html += '<div class="sp-roll__section">وصف الخلل</div>' +
        '<p class="sp-roll__free">' + esc(d.description) + "</p>";
    }

    html += '<div class="sp-roll__section">الموعد والكلفة</div>' +
      '<dl class="sp-roll__totals">' +
        row("موعد التسليم", d.due, { ltr: true }) +
        row("الكلفة التقديرية", iqd(estimate)) +
        row("المدفوع مقدّماً", iqd(paid)) +
        '<dt class="sp-roll__grand">المتبقّي عند الاستلام</dt>' +
        '<dd class="sp-roll__grand sp-num">' + iqd(rest) + "</dd>" +
      "</dl>";

    if (opts.terms) {
      html += '<div class="sp-roll__section">شروط الاستلام</div><ul class="sp-roll__terms">' +
        SERVICE_TERMS.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") +
        "</ul>";
    }
    if (opts.sign) {
      html += '<div class="sp-roll__sign"><div>توقيع الزبون</div><div>توقيع المحل</div></div>';
    }
    return html;
  }

  T["thermal.serviceCustomer"] = function (d) {
    return '<div class="sp-roll">' + rollHead() +
      serviceBody(d, { terms: true, sign: false }) +
      '<hr class="sp-roll__rule sp-roll__rule--solid">' +
      rollFoot(d.code, "شكراً لثقتك 🤍") +
      "</div>";
  };

  T["thermal.serviceShop"] = function (d) {
    return '<div class="sp-roll">' + rollHead() +
      '<div class="sp-roll__doc"><div class="sp-roll__doc-title">نسخة المحل</div></div>' +
      serviceBody(d, { terms: false, sign: true }) +
      '<hr class="sp-roll__rule sp-roll__rule--solid">' +
      rollFoot(d.code, "") +
      "</div>";
  };

  var SALE_TERMS = [
    "الكفالة تشمل عيوب التصنيع فقط ولا تشمل الكسر أو الماء.",
    "الملصق القابل للكسر على الجهاز يجب أن يبقى سليماً — نزعه يُسقِط الكفالة.",
    "الاستبدال خلال 3 أيام بشرط سلامة الجهاز وكامل ملحقاته وعلبته.",
    "احتفظ بهذا الوصل — لا تُقبل مراجعة الكفالة بدونه."
  ];

  T["thermal.sale"] = function (d) {
    var items = d.items || [];
    var subtotal = d.subtotal !== undefined ? Number(d.subtotal) : items.reduce(function (s, it) {
      return s + Number(it.price || 0) * Number(it.qty || 1);
    }, 0);
    var discount = Number(d.discount || 0);
    var total = d.total !== undefined ? Number(d.total) : subtotal - discount;
    var paid = Number(d.paid || 0);
    var rest = d.rest !== undefined ? Number(d.rest) : Math.max(total - paid, 0);

    var rows = items.map(function (it) {
      return "<tr><td>" + esc(it.name || "") +
        (it.detail ? '<br><span class="sp-roll__qty">' + esc(it.detail) + "</span>" : "") +
        (Number(it.qty || 1) > 1 ? '<br><span class="sp-roll__qty sp-num">' + esc(it.qty) + " × " + money(it.price) + "</span>" : "") +
        '</td><td class="sp-num">' + money(Number(it.price || 0) * Number(it.qty || 1)) + "</td></tr>";
    }).join("");

    return '<div class="sp-roll">' + rollHead() +
      '<div class="sp-roll__doc">' +
        '<div class="sp-roll__doc-title">فاتورة بيع</div>' +
        '<div class="sp-roll__doc-code sp-num">' + esc(d.code || "") + "</div>" +
      "</div>" +
      '<hr class="sp-roll__rule">' +
      '<dl class="sp-roll__rows">' +
        row("التاريخ", d.date, { ltr: true }) +
        row("الزبون", d.customer) +
        row("الهاتف", d.phone, { ltr: true }) +
        row("الموظّف", d.staff) +
      "</dl>" +

      '<table class="sp-roll__items"><thead><tr><th>الصنف</th><th>المبلغ</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table>" +

      '<dl class="sp-roll__totals">' +
        row("المجموع", iqd(subtotal)) +
        (discount ? row("الخصم", "− " + iqd(discount)) : "") +
        '<dt class="sp-roll__grand">الإجمالي</dt><dd class="sp-roll__grand sp-num">' + iqd(total) + "</dd>" +
        (paid ? row("المدفوع", iqd(paid)) : "") +
        (rest ? row("المتبقّي", iqd(rest)) : "") +
      "</dl>" +

      (d.imei ? '<div class="sp-roll__section">بيانات الجهاز</div><dl class="sp-roll__rows">' +
        row("IMEI", d.imei, { ltr: true }) + row("الكفالة", d.warranty) + "</dl>" : "") +

      '<div class="sp-roll__section">الكفالة والاستبدال</div><ul class="sp-roll__terms">' +
        SALE_TERMS.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") +
      "</ul>" +

      '<hr class="sp-roll__rule sp-roll__rule--solid">' +
      rollFoot(d.code, "شكراً لطلبك 🤍") +
      "</div>";
  };

  /* ======================================================================
     التركيب والطباعة
     ====================================================================== */
  function sizeOf(kind) {
    var s = SIZES[kind];
    if (!s) throw new Error("SufyanPrint: نوع غير معروف — " + kind);
    return s;
  }

  /** نص HTML للمطبوع، ملفوف بالغلاف الذي يحمل المقاس الحقيقي */
  function html(kind, data) {
    var s = sizeOf(kind);
    var body = T[kind](data || {});
    var isRoll = s.h === null;
    var style = "--sp-w:" + s.w + (isRoll ? "" : ";--sp-h:" + s.h);
    return '<div class="sp' + (isRoll ? " sp--roll" : "") + '" data-kind="' + kind + '" style="' + style + '">' + body + "</div>";
  }

  function mount(el, kind, data) {
    var target = typeof el === "string" ? document.querySelector(el) : el;
    target.innerHTML = html(kind, data);
    return target.firstChild;
  }

  /** قاعدة @page المطابقة للمقاس — بدونها يطبع المتصفح على A4 */
  function pageRule(kind) {
    var s = sizeOf(kind);
    return s.h === null
      ? "@page { size: " + s.w + "mm auto; margin: 0; }"
      : "@page { size: " + s.w + "mm " + s.h + "mm; margin: 0; }";
  }

  function assetBase() {
    var el = document.querySelector('link[href*="sufyan-print.css"], script[src*="sufyan-print.js"]');
    if (!el) return "assets/";
    var src = el.getAttribute("href") || el.getAttribute("src");
    return src.replace(/[^/]+$/, "");
  }

  /** يفتح نافذة طباعة معزولة بالمقاس الصحيح */
  function printHTML(kind, inner) {
    var base = assetBase();
    var frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0";
    document.body.appendChild(frame);

    var doc = frame.contentDocument;
    doc.open();
    doc.write(
      '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
      '<link rel="stylesheet" href="' + base + 'sufyan-print.css">' +
      "<style>html,body{margin:0;padding:0}" + pageRule(kind) + "</style>" +
      "</head><body>" + inner + "</body></html>"
    );
    doc.close();

    var done = function () {
      // مهلة قصيرة حتى تُحمَّل الخطوط قبل الطباعة
      setTimeout(function () {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(function () { frame.remove(); }, 1000);
      }, 350);
    };
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(done, done);
    else frame.onload = done;
  }

  function print(kind, data) { printHTML(kind, html(kind, data)); }

  function printMany(kind, list) {
    printHTML(kind, (list || []).map(function (d) { return html(kind, d); }).join(""));
  }

  /* ======================================================================
     بيانات نموذجية — للمعاينة والاختبار
     ====================================================================== */
  var SAMPLES = {
    "sticker.service": {
      code: "SFN-01427", customer: "أحمد عبد الله", phone: "0771 234 5678",
      device: "Samsung Galaxy A54", imei: "356938035643809", fault: "شاشة + شحن"
    },
    "sticker.phone": {
      name: "Samsung Galaxy A54", price: 385000, storage: "128GB · 8GB RAM", color: "أسود",
      imei: "356938035643809", battery: "92%", condition: "مستعمل — ممتاز",
      notes: "خدش بسيط بزاوية الشاشة", sku: "SFN-PH-1042"
    },
    "sticker.accessory": { name: "سماعة بلوتوث لاسلكية", price: 35000, sku: "SFN-AC-2211" },
    "sticker.box":       { name: "باور بانك 10000mAh", spec: "شحن سريع 22.5W", price: 28000, sku: "SFN-BX-3390" },
    "sticker.small":     { name: "محوّل OTG", price: 4500, sku: "SFN-SM-4108" },
    "sticker.void":      { serial: "VD-004182" },
    "sticker.voidRound": { serial: "VD-004182" },
    "sticker.logoRound": { variant: "dark" },
    "sticker.badge":     { text: "كفالة سنة", icon: "shield", bg: "var(--sp-deep)", fg: "var(--sp-gold)" },
    "sticker.bar":       { label: "اطلب عبر واتساب", sub: SHOP.phone1 },
    "sticker.icon":      { shape: "square", tone: "deep" },
    "sticker.price":     { price: 385000 },
    "sticker.seal":      {},
    "thermal.serviceCustomer": {
      code: "SFN-01427", date: "2026-09-06 · 12:40", staff: "سفيان",
      customer: "أحمد عبد الله حسين", phone: "0771 234 5678",
      device: "Samsung Galaxy A54", imei: "356938035643809", lock: "1234",
      accessories: "كفر فقط", faults: ["شاشة", "شحن"],
      description: "الشاشة مكسورة من الزاوية العليا واللمس ما يشتغل بالنص. الشحن يفصل ويرجع.",
      due: "2026-09-08", estimate: 85000, paid: 25000
    },
    "thermal.sale": {
      code: "SFN-B-00318", date: "2026-09-09 · 18:05", customer: "مصطفى كريم",
      phone: "0770 555 1234", staff: "سفيان",
      items: [
        { name: "Samsung Galaxy A54", detail: "128GB · أسود · جديد", price: 385000, qty: 1 },
        { name: "زجاج حماية شاشة", price: 5000, qty: 1 },
        { name: "حافظة سيليكون", price: 6000, qty: 2 }
      ],
      discount: 2000, paid: 400000, imei: "356938035643809", warranty: "سنة كاملة — عيوب التصنيع"
    }
  };
  SAMPLES["thermal.serviceShop"] = SAMPLES["thermal.serviceCustomer"];

  /* ====================================================================== */
  return {
    SHOP: SHOP,
    SIZES: SIZES,
    SAMPLES: SAMPLES,
    html: html,
    mount: mount,
    print: print,
    printMany: printMany,
    pageRule: pageRule,
    barcode: barcode,
    mark: mark,
    money: money,
    iqd: iqd
  };
});
