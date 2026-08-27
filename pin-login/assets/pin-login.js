/* =====================================================================
   PIN Login — منطق المكوّن + محرّك السبرنغ (بلا أي اعتماد خارجي)
   يعمل من ملف محلي مباشرة: لا CDN، لا شبكة، لا تأخير في الإقلاع.
   ===================================================================== */
(function (global) {
  "use strict";

  /* ===================================================================
     1) محرّك الحركة: سبرنغ قابل للمقاطعة وإعادة التوجيه
        response = زمن الوصول بالثواني (وليس مدة ثابتة)
        bounce   = مقدار التجاوز؛ 0 = مخمّد حرجاً (الافتراضي)
     =================================================================== */
  var running = new Set();
  var rafId = 0;
  var lastTime = 0;

  var reducedMotion = global.matchMedia
    ? global.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  function frame(now) {
    var dt = Math.min((now - lastTime) / 1000, 0.064); // نتجاهل القفزات بعد تعليق التبويب
    lastTime = now;
    running.forEach(function (s) { s.advance(dt); });
    rafId = running.size ? requestAnimationFrame(frame) : 0;
  }

  function schedule(s) {
    running.add(s);
    if (!rafId) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }

  function Spring(options) {
    this.x = options.from;
    this.v = options.velocity || 0;
    this.to = options.to;
    this.response = options.response || 0.4;
    this.bounce = options.bounce || 0;
    this.epsilon = options.epsilon || 0.004;
    this.onUpdate = options.onUpdate || function () {};
    this.onRest = options.onRest || function () {};

    this.onUpdate(this.x);

    if (reducedMotion.matches && !options.ignoreReducedMotion) {
      // الحركة المخفّضة: نصل للقيمة النهائية فوراً، والتغذية الراجعة تبقى عبر اللون والنص
      this.x = this.to;
      this.onUpdate(this.x);
      this.onRest();
      return;
    }
    schedule(this);
  }

  Spring.prototype.advance = function (dt) {
    var steps = Math.max(1, Math.ceil(dt * 240));
    var h = dt / steps;
    var omega = (2 * Math.PI) / this.response;
    var zeta = Math.max(0, 1 - this.bounce);
    var k = omega * omega;
    var c = 2 * zeta * omega;

    for (var i = 0; i < steps; i++) {
      var a = -k * (this.x - this.to) - c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }

    this.onUpdate(this.x);

    if (Math.abs(this.x - this.to) < this.epsilon &&
        Math.abs(this.v) < this.epsilon * 12) {
      this.x = this.to;
      this.onUpdate(this.x);
      this.stop();
      this.onRest();
    }
  };

  /* إعادة التوجيه تحتفظ بالسرعة الحالية: لا "جدار" عند عكس الاتجاه */
  Spring.prototype.retarget = function (to) {
    this.to = to;
    if (!running.has(this)) schedule(this);
  };

  Spring.prototype.stop = function () { running.delete(this); };

  /* ===================================================================
     2) الأيقونات — SVG واحد لكل أيقونة، يأخذ لونه من currentColor
        سماكة الحد 1.8 لتوازن الوزن البصري للنص شبه العريض
     =================================================================== */
  var ICONS = {
    shield:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 2.5 4.5 5.2v6.4c0 4.6 3.2 7.9 7.5 9.3 4.3-1.4 7.5-4.7 7.5-9.3V5.2L12 2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/></svg>',
    backspace:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 5H9.6a2 2 0 0 0-1.45.62l-4.7 4.98a2 2 0 0 0 0 2.8l4.7 4.98A2 2 0 0 0 9.6 19H20a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><path d="m13 9.5 4 5M17 9.5l-4 5"/></svg>',
    clear:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4.5 7.5h15"/><path d="M9.5 7.5V5.8A1.8 1.8 0 0 1 11.3 4h1.4a1.8 1.8 0 0 1 1.8 1.8v1.7"/><path d="M6.8 7.5 7.7 18a2 2 0 0 0 2 1.9h4.6a2 2 0 0 0 2-1.9l.9-10.5"/></svg>',
    qr:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.6"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.6"/>' +
      '<rect x="3.5" y="14" width="6.5" height="6.5" rx="1.6"/><path d="M14 14h2.6v2.6H14zM20.5 14v2.6M14 20.5h2.6M20.5 20.5h.01"/></svg>',
    key:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20M17.5 12v3M14.5 12v2"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.2M12 16.3h.01"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path class="welcome__check" d="m6.5 12.4 3.7 3.7 7.3-8.2"/></svg>',
    sun:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4M6.7 6.7 5 5M19 19l-1.7-1.7M6.7 17.3 5 19M19 5l-1.7 1.7"/></svg>',
    moon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 14.4A8.5 8.5 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4Z"/></svg>'
  };

  /* ===================================================================
     3) المكوّن
     =================================================================== */
  var UID = 0;

  function createPinLogin(mount, options) {
    var opts = options || {};

    var config = {
      systemName: opts.systemName || "نظام نقاط البيع",
      minLength: Math.max(4, Math.min(8, opts.minLength || 4)),
      maxLength: Math.max(4, Math.min(8, opts.maxLength || 6)),
      onSuccess: opts.onSuccess || function () {
        return Promise.resolve({ success: false });
      },
      onForgotPin: opts.onForgotPin || function () {},
      onPasskeyLogin: opts.onPasskeyLogin || function () {},
      onVerified: opts.onVerified || function () {},
      onFinish: opts.onFinish || function () {}
    };
    if (config.maxLength < config.minLength) config.maxLength = config.minLength;

    var state = { pin: "", busy: false, done: false };
    var id = "pin" + (++UID);

    /* ---------- بناء الشجرة ---------- */
    mount.classList.add("stage");
    mount.innerHTML =
      '<section class="card" aria-labelledby="' + id + '-title">' +
        '<div class="card__view" data-view="login">' +

          '<header class="header">' +
            '<div class="header__mark" aria-hidden="true">' + ICONS.shield + '</div>' +
            '<div>' +
              '<h1 class="header__title" id="' + id + '-title"></h1>' +
              '<p class="header__subtitle">أدخل رمزك للمتابعة</p>' +
            '</div>' +
          '</header>' +

          '<div class="dots" dir="ltr" data-state="idle" role="img"></div>' +

          '<p class="notice" data-tone="idle" role="status">' +
            '<span class="notice__icon">' + ICONS.alert + '</span>' +
            '<span data-notice-text></span>' +
          '</p>' +

          '<div class="keypad" dir="ltr" role="group" aria-label="لوحة إدخال الرمز"></div>' +

          '<button type="button" class="submit" data-ready="false" data-busy="false">' +
            '<span data-submit-label>دخول</span>' +
          '</button>' +

          '<div class="helpers">' +
            '<button type="button" class="helper" data-action="forgot">' +
              ICONS.key + '<span>نسيت الرمز؟</span>' +
            '</button>' +
            '<button type="button" class="helper" data-action="passkey">' +
              ICONS.qr + '<span>الدخول بالهاتف</span>' +
            '</button>' +
          '</div>' +

          '<p class="hint"><strong>Enter</strong> للدخول · ' +
            '<strong>Backspace</strong> حذف · <strong>Esc</strong> مسح الكل</p>' +

        '</div>' +
      '</section>';

    var card = mount.querySelector(".card");
    var view = mount.querySelector('[data-view="login"]');
    var dotsEl = mount.querySelector(".dots");
    var noticeEl = mount.querySelector(".notice");
    var noticeText = mount.querySelector("[data-notice-text]");
    var keypadEl = mount.querySelector(".keypad");
    var submitEl = mount.querySelector(".submit");
    var submitLabel = mount.querySelector("[data-submit-label]");

    mount.querySelector(".header__title").textContent = config.systemName;

    /* ---------- النقاط ---------- */
    var dots = [];
    for (var d = 0; d < config.maxLength; d++) {
      var dot = document.createElement("span");
      dot.className = "dot";
      dot.dataset.filled = "false";
      dotsEl.appendChild(dot);
      dots.push(dot);
    }

    function visibleDots() {
      var n = state.pin.length;
      if (n < config.minLength) return config.minLength;
      if (n < config.maxLength) return n + 1;   // نقطة مفرغة تلمّح أن الرمز يقبل المزيد
      return config.maxLength;
    }

    function paintDots() {
      var shown = visibleDots();
      for (var i = 0; i < dots.length; i++) {
        var el = dots[i];
        el.hidden = i >= shown;
        el.dataset.filled = i < state.pin.length ? "true" : "false";
        el.dataset.next = !state.busy && i === state.pin.length ? "true" : "false";
        el.dataset.optional = i >= config.minLength ? "true" : "false";
      }
      dotsEl.setAttribute(
        "aria-label",
        "رمز الدخول: " + state.pin.length + " من " + shown + " أرقام"
      );
      submitEl.dataset.ready = state.pin.length >= config.minLength ? "true" : "false";
    }

    /* نبضة السبرنغ على آخر نقطة أُدخلت — تأكيد مادي فوري للمس */
    function popDot(index) {
      var el = dots[index];
      if (!el) return;
      new Spring({
        from: 1.42, to: 1, response: 0.3, bounce: 0.34, epsilon: 0.002,
        onUpdate: function (v) { el.style.transform = "scale(" + v + ")"; },
        onRest: function () { el.style.transform = ""; }
      });
    }

    /* ---------- لوحة الأرقام ---------- */
    var keyIndex = {};
    function addKey(value, label, inner, utility) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "key" + (utility ? " key--utility" : "");
      b.dataset.key = value;
      b.setAttribute("aria-label", label);
      b.innerHTML = inner;
      keypadEl.appendChild(b);
      keyIndex[value] = b;
      return b;
    }
    for (var n = 1; n <= 9; n++) addKey(String(n), String(n), String(n), false);
    addKey("clear", "مسح الرمز بالكامل", ICONS.clear, true);
    addKey("0", "0", "0", false);
    addKey("back", "حذف آخر رقم", ICONS.backspace, true);

    /* ---------- الرسائل ---------- */
    function setNotice(text, tone) {
      noticeText.textContent = text || "";
      noticeEl.dataset.tone = tone || "idle";
    }

    var shake = null;
    function shakeDots() {
      dotsEl.dataset.state = "error";
      if (shake) shake.stop();
      // اهتزاز = سبرنغ هدفه صفر بسرعة ابتدائية؛ يتلاشى فيزيائياً بدل مسار مرسوم
      shake = new Spring({
        from: 0, to: 0, velocity: 265, response: 0.3, bounce: 0.62, epsilon: 0.35,
        onUpdate: function (v) { dotsEl.style.transform = "translateX(" + v + "px)"; },
        onRest: function () { dotsEl.style.transform = ""; }
      });
    }

    /* ---------- الإدخال ---------- */
    function press(key) {
      if (state.busy || state.done) return;

      if (key === "back") {
        if (!state.pin.length) return;
        state.pin = state.pin.slice(0, -1);
      } else if (key === "clear") {
        if (!state.pin.length) return;
        state.pin = "";
      } else if (/^[0-9]$/.test(key)) {
        if (state.pin.length >= config.maxLength) return;
        state.pin += key;
        popDot(state.pin.length - 1);
      } else {
        return;
      }

      if (dotsEl.dataset.state === "error") {
        dotsEl.dataset.state = "idle";
        setNotice("", "idle");
      }
      paintDots();

      // الرمز ثابت الطول → دخول تلقائي، وهو المسار الأسرع للكاشير
      if (config.minLength === config.maxLength &&
          state.pin.length === config.maxLength) {
        submit();
      }
    }

    function flashKey(key) {
      var b = keyIndex[key];
      if (!b) return;
      b.dataset.pressed = "true";
      setTimeout(function () { delete b.dataset.pressed; }, 110);
    }

    // الإبراز يحدث عند الضغط (CSS :active) والتنفيذ عند الرفع (click):
    // نفس سلوك النظام، ويبقى الزر قابلاً للتشغيل بلوحة المفاتيح.
    keypadEl.addEventListener("touchstart", function () {}, { passive: true });
    keypadEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-key]");
      if (btn) press(btn.dataset.key);
    });

    mount.querySelector('[data-action="forgot"]')
      .addEventListener("click", function () { config.onForgotPin(); });
    mount.querySelector('[data-action="passkey"]')
      .addEventListener("click", function () { config.onPasskeyLogin(); });
    submitEl.addEventListener("click", function () { submit(); });

    function onKeyDown(e) {
      if (state.done || e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key;

      if (/^[0-9]$/.test(k)) {
        e.preventDefault(); flashKey(k); press(k);
      } else if (k === "Backspace") {
        e.preventDefault(); flashKey("back"); press("back");
      } else if (k === "Escape" || k === "Delete") {
        e.preventDefault(); flashKey("clear"); press("clear");
      } else if (k === "Enter" && document.activeElement !== submitEl) {
        e.preventDefault(); submit();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    /* ---------- التحقّق ---------- */
    function setBusy(on) {
      state.busy = on;
      submitEl.dataset.busy = on ? "true" : "false";
      dotsEl.dataset.state = on ? "busy" : "idle";
      submitLabel.textContent = on ? "جارٍ التحقّق" : "دخول";
      var spinner = submitEl.querySelector(".submit__spinner");
      if (on && !spinner) {
        spinner = document.createElement("span");
        spinner.className = "submit__spinner";
        submitEl.insertBefore(spinner, submitEl.firstChild);
      } else if (!on && spinner) {
        spinner.remove();
      }
      paintDots();
    }

    function submit() {
      if (state.busy || state.done) return;

      if (state.pin.length < config.minLength) {
        setNotice("الرمز لا يقل عن " + config.minLength + " أرقام", "error");
        shakeDots();
        return;
      }

      setBusy(true);
      setNotice("", "idle");

      Promise.resolve(config.onSuccess(state.pin))
        .then(function (result) {
          if (result && result.success) {
            state.done = true;
            succeed(result.employeeName, result.roleName);
          } else {
            setBusy(false);
            state.pin = "";
            paintDots();
            setNotice((result && result.message) || "الرمز غير صحيح. حاول مرة أخرى.", "error");
            shakeDots();
          }
        })
        .catch(function () {
          setBusy(false);
          setNotice("تعذّر الاتصال بالخادم. حاول مجدداً.", "error");
          shakeDots();
        });
    }

    /* ---------- تسلسل النجاح (≈ 330ms حتى يستقر الترحيب) ---------- */
    function succeed(employeeName, roleName) {
      document.removeEventListener("keydown", onKeyDown);
      config.onVerified();

      var startHeight = card.getBoundingClientRect().height;
      card.style.height = startHeight + "px";

      // خروج هادئ لطبقة الإدخال: الخروج دائماً أخف من الدخول
      view.classList.add("card__view--leaving");
      new Spring({
        from: 0, to: 1, response: 0.16, bounce: 0,
        onUpdate: function (p) {
          view.style.opacity = String(1 - p);
          view.style.transform = "scale(" + (1 - p * 0.02) + ")";
        },
        onRest: function () { view.remove(); }
      });

      var welcome = document.createElement("div");
      welcome.className = "card__view";
      welcome.dataset.view = "welcome";
      welcome.innerHTML =
        '<div class="welcome">' +
          '<div class="welcome__seal">' + ICONS.check + '</div>' +
          '<h2 class="welcome__title" role="status"></h2>' +
          '<span class="welcome__role" hidden></span>' +
          '<div class="welcome__progress"><span class="welcome__bar"></span></div>' +
        '</div>';
      card.appendChild(welcome);

      // الاسم والدور يأتيان من الخادم: نضعهما كنص لا كـ HTML
      welcome.querySelector(".welcome__title").textContent =
        "أهلاً بك، " + (employeeName || "زميلنا") + " 👋";
      if (roleName) {
        var badge = welcome.querySelector(".welcome__role");
        badge.textContent = roleName;
        badge.hidden = false;
      }

      var seal = welcome.querySelector(".welcome__seal");
      var check = welcome.querySelector(".welcome__check");
      var bar = welcome.querySelector(".welcome__bar");

      // البطاقة نفسها تبقى مكانها ويتغيّر ارتفاعها: نفس السطح، لا قفزة مكانية
      var endHeight = welcome.getBoundingClientRect().height + 2 * parseFloat(
        getComputedStyle(card).paddingTop
      );
      new Spring({
        from: startHeight, to: endHeight, response: 0.34, bounce: 0, epsilon: 0.4,
        onUpdate: function (h) { card.style.height = h + "px"; },
        onRest: function () { card.style.height = ""; }
      });

      // الدخول: تظهر المادة (شفافية + حجم + ضبابية) بدل تلاشٍ مسطّح
      new Spring({
        from: 0, to: 1, response: 0.32, bounce: 0,
        onUpdate: function (p) {
          welcome.style.opacity = String(p);
          welcome.style.transform = "scale(" + (0.94 + p * 0.06) + ")";
          welcome.style.filter = "blur(" + (1 - p) * 5 + "px)";
        },
        onRest: function () { welcome.style.filter = ""; welcome.style.transform = ""; }
      });

      new Spring({
        from: 0.3, to: 1, response: 0.36, bounce: 0.3,
        onUpdate: function (s) { seal.style.transform = "scale(" + s + ")"; },
        onRest: function () { seal.style.transform = ""; }
      });

      new Spring({
        from: 30, to: 0, response: 0.34, bounce: 0, epsilon: 0.2,
        onUpdate: function (o) { check.style.strokeDashoffset = String(o); }
      });

      new Spring({
        from: 0, to: 100, response: 0.55, bounce: 0, epsilon: 0.3,
        onUpdate: function (w) { bar.style.width = w + "%"; },
        onRest: function () { config.onFinish(); }
      });
    }

    paintDots();

    /* ---------- الواجهة البرمجية ---------- */
    return {
      focusKeypad: function () { keypadEl.querySelector(".key").focus(); },
      destroy: function () {
        document.removeEventListener("keydown", onKeyDown);
        mount.innerHTML = "";
      }
    };
  }

  global.PinLogin = { create: createPinLogin, Spring: Spring, icons: ICONS };
})(window);
