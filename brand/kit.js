/* ==========================================================================
   مكتب سفيان للموبايل — ألواح الهوية البصرية
   كل لوح دالة تُرجع HTML. تعمل في Node (للبناء) وفي المتصفح.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SufyanKit = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SHOP = {
    name: "مكتب سفيان للموبايل",
    latin: "SUFYAN MOBILE",
    tagline: "شاشتك الجاية تبدأ من هنا",
    address: "سامراء — الحويش — الشارع الرئيسي",
    phone1: "0773 164 4450",
    phone2: "0774 448 5771",
    net: "0772 909 6991",
    hours: "يومياً 9:00 — 22:00",
    wa: "wa.me/9647731644450"
  };

  var C = {
    deep: "#14343F", teal: "#2F6F6B", gold: "#C8A96A",
    sand: "#F2EDE4", mist: "#9CC0BB", ink: "#101E24",
    deep2: "#1B4350", sand3: "#FBF9F5"
  };

  /* ---------------------------------------------------------------- الرمز */
  function mark(bars, accent) {
    bars = bars || C.deep;
    accent = accent || C.gold;
    return '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true">' +
      '<rect x="16.75" y="49" width="16.5" height="30" rx="8.25" fill="' + bars + '"/>' +
      '<rect x="41.75" y="35" width="16.5" height="44" rx="8.25" fill="' + bars + '"/>' +
      '<rect x="66.75" y="21" width="16.5" height="58" rx="8.25" fill="' + accent + '"/>' +
      "</svg>";
  }

  /* -------------------------------------------------------------- أيقونات */
  var I = {
    phone:   '<path d="M6.5 3h3l1.5 4-2 1.4a12 12 0 006.6 6.6L17 13l4 1.5v3a2 2 0 01-2.2 2A16.5 16.5 0 014.5 5.2 2 2 0 016.5 3z"/>',
    whatsapp:'<path d="M12 3a9 9 0 00-7.7 13.6L3 21l4.5-1.2A9 9 0 1012 3z"/><path d="M8.6 8.4c.2-.5.5-.5.8-.5h.6l1 2.2-.8.8a7 7 0 003.3 3.3l.8-.8 2.2 1v.6c0 .4-.1.7-.6.9a4 4 0 01-3.6-.6 11 11 0 01-3.7-3.7 4 4 0 01-.6-3.2z"/>',
    pin:     '<path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    clock:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.4 2"/>',
    globe:   '<circle cx="12" cy="12" r="9"/><path d="M3.3 9h17.4M3.3 15h17.4M12 3a15 15 0 010 18 15 15 0 010-18z"/>',
    shield:  '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z"/><path d="M9 12.2l2.2 2.2L15.2 10"/>',
    check:   '<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.8 2.8L16 9.4"/>',
    tag:     '<path d="M3.5 11.4V4.5A1 1 0 014.5 3.5h6.9a1 1 0 01.7.3l8.1 8.1a1 1 0 010 1.4l-6.9 6.9a1 1 0 01-1.4 0L3.8 12.1a1 1 0 01-.3-.7z"/><circle cx="8" cy="8" r="1.4"/>',
    tools:   '<path d="M14.5 5.5a4 4 0 015.2 5.2L21 12l-2.8 2.8a4 4 0 01-5.2-5.2z" transform="translate(-3 -1)"/><path d="M11 11L4.5 17.5a2.1 2.1 0 003 3L14 14"/>',
    plug:    '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 01-6 6 6 6 0 01-6-6V8z"/><path d="M12 17v4"/>',
    battery: '<rect x="3" y="7" width="15" height="10" rx="2.6"/><path d="M21 10.5v3"/><path d="M6.5 10.5v3M9.8 10.5v3"/>',
    star:    '<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z"/>',
    box:     '<path d="M3.5 8.2L12 4l8.5 4.2v7.6L12 20l-8.5-4.2z"/><path d="M3.5 8.2L12 12.4l8.5-4.2M12 12.4V20"/>',
    headset: '<path d="M4.5 14v-2a7.5 7.5 0 0115 0v2"/><rect x="2.8" y="13.4" width="4" height="6.2" rx="2"/><rect x="17.2" y="13.4" width="4" height="6.2" rx="2"/>',
    chat:    '<path d="M20.5 12.2c0 4-3.8 7.2-8.5 7.2a10 10 0 01-3-.45L4 20.5l1.2-3.6A6.8 6.8 0 013.5 12.2C3.5 8.2 7.3 5 12 5s8.5 3.2 8.5 7.2z"/>'
  };
  function icon(name, cls) {
    return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + I[name] + "</svg>";
  }

  /* ------------------------------------------------------------ النمط */
  function dots(cls) { return '<div class="pattern pattern--dots ' + (cls || "") + '"></div>'; }
  function bars(opacity) {
    // أعمدة متدرّجة مكرّرة — خلفية خفيفة
    var unit = "";
    for (var i = 0; i < 3; i++) {
      var h = [30, 44, 58][i], y = 79 - h, x = 16.75 + i * 25;
      unit += '<rect x="' + x + '" y="' + y + '" width="16.5" height="' + h + '" rx="8.25"/>';
    }
    return '<div class="pattern pattern--bars" style="opacity:' + (opacity || .06) + '">' +
      '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">' +
      '<defs><pattern id="pb" width="100" height="100" patternUnits="userSpaceOnUse">' +
      '<g fill="currentColor">' + unit + "</g></pattern></defs>" +
      '<rect width="100%" height="100%" fill="url(#pb)"/></svg></div>';
  }

  /* ================================================================
     الألواح
     ================================================================ */
  var A = {};

  /* --- ألوان الشعار --- */
  var COLOR_SETS = [
    { bg: C.sand,  bars: C.deep,  acc: C.gold, tag: "الأساسي — بترولي على رملي", outline: 1 },
    { bg: C.deep,  bars: C.sand,  acc: C.gold, tag: "معكوس — رملي على بترولي" },
    { bg: C.teal,  bars: C.sand,  acc: C.gold, tag: "مائي — للخلفيات الحيّة" },
    { bg: C.gold,  bars: C.deep,  acc: C.deep, tag: "ذهبي — للتغليف فقط" },
    { bg: C.mist,  bars: C.deep,  acc: C.deep, tag: "مائي فاتح — أحادي" },
    { bg: C.sand,  bars: C.teal,  acc: C.gold, tag: "مائي على رملي", outline: 1 },
    { bg: "#FFFFFF", bars: "#000000", acc: "#000000", tag: "أسود — طباعة بلون واحد", outline: 1 },
    { bg: "#000000", bars: "#FFFFFF", acc: "#FFFFFF", tag: "أبيض — على الأسود" }
  ];
  A["logo-colors"] = { w: 1600, h: 1080, label: "ألوان الشعار", render: function () {
    var cells = COLOR_SETS.map(function (s) {
      return '<div class="swatch' + (s.outline ? " swatch--outline" : "") + '" style="background:' + s.bg + ';color:' + (s.bars === "#000000" ? "#000" : s.bars) + '">' +
        mark(s.bars, s.acc) +
        '<span class="swatch__tag">' + s.tag + "</span></div>";
    }).join("");
    return '<div class="ab pad-l" style="--w:1600;--h:1080">' +
      '<div class="stack" style="align-content:start;gap:44px">' +
        '<div><p class="eyebrow" style="font-size:17px;margin:0 0 14px">SUFYAN MOBILE — LOGO COLOURS</p>' +
        '<h1 class="tagline" style="font-size:54px;margin:0">ألوان الشعار</h1>' +
        '<p class="muted" style="font-size:24px;margin:14px 0 0">العمود الثالث ذهبي دائماً إلا في الطباعة بلون واحد. لا تُبدّل الألوان خارج هذه اللوحة.</p></div>' +
        '<div class="swatches">' + cells + "</div>" +
      "</div></div>";
  }};

  /* --- الكارت التعريفي: وجه --- */
  A["card-front"] = { w: 1063, h: 591, label: "كارت تعريفي — وجه", print: "90 × 50 مم", render: function () {
    return '<div class="ab" style="--w:1063;--h:591">' + dots() +
      '<div class="card stack">' +
        '<div class="card__top">' +
          "<div><div class=\"card__name\">سفيان</div><div class=\"card__role\">صاحب المحل</div></div>" +
          '<div class="card__logo">' + mark() + "<span>" + SHOP.latin + "</span></div>" +
        "</div>" +
        '<div></div>' +
        '<div class="card__lines">' +
          '<div class="card__rule" style="margin-bottom:10px"></div>' +
          "<div>" + icon("whatsapp") + '<span class="sp-num" dir="ltr">' + SHOP.phone1 + " · " + SHOP.phone2 + "</span></div>" +
          "<div>" + icon("pin") + "<span>" + SHOP.address + "</span></div>" +
        "</div>" +
      "</div></div>";
  }};

  /* --- الكارت التعريفي: ظهر --- */
  A["card-back"] = { w: 1063, h: 591, label: "كارت تعريفي — ظهر", print: "90 × 50 مم", render: function () {
    return '<div class="ab ab--dark" style="--w:1063;--h:591">' + bars(.07) +
      '<div class="card-back stack">' +
        mark(C.sand, C.gold) +
        '<div class="card-back__name">' + SHOP.name + "</div>" +
        '<div class="card-back__latin">' + SHOP.latin + "</div>" +
        '<div class="card__rule" style="justify-self:center"></div>' +
        '<div class="card-back__tag">' + SHOP.tagline + "</div>" +
      "</div></div>";
  }};

  /* --- كيس التسوق: وجه --- */
  A["bag-front"] = { w: 1200, h: 1500, label: "كيس التسوق — وجه", print: "نسيج غير منسوج · 32 × 40 × 12 سم", render: function () {
    return '<div class="ab ab--dark" style="--w:1200;--h:1500">' + bars(.055) +
      '<div class="bag__handles" style="color:' + C.sand + '"><span></span><span></span></div>' +
      '<div class="bag stack">' +
        "<div></div>" +
        '<div class="bag__center">' +
          mark(C.sand, C.gold) +
          '<div><div class="bag__name">' + SHOP.name + '</div>' +
          '<div class="bag__latin" style="margin-top:14px">' + SHOP.latin + "</div></div>" +
          '<div class="bag__tag">' + SHOP.tagline + "</div>" +
        "</div>" +
        '<div class="bag__foot">' + icon("whatsapp") + '<span class="sp-num" dir="ltr">' + SHOP.phone1 + "</span><i></i><span>" + SHOP.address + "</span></div>" +
      "</div>" +
      '<div class="bag__strip">مكتب سفيان للموبايل · سامراء — الحويش</div>' +
      "</div>";
  }};

  /* --- كيس التسوق: ظهر --- */
  A["bag-back"] = { w: 1200, h: 1500, label: "كيس التسوق — ظهر", print: "نسيج غير منسوج · 32 × 40 × 12 سم", render: function () {
    var items = [
      ["shield", "كفالة سنة", "على كل جهاز جديد"],
      ["tools", "صيانة بوصل", "تتابع جهازك برقم الوصل"],
      ["headset", "إكسسوارات", "شواحن · سماعات · حمايات"],
      ["globe", "إنترنت منزلي", "تركيب ومتابعة"]
    ].map(function (r) {
      return '<div style="display:flex;align-items:center;gap:28px;text-align:start">' +
        '<span style="width:92px;height:92px;border-radius:50%;display:grid;place-items:center;background:rgba(242,237,228,.10);flex:none">' +
        '<svg class="ico" viewBox="0 0 24 24" style="width:44px;height:44px;stroke-width:1.6">' + I[r[0]] + "</svg></span>" +
        '<div><div style="font-weight:700;font-size:40px">' + r[1] + "</div>" +
        '<div style="font-weight:300;font-size:27px;opacity:.72;margin-top:6px">' + r[2] + "</div></div></div>";
    }).join("");
    return '<div class="ab ab--dark" style="--w:1200;--h:1500">' + dots() +
      '<div class="bag__handles" style="color:' + C.sand + '"><span></span><span></span></div>' +
      '<div class="bag stack" style="padding-top:230px">' +
        '<div style="text-align:center"><div class="bag__latin" style="opacity:.6">WHAT WE DO</div></div>' +
        '<div style="display:grid;gap:52px;align-content:center;padding:0 40px">' + items + "</div>" +
        '<div class="bag__foot">' + icon("clock") + "<span>" + SHOP.hours + "</span></div>" +
      "</div>" +
      '<div class="bag__strip" style="background:' + C.teal + ';color:' + C.sand + '">' + SHOP.wa + "</div>" +
      "</div>";
  }};

  /* --- غلاف فيسبوك --- */
  A["fb-cover"] = { w: 1640, h: 856, label: "غلاف فيسبوك", print: "1640 × 856", render: function () {
    return '<div class="ab" style="--w:1640;--h:856">' + dots() +
      '<div class="cover stack">' +
        '<div class="cover__text">' +
          '<p class="eyebrow" style="font-size:19px;margin:0">' + SHOP.latin + " — SAMARRA</p>" +
          '<h1 class="cover__name">' + SHOP.name + "</h1>" +
          '<p class="cover__tag" style="margin:0">' + SHOP.tagline + "</p>" +
          '<div class="cover__chips">' +
            '<span class="chip chip--teal">' + icon("shield") + "كفالة سنة</span>" +
            '<span class="chip chip--gold">' + icon("tools") + "صيانة بوصل</span>" +
            '<span class="chip chip--ghost">' + icon("clock") + SHOP.hours + "</span>" +
          "</div>" +
          '<div class="contact" style="font-size:24px;opacity:.85;margin-top:6px">' +
            '<span class="sp-num" dir="ltr">' + SHOP.phone1 + "</span><i></i>" +
            "<span>" + SHOP.address + "</span></div>" +
        "</div>" +
        '<div class="cover__art">' + bars(.09) + mark(C.sand, C.gold) + "</div>" +
      "</div></div>";
  }};

  /* --- صورة الحساب --- */
  A["avatar"] = { w: 1080, h: 1080, label: "صورة الحساب", print: "1080 × 1080", render: function () {
    return '<div class="ab ab--dark avatar" style="--w:1080;--h:1080">' + bars(.07) + mark(C.sand, C.gold) + "</div>";
  }};

  /* --- أغلفة الهايلايت --- */
  var HIGHLIGHTS = [
    ["tag", "الأسعار", C.deep, C.sand],
    ["star", "الجديد", C.teal, C.sand],
    ["tools", "الصيانة", C.deep, C.gold],
    ["headset", "إكسسوارات", C.sand, C.deep],
    ["shield", "الكفالة", C.gold, C.deep],
    ["chat", "تواصل", C.deep2, C.sand]
  ];
  HIGHLIGHTS.forEach(function (h, i) {
    A["highlight-" + (i + 1)] = {
      w: 1080, h: 1920, label: "هايلايت — " + h[1], print: "1080 × 1920",
      render: function () {
        return '<div class="ab hl" style="--w:1080;--h:1920;background:' + h[2] + ";color:" + h[3] + '">' +
          bars(.05) +
          '<div class="hl__disc">' +
            '<svg class="ico" viewBox="0 0 24 24" style="width:240px;height:240px;stroke-width:1.35">' + I[h[0]] + "</svg>" +
            '<div class="hl__label">' + h[1] + "</div>" +
          "</div></div>";
      }
    };
  });

  /* --- بوستات إنستغرام --- */
  A["post-1"] = { w: 1080, h: 1350, label: "بوست — الوعد", print: "1080 × 1350", render: function () {
    return '<div class="ab" style="--w:1080;--h:1350">' + dots() +
      '<div class="post stack">' +
        '<div class="post__head">' + mark() + '<span class="eyebrow post__eyebrow">' + SHOP.latin + "</span></div>" +
        '<div class="post__body">' +
          '<h2 class="post__title">نصيحة صادقة<br>وسعر <em>واضح</em></h2>' +
          '<p class="post__sub">نگلك السعر مثل ما هو، ونشرح الفرق بين جهازين بلغتك — بلا مبالغة.</p>' +
        "</div>" +
        '<div class="post__foot"><span class="chip">' + icon("whatsapp") + '<span class="sp-num" dir="ltr">' + SHOP.phone1 + "</span></span>" +
        '<span class="muted">' + SHOP.address + "</span></div>" +
      "</div></div>";
  }};

  A["post-2"] = { w: 1080, h: 1350, label: "بوست — السعر", print: "1080 × 1350", render: function () {
    return '<div class="ab ab--dark" style="--w:1080;--h:1350">' + bars(.06) +
      '<div class="price-post stack">' +
        '<div class="post__head">' + mark(C.sand, C.gold) + '<span class="eyebrow post__eyebrow">جديد · كفالة سنة</span></div>' +
        '<div style="display:grid;align-content:center">' +
          '<div class="price-post__device">Samsung<br>Galaxy A54</div>' +
          '<div class="price-post__spec">128GB · 8GB RAM · أسود</div>' +
          '<div style="margin-top:44px"><div class="price-post__amount" style="color:' + C.gold + '">385,000</div>' +
          '<div class="price-post__cur" style="text-align:right;direction:ltr">IQD</div></div>' +
          '<div class="price-post__rows">' +
            "<div>" + icon("shield") + "<span>كفالة سنة على عيوب التصنيع</span></div>" +
            "<div>" + icon("check") + "<span>مفحوص قبل التسليم</span></div>" +
            "<div>" + icon("box") + "<span>بعلبته وكامل ملحقاته</span></div>" +
          "</div>" +
        "</div>" +
        '<div class="post__foot"><span class="chip chip--gold">' + icon("whatsapp") + "اطلب عبر واتساب</span>" +
        '<span class="muted sp-num" dir="ltr">' + SHOP.phone1 + "</span></div>" +
      "</div></div>";
  }};

  A["post-3"] = { w: 1080, h: 1350, label: "بوست — الصيانة", print: "1080 × 1350", render: function () {
    var steps = [["tools", "تجيب جهازك"], ["check", "نفحصه قدّامك"], ["tag", "نگلك الكلفة"], ["shield", "تاخذ وصل برقم"]]
      .map(function (s, i) {
        return '<div style="display:flex;align-items:center;gap:26px">' +
          '<span style="width:76px;height:76px;border-radius:50%;background:' + C.deep + ';color:' + C.sand + ';display:grid;place-items:center;font-weight:900;font-size:32px;flex:none">' + (i + 1) + "</span>" +
          '<span style="font-weight:700;font-size:44px">' + s[1] + "</span></div>";
      }).join("");
    return '<div class="ab" style="--w:1080;--h:1350;background:' + C.mist + '">' + bars(.07) +
      '<div class="post stack">' +
        '<div class="post__head">' + mark() + '<span class="eyebrow post__eyebrow">صيانة</span></div>' +
        '<div class="post__body">' +
          '<h2 class="post__title" style="font-size:82px">صيانة بلا<br>«تعال باچر»</h2>' +
          '<div style="display:grid;gap:30px;margin-top:14px">' + steps + "</div>" +
        "</div>" +
        '<div class="post__foot"><span class="chip">' + icon("clock") + SHOP.hours + "</span>" +
        '<span class="muted sp-num" dir="ltr">' + SHOP.phone1 + "</span></div>" +
      "</div></div>";
  }};

  A["post-4"] = { w: 1080, h: 1350, label: "بوست — الإكسسوارات", print: "1080 × 1350", render: function () {
    var grid = [["plug", "شواحن", "من 7,500"], ["headset", "سماعات", "من 35,000"],
                ["battery", "باور بانك", "من 28,000"], ["box", "حمايات", "من 5,000"]]
      .map(function (r) {
        return '<div style="background:' + C.sand3 + ';border-radius:34px;padding:38px 34px;display:grid;gap:16px">' +
          '<svg class="ico" viewBox="0 0 24 24" style="width:56px;height:56px;stroke-width:1.6;color:' + C.teal + '">' + I[r[0]] + "</svg>" +
          '<div style="font-weight:700;font-size:40px">' + r[1] + "</div>" +
          '<div style="font-weight:500;font-size:28px;color:' + C.teal + ';direction:rtl">' + r[2] + " د.ع</div></div>";
      }).join("");
    return '<div class="ab" style="--w:1080;--h:1350">' + dots() +
      '<div class="post stack">' +
        '<div class="post__head">' + mark() + '<span class="eyebrow post__eyebrow">إكسسوارات</span></div>' +
        '<div class="post__body">' +
          '<h2 class="post__title" style="font-size:78px">كل شي للموبايل<br>بمكان <em>واحد</em></h2>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:12px">' + grid + "</div>" +
        "</div>" +
        '<div class="post__foot"><span class="chip chip--teal">' + icon("pin") + "الحويش — الشارع الرئيسي</span>" +
        '<span class="muted sp-num" dir="ltr">' + SHOP.phone1 + "</span></div>" +
      "</div></div>";
  }};

  /* --- ستوري --- */
  A["story"] = { w: 1080, h: 1920, label: "ستوري — الكفالة", print: "1080 × 1920", render: function () {
    return '<div class="ab ab--dark" style="--w:1080;--h:1920">' + bars(.06) +
      '<div class="story stack">' +
        mark(C.sand, C.gold) +
        '<div style="display:grid;align-content:center;justify-items:center">' +
          '<div style="width:230px;height:230px;border-radius:50%;background:rgba(242,237,228,.08);display:grid;place-items:center;margin-bottom:60px">' +
          '<svg class="ico" viewBox="0 0 24 24" style="width:118px;height:118px;stroke-width:1.4;color:' + C.gold + '">' + I.shield + "</svg></div>" +
          '<h2 class="story__title">كفالة سنة<br>كاملة</h2>' +
          '<p class="story__sub">على كل جهاز جديد — عيوب التصنيع.<br>والملصق القابل للكسر دليلك.</p>' +
        "</div>" +
        '<span class="chip chip--gold story__cta">' + icon("whatsapp") + '<span class="sp-num" dir="ltr">' + SHOP.phone1 + "</span></span>" +
      "</div></div>";
  }};

  /* --- شريط التغليف --- */
  A["tape"] = { w: 1600, h: 200, label: "شريط التغليف", print: "تكرار · عرض 48 مم", render: function () {
    var unit = '<span class="tape__unit">' + mark(C.sand, C.gold) + SHOP.name + "</span>";
    return '<div class="ab ab--dark tape" style="--w:1600;--h:200">' +
      unit + '<span class="tape__unit sp-num" dir="ltr" style="color:' + C.gold + '">' + SHOP.phone1 + "</span>" +
      unit + '<span class="tape__unit sp-num" dir="ltr" style="color:' + C.gold + '">' + SHOP.wa + "</span>" +
      "</div>";
  }};

  /* --- لوحة الدوام --- */
  A["hours-board"] = { w: 800, h: 1200, label: "لوحة الدوام", print: "20 × 30 سم", render: function () {
    return '<div class="ab" style="--w:800;--h:1200">' + dots() +
      '<div class="hours stack">' +
        "<div>" + mark() + '<div class="hours__name">' + SHOP.name + "</div></div>" +
        '<div style="display:grid;align-content:center;justify-items:center">' +
          '<div class="hours__label">الدوام</div>' +
          '<div class="hours__big">9:00</div>' +
          '<div style="width:64px;height:4px;background:' + C.gold + ';border-radius:4px;margin:22px 0"></div>' +
          '<div class="hours__big">22:00</div>' +
          '<div class="hours__days">يومياً — بلا عطلة</div>' +
        "</div>" +
        '<div class="hours__foot">' + SHOP.address + "</div>" +
      "</div></div>";
  }};

  /* --- بطاقة الموظف --- */
  A["badge"] = { w: 638, h: 1016, label: "بطاقة موظف", print: "54 × 86 مم", render: function () {
    return '<div class="ab ab--dark" style="--w:638;--h:1016">' + bars(.06) +
      '<div class="badge stack">' +
        '<div class="badge__slot"></div>' +
        '<div style="display:grid;align-content:center;justify-items:center">' +
          mark(C.sand, C.gold) +
          '<div class="badge__name">سفيان</div>' +
          '<div class="badge__role">صاحب المحل</div>' +
        "</div>" +
        '<div style="display:grid;gap:14px;justify-items:center">' +
          '<div class="card__rule"></div>' +
          '<div class="badge__shop">' + SHOP.name + "</div>" +
        "</div>" +
      "</div></div>";
  }};

  /* --- كارت الواتساب (QR يُحقن عند البناء) --- */
  A["qr-card"] = { w: 1063, h: 591, label: "كارت واتساب — QR", print: "90 × 50 مم", render: function (opts) {
    var qr = (opts && opts.qr) || '<div style="width:100%;height:100%;border:4px dashed ' + C.teal + ';border-radius:14px"></div>';
    return '<div class="ab ab--dark" style="--w:1063;--h:591">' + bars(.06) +
      '<div class="qr-card stack">' +
        '<div class="qr-card__text">' +
          mark(C.sand, C.gold) +
          '<div class="qr-card__title" style="margin-top:10px">امسح وتواصل بواتساب</div>' +
          '<div class="qr-card__sub">اسأل عن أي جهاز أو سعر — نرد بأسرع وقت.</div>' +
          '<div class="qr-card__num">' + SHOP.phone1 + "</div>" +
        "</div>" +
        '<div class="qr-box">' + qr + "</div>" +
      "</div></div>";
  }};

  /* --- ملصق قابل للكسر (عرض) --- */
  A["void-sticker"] = { w: 900, h: 540, label: "ملصق قابل للكسر", print: "25 × 15 مم — ورق Eggshell", render: function () {
    function seal(w, h, round) {
      return '<div style="width:' + w + "px;height:" + h + 'px;background:' + C.deep + ";color:" + C.sand +
        ";border-radius:" + (round ? "50%" : "18px") +
        ";display:grid;place-items:center;align-content:center;gap:10px;text-align:center;padding:22px;" +
        "background-image:repeating-linear-gradient(-45deg,transparent 0 14px,rgba(242,237,228,.07) 14px 18px)\">" +
        '<svg viewBox="0 0 100 100" style="width:34px;height:28px">' +
          '<rect x="16.75" y="49" width="16.5" height="30" rx="8.25" fill="' + C.sand + '"/>' +
          '<rect x="41.75" y="35" width="16.5" height="44" rx="8.25" fill="' + C.sand + '"/>' +
          '<rect x="66.75" y="21" width="16.5" height="58" rx="8.25" fill="' + C.gold + '"/></svg>' +
        '<div style="font-weight:900;font-size:36px;letter-spacing:.12em;color:' + C.gold + ';direction:ltr">VOID</div>' +
        (round ? "" : '<div style="font-weight:500;font-size:17px;line-height:1.3">الكفالة تسقط عند النزع</div>') +
        '<div style="font-weight:500;font-size:15px;opacity:.75;direction:ltr">VD-004182</div></div>';
    }
    return '<div class="ab" style="--w:900;--h:540">' + dots() +
      '<div class="stack" style="place-content:center;justify-items:center;gap:44px">' +
        '<div style="display:flex;align-items:center;gap:56px">' + seal(300, 180) + seal(210, 210, 1) + "</div>" +
        '<p class="muted" style="font-size:24px;margin:0;text-align:center;max-width:34ch">' +
        "يُطبع على ورق قابل للكسر (Eggshell) أو بولستر VOID — الورق العادي يُنزع سليماً ويفقد فائدته.</p>" +
      "</div></div>";
  }};

  /* ================================================================ */
  function html(key, opts) {
    var a = A[key];
    if (!a) throw new Error("SufyanKit: لوح غير معروف — " + key);
    return a.render(opts || {});
  }

  return { SHOP: SHOP, COLORS: C, ARTBOARDS: A, html: html, mark: mark, icon: icon, keys: Object.keys(A) };
});
