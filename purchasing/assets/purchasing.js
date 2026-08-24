/* ==========================================================================
   قسم الشراء — منطق التطبيق
   مركز سفيان للهواتف · نظام ERP

   مبادئ هذا الملف:
   ① لا يُبنى أي عنصر من نصّ HTML. كل شيء عبر createElement + textContent،
      فلا مجال لحقن سكربت من اسم منتج أو ملاحظة مورّد.
   ② لا يلمس الملف أي جدول. كل نداء يمرّ بدالة RPC محميّة برمز الجلسة.
   ③ رمز الجلسة في sessionStorage فقط — يموت بإغلاق التبويب — مع قفل خمول.
   ========================================================================== */
(function (global) {
  "use strict";

  var CFG = global.SOUFYAN_PURCHASING_CONFIG || {};
  var REST = String(CFG.supabaseUrl || "").replace(/\/+$/, "") + "/rest/v1/rpc/";
  var TOKEN_KEY = "soufyan.purchasing.token";

  /* ======================================================================
     ١) أدوات
     ====================================================================== */

  /** بناء عنصر: el("div.card", {onclick:f}, [child, "نص"]) */
  function el(spec, attrs, kids) {
    var m = String(spec).split(/(?=[.#])/);
    var node = document.createElement(m[0] || "div");
    for (var i = 1; i < m.length; i++) {
      if (m[i][0] === ".") node.classList.add(m[i].slice(1));
      else node.id = m[i].slice(1);
    }
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "text") node.textContent = v;
        else if (k === "html") { /* ممنوع عمدًا */ }
        // التنسيق يُطبَّق عبر CSSOM لا كسمة style، حتى تبقى سياسة
        // style-src صارمة بلا 'unsafe-inline' فيُمنع أي CSS محقون فعلًا.
        else if (k === "style") node.style.cssText = v;
        else if (k.slice(0, 2) === "on" && typeof v === "function") {
          node.addEventListener(k.slice(2), v);
        } else if (k === "dataset") {
          for (var d in v) node.dataset[d] = v[d];
        } else if (v === true) node.setAttribute(k, "");
        else node.setAttribute(k, v);
      }
    }
    append(node, kids);
    return node;
  }

  function append(node, kids) {
    if (kids === null || kids === undefined || kids === false) return node;
    if (Array.isArray(kids)) {
      for (var i = 0; i < kids.length; i++) append(node, kids[i]);
      return node;
    }
    node.appendChild(kids instanceof Node ? kids : document.createTextNode(String(kids)));
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var nf = new Intl.NumberFormat("en-US");
  function money(v) { return nf.format(Math.round(Number(v) || 0)); }
  /** رقم داخل عنصر بعرض ثابت واتجاه لاتيني */
  function num(v, suffix) {
    return el("span.num", { text: money(v) + (suffix === undefined ? "" : (suffix || "")) });
  }
  function iqd(v) { return money(v) + " " + (CFG.currency || "IQD"); }
  function int(v) { return Math.trunc(Number(v) || 0); }
  function toNum(v) { var n = parseFloat(String(v).replace(/[^\d.\-]/g, "")); return isFinite(n) ? n : 0; }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("ar-IQ-u-nu-latn", {
        timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit"
      });
    } catch (e) { return String(iso).slice(0, 10); }
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ar-IQ-u-nu-latn", {
        timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
      });
    } catch (e) { return String(iso); }
  }

  /** معرّف عملية فريد — يمنع الترحيل المزدوج عند انقطاع الشبكة */
  function opId(prefix) {
    var r = new Uint8Array(6);
    (global.crypto || global.msCrypto).getRandomValues(r);
    var s = Array.prototype.map.call(r, function (b) {
      return b.toString(36);
    }).join("").slice(0, 8);
    return prefix + "-" + Date.now().toString(36) + "-" + s;
  }

  function terminalId() {
    var t = null;
    try { t = localStorage.getItem("soufyan.terminal"); } catch (e) { }
    if (!t) {
      t = "web-" + opId("t").slice(2, 18);
      try { localStorage.setItem("soufyan.terminal", t); } catch (e) { }
    }
    return t;
  }

  async function sha256Hex(str) {
    var buf = new TextEncoder().encode(str);
    var hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.prototype.map.call(new Uint8Array(hash), function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  var reduceMotion = global.matchMedia
    ? global.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  /* ── زنبرك: يبدأ من القيمة الحالية على الشاشة، ويقبل سرعة ابتدائية ─────── */
  function spring(from, to, opts, onFrame, onDone) {
    opts = opts || {};
    var damping = opts.damping === undefined ? 1 : opts.damping;   // 1 = بلا ارتداد
    var response = opts.response === undefined ? 0.34 : opts.response;
    var v = opts.velocity || 0;
    var x = from;
    if (reduceMotion.matches) { onFrame(to); if (onDone) onDone(); return function () { }; }

    var w = (2 * Math.PI) / response;
    var last = performance.now();
    var raf = 0, stopped = false;

    // خطوة تكامل ثابتة صغيرة: لو تأخّر إطار (تبويب بالخلفية، جهاز بطيء)
    // نُقسّم الفارق بدل تمريره كما هو — وإلا انفجر الحل عدديًا بدل أن يهدأ.
    var H = 1 / 240;

    function step(now) {
      if (stopped) return;
      var frame = Math.min((now - last) / 1000, 0.25);
      last = now;

      var steps = Math.min(Math.max(Math.ceil(frame / H), 1), 64);
      var dt = frame / steps;
      for (var i = 0; i < steps; i++) {
        var f = -w * w * (x - to) - 2 * damping * w * v;
        v += f * dt;
        x += v * dt;
      }

      if (Math.abs(x - to) < 0.4 && Math.abs(v) < 6) {
        onFrame(to); if (onDone) onDone(); return;
      }
      onFrame(x);
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return function () { stopped = true; cancelAnimationFrame(raf); };
  }

  /** إسقاط الزخم — أين ستستقر الحركة لو تُركت (نفس منحنى تباطؤ التمرير) */
  function project(velocity, decel) {
    decel = decel === undefined ? 0.998 : decel;
    return (velocity / 1000) * decel / (1 - decel);
  }

  /* ======================================================================
     ٢) طبقة الاتصال
     ====================================================================== */
  var api = {
    token: null,

    load: function () {
      try { this.token = sessionStorage.getItem(TOKEN_KEY); } catch (e) { this.token = null; }
      return this.token;
    },
    save: function (t) {
      this.token = t;
      try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) { }
    },

    /** نداء دالة RPC. يرمي Error برسالة عربية جاهزة للعرض. */
    call: async function (fn, params) {
      if (!CFG.supabaseUrl || !CFG.supabaseKey) {
        throw new Error("إعدادات الاتصال ناقصة — راجع config.js");
      }
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); },
        (Number(CFG.requestTimeout) || 20) * 1000);
      var res;
      try {
        res = await fetch(REST + encodeURIComponent(fn), {
          method: "POST",
          signal: ctrl.signal,
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "apikey": CFG.supabaseKey,
            "Authorization": "Bearer " + CFG.supabaseKey
          },
          body: JSON.stringify(params || {})
        });
      } catch (e) {
        clearTimeout(timer);
        throw new Error(e && e.name === "AbortError"
          ? "الطلب استغرق وقتًا طويلًا — تحقّق من الاتصال"
          : "تعذّر الاتصال بالخادم — تحقّق من الإنترنت");
      }
      clearTimeout(timer);

      var body = null;
      try { body = await res.json(); } catch (e) { body = null; }

      if (!res.ok) {
        var msg = (body && (body.message || body.error_description || body.error)) ||
          ("خطأ من الخادم (" + res.status + ")");
        var err = new Error(msg);
        err.status = res.status;
        // انتهاء الجلسة ⇒ اقفل الشاشة فورًا
        if (/الجلسة|صلاحية|موقوف/.test(msg) || res.status === 401) err.expired = true;
        throw err;
      }
      return body;
    },

    /** نداء يتطلّب جلسة */
    auth: function (fn, params) {
      var p = Object.assign({ p_token: this.token }, params || {});
      return this.call(fn, p);
    }
  };

  /* ======================================================================
     ٣) الحالة
     ====================================================================== */
  var S = {
    employee: null,
    role: null,
    settings: {},
    suppliers: [],
    categories: [],
    counters: {},
    view: "dash",
    draft: { supplierId: "", supplierName: "", lines: [], discount: 0, extra: 0, paid: 0, notes: "" },
    cache: {}
  };

  var mount = null;      // الحاوية الجذر
  var refs = {};         // مراجع العناصر الثابتة

  /* ======================================================================
     ٤) التنبيهات
     ====================================================================== */
  function toast(message, kind) {
    var icons = { ok: "✓", error: "✕", warn: "!" };
    var t = el("div.toast.toast-" + (kind || "ok"), { role: "status" }, [
      el("span.t-ico", { text: icons[kind] || icons.ok, "aria-hidden": "true" }),
      el("span", { text: String(message) })
    ]);
    refs.toasts.appendChild(t);

    t.style.opacity = "0";
    t.style.transform = "translateY(-14px) scale(.96)";
    requestAnimationFrame(function () {
      t.style.transition = "opacity .26s var(--ease), transform .34s var(--ease)";
      t.style.opacity = "1";
      t.style.transform = "none";
    });

    setTimeout(function () {
      t.style.opacity = "0";
      t.style.transform = "translateY(-10px)";
      setTimeout(function () { t.remove(); }, 320);
    }, kind === "error" ? 5200 : 3000);
  }

  function fail(e) {
    if (e && e.expired) { lock.show("انتهت الجلسة — أدخل رمزك من جديد"); return; }
    toast((e && e.message) || "صار خلل غير متوقّع", "error");
  }

  /* ======================================================================
     ٥) اللوح المنزلق — قابل للسحب والعكس في أي لحظة
     ====================================================================== */
  var sheet = (function () {
    var box, scrim, stopAnim = null, isOpen = false, lastFocus = null, onCloseCb = null;

    function axis() {
      return global.matchMedia("(max-width: 860px)").matches ? "y" : "x";
    }
    function size() { return axis() === "y" ? box.offsetHeight : box.offsetWidth; }
    function place(v) {
      box.style.transform = axis() === "y"
        ? "translate3d(0," + v + "px,0)"
        : "translate3d(" + (-v) + "px,0,0)";
    }
    function current() {
      var m = /-?\d+(\.\d+)?/.exec(box.style.transform || "");
      var n = m ? Math.abs(parseFloat(m[0])) : 0;
      return isNaN(n) ? 0 : n;
    }

    function open(title, bodyNodes, footNodes, onClose) {
      if (stopAnim) stopAnim();
      lastFocus = document.activeElement;
      onCloseCb = onClose || null;

      clear(refs.sheetTitle).appendChild(document.createTextNode(title));
      clear(refs.sheetBody);
      append(refs.sheetBody, bodyNodes);
      clear(refs.sheetFoot);
      if (footNodes) { append(refs.sheetFoot, footNodes); refs.sheetFoot.hidden = false; }
      else refs.sheetFoot.hidden = true;

      scrim.hidden = false; box.hidden = false;
      isOpen = true;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(function () { scrim.classList.add("on"); });

      place(size());
      stopAnim = spring(size(), 0, { damping: 1, response: 0.36 }, place);

      var first = refs.sheetBody.querySelector(
        "input:not([type=hidden]),select,textarea,button,[tabindex]");
      (first || refs.sheetClose).focus({ preventScroll: true });
      return box;
    }

    function close(velocity) {
      if (!isOpen) return;
      isOpen = false;
      scrim.classList.remove("on");
      if (stopAnim) stopAnim();
      stopAnim = spring(current(), size(), { damping: 1, response: 0.3, velocity: velocity || 0 },
        place,
        function () {
          box.hidden = true; scrim.hidden = true;
          document.body.style.overflow = "";
          clear(refs.sheetBody); clear(refs.sheetFoot);
          if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
          if (onCloseCb) { var c = onCloseCb; onCloseCb = null; c(); }
        });
    }

    /* السحب: تتبّع ١:١، ثم قرار بالسرعة لا بالمسافة */
    function bindDrag(node) {
      var startPt = 0, startVal = 0, dragging = false, hist = [];

      node.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        // لا نسرق السحب من حقل أو زر
        if (e.target.closest("input,select,textarea,button,a,.tbl-wrap,.ac")) return;
        var scroller = e.target.closest(".sheet-body");
        if (scroller && scroller.scrollTop > 0) return;

        dragging = true;
        if (stopAnim) stopAnim();
        node.setPointerCapture(e.pointerId);
        startPt = axis() === "y" ? e.clientY : e.clientX;
        startVal = current();
        hist = [{ p: startPt, t: performance.now() }];
      });

      node.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var p = axis() === "y" ? e.clientY : e.clientX;
        // على المحور الأفقي بـ RTL: اللوح يخرج نحو اليسار
        var delta = axis() === "y" ? (p - startPt) : (startPt - p);
        var v = startVal + delta;
        if (v < 0) v = v * 0.32;                 // مقاومة متدرّجة عند الحافة
        place(v);
        hist.push({ p: p, t: performance.now() });
        if (hist.length > 6) hist.shift();
      });

      function release(e) {
        if (!dragging) return;
        dragging = false;
        try { node.releasePointerCapture(e.pointerId); } catch (err) { }

        var a = hist[0], b = hist[hist.length - 1];
        var dt = Math.max(b.t - a.t, 1);
        var raw = ((b.p - a.p) / dt) * 1000;
        var vel = axis() === "y" ? raw : -raw;

        var projected = current() + project(vel);
        if (projected > size() * 0.4 || vel > 520) close(vel);
        else stopAnim = spring(current(), 0, { damping: 0.82, response: 0.34, velocity: vel }, place);
      }
      node.addEventListener("pointerup", release);
      node.addEventListener("pointercancel", release);
    }

    function init(boxEl, scrimEl) {
      box = boxEl; scrim = scrimEl;
      scrim.addEventListener("click", function () { close(); });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && isOpen) { e.stopPropagation(); close(); }
      });
      bindDrag(box);
      // إبقاء التركيز داخل اللوح
      box.addEventListener("keydown", function (e) {
        if (e.key !== "Tab" || !isOpen) return;
        var f = $$("a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex='-1'])", box)
          .filter(function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }

    return { init: init, open: open, close: close, isOpen: function () { return isOpen; } };
  })();

  /** حوار تأكيد بسيط يعيد Promise<boolean> */
  function confirmSheet(title, message, confirmLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (done) return; done = true; resolve(v); sheet.close(); }
      sheet.open(title, [
        el("p", { text: message, style: "color:var(--ink-2);font-size:.9rem" })
      ], [
        el("button.btn", { type: "button", onclick: function () { finish(false); } }, "تراجع"),
        el("button.btn." + (danger ? "btn-danger" : "btn-primary"),
          { type: "button", onclick: function () { finish(true); } }, confirmLabel || "تأكيد")
      ], function () { if (!done) { done = true; resolve(false); } });
    });
  }

  /* ======================================================================
     ٦) شاشة القفل + الجلسة
     ====================================================================== */
  var lock = (function () {
    var pin = "", busy = false, node, msg, dots;

    function paint() {
      for (var i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i < pin.length);
    }
    function say(text) { msg.textContent = text || ""; }

    function shake() {
      if (reduceMotion.matches) return;
      var card = $(".lock-card", node);
      card.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-9px)" },
        { transform: "translateX(8px)" }, { transform: "translateX(-5px)" },
        { transform: "translateX(0)" }],
        { duration: 340, easing: "ease-out" });
    }

    async function submit() {
      if (busy || pin.length < 4) return;
      busy = true; say("");
      try {
        var hash = await sha256Hex((CFG.pinPepper || "") + pin);
        var r = await api.call("purchase_login", { p_pin_hash: hash, p_terminal_id: terminalId() });
        if (!r || !r.ok) {
          shake();
          say((r && r.message) || "الرمز غير صحيح");
          pin = ""; paint(); busy = false;
          return;
        }
        api.save(r.token);
        S.employee = r.employee || {};
        S.role = (r.employee && r.employee.role) || null;
        pin = ""; paint();
        hide();
        await boot();
      } catch (e) {
        shake(); say((e && e.message) || "تعذّر الدخول");
        pin = ""; paint();
      } finally { busy = false; }
    }

    function key(k) {
      if (busy) return;
      say("");
      if (k === "del") pin = pin.slice(0, -1);
      else if (k === "clear") pin = "";
      else if (pin.length < 8) pin += k;
      paint();
      if (pin.length >= 4 && k !== "del" && k !== "clear") {
        // مهلة قصيرة تسمح بإكمال رمز أطول من ٤
        clearTimeout(key._t);
        key._t = setTimeout(function () { if (pin.length >= 4) submit(); }, 260);
      }
    }

    function build() {
      dots = [];
      var dotRow = el("div.pin-dots", { "aria-hidden": "true" });
      for (var i = 0; i < 4; i++) { var d = el("span.pin-dot"); dots.push(d); dotRow.appendChild(d); }

      var pad = el("div.pin-pad");
      ["1", "2", "3", "4", "5", "6", "7", "8", "9"].forEach(function (n) {
        pad.appendChild(el("button.pin-key", {
          type: "button", "aria-label": n, onclick: function () { key(n); }
        }, n));
      });
      pad.appendChild(el("button.pin-key.alt", {
        type: "button", "aria-label": "مسح الكل", onclick: function () { key("clear"); }
      }, "مسح"));
      pad.appendChild(el("button.pin-key", {
        type: "button", "aria-label": "صفر", onclick: function () { key("0"); }
      }, "0"));
      pad.appendChild(el("button.pin-key.alt", {
        type: "button", "aria-label": "حذف خانة", onclick: function () { key("del"); }
      }, "⌫"));

      msg = el("div.lock-msg", { role: "alert", "aria-live": "assertive" });

      node = el("div.lock", { id: "pzLock" }, [
        el("div.lock-card.glass", {}, [
          el("div.lock-mark", { "aria-hidden": "true" }, "🛒"),
          el("h1", { text: "قسم الشراء" }),
          el("p", { text: "أدخل رمزك للدخول" }),
          dotRow, pad, msg
        ])
      ]);

      document.addEventListener("keydown", function (e) {
        if (node.hidden) return;
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); key(e.key); }
        else if (e.key === "Backspace") { e.preventDefault(); key("del"); }
        else if (e.key === "Enter") { e.preventDefault(); submit(); }
        else if (e.key === "Escape") { e.preventDefault(); key("clear"); }
      });
      return node;
    }

    function show(message) {
      api.save(null);
      S.employee = null; S.role = null;
      pin = ""; if (dots) paint();
      node.hidden = false;
      if (refs.shell) refs.shell.setAttribute("aria-hidden", "true");
      say(message || "");
    }
    function hide() {
      node.hidden = true;
      if (refs.shell) refs.shell.removeAttribute("aria-hidden");
    }

    return { build: build, show: show, hide: hide, node: function () { return node; } };
  })();

  /* قفل الخمول */
  var idle = (function () {
    var timer = null;
    function reset() {
      clearTimeout(timer);
      if (!api.token) return;
      var mins = Number(CFG.idleMinutes) || 15;
      timer = setTimeout(function () {
        api.call("purchase_logout", { p_token: api.token }).catch(function () { });
        lock.show("قُفلت الشاشة تلقائيًا بعد " + mins + " دقيقة خمول");
      }, mins * 60000);
    }
    function start() {
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) {
        document.addEventListener(ev, reset, { passive: true });
      });
      reset();
    }
    return { start: start, reset: reset };
  })();

  /* ======================================================================
     ٧) عناصر مشتركة
     ====================================================================== */
  function kpi(label, value, opts) {
    opts = opts || {};
    return el("div.kpi.glass", {}, [
      el("div.kpi-label", { text: label }),
      el("div.kpi-value" + (opts.tone ? ".kpi-" + opts.tone : ""), {}, [
        opts.raw ? String(value) : num(value),
        opts.unit ? el("small", { text: opts.unit }) : null
      ]),
      opts.foot ? el("div.kpi-foot", { text: opts.foot }) : null
    ]);
  }

  function emptyState(icon, text) {
    return el("div.empty", {}, [
      el("span.empty-ico", { "aria-hidden": "true", text: icon }),
      el("div", { text: text })
    ]);
  }

  function table(headers, rows) {
    var thead = el("thead", {}, el("tr", {}, headers.map(function (h) {
      var isObj = h && typeof h === "object";
      // عمود بلا عنوان (أزرار الإجراءات) يبقى فارغًا — لا يُطبع الكائن نفسه
      return el("th" + (isObj && h.end ? ".t-end" : ""),
        { text: isObj ? (h.label === undefined ? "" : h.label) : h });
    })));
    return el("div.tbl-wrap", {}, el("table.tbl", {}, [thead, el("tbody", {}, rows)]));
  }

  function statusChip(status) {
    var map = {
      "posted": ["مُرحّلة", "ok"], "cancelled": ["ملغاة", "danger"],
      "CASH": ["نقدًا", "ok"], "DEBT": ["بالآجل", "warn"], "PARTIAL": ["دفعة جزئية", "brand"],
      "BALANCE": ["من الرصيد", "brand"],
      "out-of-stock": ["خلصت", "danger"], "urgent": ["مستعجل", "danger"],
      "warning": ["قاربت تخلص", "warn"], "manual": ["يدوية", "brand"]
    };
    var m = map[status] || [String(status || "—"), ""];
    return el("span.chip" + (m[1] ? ".chip-" + m[1] : ""), { text: m[0] });
  }

  function field(label, control, hint) {
    return el("label.field", {}, [
      el("span.label", { text: label }),
      control,
      hint ? el("span.hint", { text: hint }) : null
    ]);
  }

  function inputEl(attrs) { return el("input.input", Object.assign({ type: "text" }, attrs || {})); }
  function numInput(attrs) {
    return el("input.input.input-num", Object.assign(
      { type: "text", inputmode: "decimal", autocomplete: "off" }, attrs || {}));
  }

  function busyBtn(btn, on, labelWhenBusy) {
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.disabled = true;
      btn.textContent = labelWhenBusy || "لحظة…";
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }

  /* ======================================================================
     ٨) الشاشات
     ====================================================================== */
  var views = {};

  /* ── لوحة الشراء ───────────────────────────────────────────────────── */
  views.dash = {
    title: "لوحة الشراء",
    render: async function (host) {
      var days = S.cache.dashDays || 30;
      var r = await api.auth("purchase_dashboard", { p_days: days });
      var k = r.kpis || {};

      var seg = el("div.seg", { role: "group", "aria-label": "المدة" },
        [[7, "أسبوع"], [30, "شهر"], [90, "٣ أشهر"]].map(function (o) {
          return el("button", {
            type: "button", "aria-pressed": days === o[0] ? "true" : "false",
            onclick: function () { S.cache.dashDays = o[0]; go("dash"); }
          }, o[1]);
        }));

      host.appendChild(el("div", { style: "display:flex;justify-content:flex-end;margin-bottom:14px" }, seg));

      host.appendChild(el("div.grid.g-kpi", {}, [
        kpi("مشتريات المدة", k.purchases_total, { tone: "accent", unit: "IQD", foot: money(k.purchases_count) + " فاتورة" }),
        kpi("المدفوع نقدًا", k.purchases_paid, { tone: "ok", unit: "IQD" }),
        kpi("شراء بالآجل", k.purchases_debt, { tone: "warn", unit: "IQD" }),
        kpi("ديون الموردين", k.supplier_debt, { tone: k.supplier_debt > 0 ? "danger" : "ok", unit: "IQD" }),
        kpi("قيمة المخزون", k.stock_value, { unit: "IQD", foot: "بسعر التكلفة" }),
        kpi("نواقص مفتوحة", k.open_shortages, { tone: k.open_shortages > 0 ? "warn" : "ok" }),
        kpi("مرتجعات للمورّد", k.returns_total, { unit: "IQD" }),
        kpi("تسديدات للموردين", k.payments_total, { tone: "ok", unit: "IQD" })
      ]));

      var wrap = el("div.grid.g-2", { style: "margin-top:16px" });

      /* رسم أعمدة يومي */
      var daily = r.daily || [];
      var chartCard = el("section.card.glass", {}, [
        el("div.card-head", {}, el("h2", { text: "حركة الشراء اليومية" }))
      ]);
      if (!daily.length) chartCard.appendChild(emptyState("📉", "لا مشتريات بهذه المدة"));
      else chartCard.appendChild(barChart(daily));
      wrap.appendChild(chartCard);

      /* أعلى الموردين */
      var tops = r.top_suppliers || [];
      var supCard = el("section.card.glass", {}, [
        el("div.card-head", {}, el("h2", { text: "أعلى الموردين" }))
      ]);
      supCard.appendChild(tops.length
        ? table([{ label: "المورّد" }, { label: "فواتير", end: true }, { label: "المبلغ", end: true }],
          tops.map(function (t) {
            return el("tr", {}, [
              el("td", { text: t.name || "—" }),
              el("td.t-end", {}, num(t.count)),
              el("td.t-end", {}, num(t.total))
            ]);
          }))
        : emptyState("🏷️", "لا بيانات بعد"));
      wrap.appendChild(supCard);

      /* أكثر الأصناف شراءً */
      var items = r.top_items || [];
      var itCard = el("section.card.glass", {}, [
        el("div.card-head", {}, el("h2", { text: "أكثر الأصناف شراءً" }))
      ]);
      itCard.appendChild(items.length
        ? table([{ label: "الصنف" }, { label: "الكمية", end: true }, { label: "الكلفة", end: true }],
          items.map(function (t) {
            return el("tr", {}, [
              el("td", { text: t.name }),
              el("td.t-end", {}, num(t.qty)),
              el("td.t-end", {}, num(t.total))
            ]);
          }))
        : emptyState("📦", "لا بيانات بعد"));
      wrap.appendChild(itCard);

      host.appendChild(wrap);
    }
  };

  function barChart(rows) {
    var NS = "http://www.w3.org/2000/svg";
    var W = 640, H = 190, pad = 26;
    var max = Math.max.apply(null, rows.map(function (d) { return Number(d.total) || 0; })) || 1;
    var bw = Math.max(4, Math.min(34, (W - pad * 2) / rows.length - 6));

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("role", "img");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-label",
      "مشتريات " + rows.length + " يومًا، أعلى يوم " + money(max) + " دينار");
    svg.style.width = "100%"; svg.style.height = "190px"; svg.style.overflow = "visible";
    // إحداثيات SVG لا تنقلب مع اتجاه الصفحة — نعكسها يدويًا
    // ليمشي الزمن من اليمين لليسار مثل بقيّة الواجهة.
    svg.style.transform = "scaleX(-1)";

    var grad = document.createElementNS(NS, "linearGradient");
    grad.setAttribute("id", "pzBar"); grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
    [["0%", "#7A8AFF"], ["100%", "#5B6EFF"]].forEach(function (s) {
      var st = document.createElementNS(NS, "stop");
      st.setAttribute("offset", s[0]); st.setAttribute("stop-color", s[1]);
      grad.appendChild(st);
    });
    var defs = document.createElementNS(NS, "defs"); defs.appendChild(grad); svg.appendChild(defs);

    // خط الأساس
    var base = document.createElementNS(NS, "line");
    base.setAttribute("x1", pad); base.setAttribute("x2", W - pad);
    base.setAttribute("y1", H - pad); base.setAttribute("y2", H - pad);
    base.setAttribute("stroke", "rgba(16,20,45,.12)");
    svg.appendChild(base);

    rows.forEach(function (d, i) {
      var v = Number(d.total) || 0;
      var h = Math.max(3, ((H - pad * 2) * v) / max);
      var x = pad + i * ((W - pad * 2) / rows.length) + 3;
      var rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", x); rect.setAttribute("width", bw);
      rect.setAttribute("y", H - pad - h); rect.setAttribute("height", h);
      rect.setAttribute("rx", Math.min(5, bw / 2));
      rect.setAttribute("fill", "url(#pzBar)");
      var ttl = document.createElementNS(NS, "title");
      ttl.textContent = fmtDate(d.day) + " — " + iqd(v);
      rect.appendChild(ttl);
      if (!reduceMotion.matches) {
        rect.animate([{ transform: "scaleY(0)", opacity: 0.3 }, { transform: "scaleY(1)", opacity: 1 }],
          { duration: 420, delay: i * 16, easing: "cubic-bezier(.32,.72,0,1)", fill: "backwards" });
        rect.style.transformOrigin = x + "px " + (H - pad) + "px";
      }
      svg.appendChild(rect);
    });

    return el("div", { style: "overflow-x:auto" }, svg);
  }

  /* ── فاتورة شراء جديدة ─────────────────────────────────────────────── */
  views.buy = {
    title: "فاتورة شراء",
    render: async function (host) {
      var d = S.draft;

      /* ① المورّد */
      var supSelect = el("select.select", {
        "aria-label": "المورّد",
        onchange: function () {
          d.supplierId = this.value;
          d.supplierName = "";
          newSupBox.hidden = this.value !== "__new";
          if (this.value === "__new") newSupName.focus();
        }
      }, [el("option", { value: "" }, "— اختر المورّد —")]);

      S.suppliers.forEach(function (s) {
        supSelect.appendChild(el("option", { value: s.id }, s.name +
          (Number(s.balance) > 0 ? "  (عليه " + money(s.balance) + ")" : "")));
      });
      supSelect.appendChild(el("option", { value: "__new" }, "+ مورّد جديد"));
      supSelect.value = d.supplierId || "";

      var newSupName = inputEl({
        placeholder: "اسم المورّد الجديد", maxlength: "120",
        oninput: function () { d.supplierName = this.value; }
      });
      newSupName.value = d.supplierName || "";
      var newSupPhone = inputEl({ placeholder: "الهاتف (اختياري)", maxlength: "32", dir: "ltr" });
      var newSupBox = el("div.grid", {
        style: "grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:10px",
        hidden: d.supplierId !== "__new"
      }, [field("اسم المورّد", newSupName), field("الهاتف", newSupPhone)]);

      /* ② البحث عن صنف */
      var acBox = el("div.ac", { hidden: true, role: "listbox" });
      var searchInput = inputEl({
        placeholder: "ابحث بالاسم أو امسح الباركود…",
        "aria-label": "بحث عن صنف", autocomplete: "off"
      });
      var searchWrap = el("div.search-wrap", { style: "position:relative" }, [
        el("span.s-ico", { "aria-hidden": "true", text: "🔍" }), searchInput, acBox
      ]);

      var acItems = [], acIndex = -1, acTimer = null;

      function closeAc() { acBox.hidden = true; acIndex = -1; acItems = []; }

      function paintAc(rows) {
        clear(acBox);
        acItems = rows;
        if (!rows.length) {
          acBox.appendChild(el("div", {
            style: "padding:12px;color:var(--ink-3);font-size:.84rem",
            text: "لا نتائج — اكتب الاسم كاملًا وسيُنشأ صنف جديد"
          }));
          acBox.appendChild(el("button.ac-item", {
            type: "button",
            onclick: function () { addLine({ product_name: searchInput.value.trim() }); }
          }, [el("span.ac-name", { text: "+ إنشاء صنف: " + searchInput.value.trim() })]));
          acBox.hidden = false;
          return;
        }
        rows.forEach(function (p, i) {
          acBox.appendChild(el("button.ac-item", {
            type: "button", role: "option", dataset: { i: String(i) },
            onclick: function () { addLine(p); }
          }, [
            el("span.ac-name", { text: p.name }),
            el("span.ac-meta", {}, [
              el("span.num", { text: money(p.stock_quantity) }), " بالمخزن · ",
              el("span.num", { text: money(p.cost_price) })
            ])
          ]));
        });
        acBox.hidden = false;
      }

      async function doSearch(q) {
        try {
          var r = await api.auth("purchase_products_search", { p_query: q, p_limit: 20 });
          var rows = r.rows || [];
          // مسح باركود: نتيجة وحيدة مطابقة ⇒ أضفها فورًا
          if (rows.length === 1 && rows[0].barcode && rows[0].barcode === q) {
            addLine(rows[0]); return;
          }
          paintAc(rows);
        } catch (e) { fail(e); }
      }

      searchInput.addEventListener("input", function () {
        var q = this.value.trim();
        clearTimeout(acTimer);
        if (q.length < 2) { closeAc(); return; }
        acTimer = setTimeout(function () { doSearch(q); }, 180);
      });
      searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          clearTimeout(acTimer);
          if (acIndex >= 0 && acItems[acIndex]) addLine(acItems[acIndex]);
          else if (this.value.trim().length >= 2) doSearch(this.value.trim());
          return;
        }
        if (acBox.hidden) return;
        var btns = $$(".ac-item", acBox);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          acIndex += (e.key === "ArrowDown" ? 1 : -1);
          if (acIndex < 0) acIndex = btns.length - 1;
          if (acIndex >= btns.length) acIndex = 0;
          btns.forEach(function (b, i) { b.dataset.active = i === acIndex ? "true" : "false"; });
          if (btns[acIndex]) btns[acIndex].scrollIntoView({ block: "nearest" });
        } else if (e.key === "Escape") { closeAc(); }
      });
      document.addEventListener("click", function (e) {
        if (!searchWrap.contains(e.target)) closeAc();
      });

      /* ③ السطور */
      var linesBox = el("div");
      var totalsBox = el("div.totals");

      function calcTotals() {
        var itemsTotal = d.lines.reduce(function (s, l) {
          return s + (int(l.quantity) * toNum(l.unit_cost) - toNum(l.discount));
        }, 0);
        var total = itemsTotal - toNum(d.discount) + toNum(d.extra);
        return { itemsTotal: itemsTotal, total: Math.max(total, 0) };
      }

      function paintTotals() {
        var t = calcTotals();
        var remaining = Math.max(t.total - toNum(d.paid), 0);
        clear(totalsBox);
        append(totalsBox, [
          el("div.row", {}, [el("span", { text: "مجموع الأصناف" }), num(t.itemsTotal)]),
          el("div.row", {}, [el("span", { text: "خصم المورّد" }), num(-toNum(d.discount))]),
          el("div.row", {}, [el("span", { text: "نقل وشحن" }), num(toNum(d.extra))]),
          el("div.row.grand", {}, [el("span", { text: "الإجمالي" }), num(t.total, " IQD")]),
          el("div.row", {}, [el("span", { text: "المدفوع الآن" }), num(toNum(d.paid))]),
          el("div.row", {}, [
            el("span", { text: "الباقي على الذمّة" }),
            el("span.num", {
              text: money(remaining),
              style: remaining > 0 ? "color:var(--warn);font-weight:700" : "color:var(--ok);font-weight:700"
            })
          ])
        ]);
      }

      function lineRow(l, idx) {
        var qty = numInput({
          value: l.quantity, "aria-label": "الكمية",
          oninput: function () { l.quantity = Math.max(1, int(this.value) || 1); recalcRow(); }
        });
        var cost = numInput({
          value: l.unit_cost, "aria-label": "تكلفة الوحدة",
          oninput: function () { l.unit_cost = toNum(this.value); recalcRow(); }
        });
        var sell = numInput({
          value: l.new_selling_price === null ? "" : l.new_selling_price,
          placeholder: l.old_selling ? money(l.old_selling) : "—",
          "aria-label": "سعر البيع الجديد",
          oninput: function () {
            l.new_selling_price = this.value.trim() === "" ? null : toNum(this.value);
            recalcRow();
          }
        });
        var totalCell = el("div.line-total");

        function recalcRow() {
          var lineTotal = int(l.quantity) * toNum(l.unit_cost) - toNum(l.discount);
          clear(totalCell).appendChild(num(lineTotal));
          // تحذير بصري فوري: سعر بيع تحت التكلفة
          var below = l.new_selling_price !== null && l.new_selling_price > 0 &&
            l.new_selling_price < toNum(l.unit_cost);
          sell.setAttribute("aria-invalid", below ? "true" : "false");
          sell.style.borderColor = below ? "var(--danger)" : "";
          paintTotals();
        }

        var row = el("div.line", {}, [
          el("div.line-name", {}, [
            document.createTextNode(l.product_name),
            el("small", {
              text: l.product_id
                ? ("بالمخزن " + money(l.old_stock) + " · تكلفة حالية " + money(l.old_cost))
                : "صنف جديد سيُضاف للمخزون"
            })
          ]),
          qty, cost, sell, totalCell,
          el("button.line-x", {
            type: "button", "aria-label": "حذف " + l.product_name,
            onclick: function () { d.lines.splice(idx, 1); paintLines(); }
          }, "✕")
        ]);
        recalcRow();
        return row;
      }

      function paintLines() {
        clear(linesBox);
        if (countChip) countChip.textContent = d.lines.length + " صنف";
        if (!d.lines.length) {
          linesBox.appendChild(emptyState("🧾", "ابحث عن صنف بالأعلى لإضافته للفاتورة"));
          paintTotals();
          return;
        }
        linesBox.appendChild(el("div.line-head", {}, [
          el("span", { text: "الصنف" }), el("span", { text: "الكمية" }),
          el("span", { text: "التكلفة" }), el("span", { text: "سعر البيع" }),
          el("span", { text: "المجموع" }), el("span")
        ]));
        d.lines.forEach(function (l, i) { linesBox.appendChild(lineRow(l, i)); });
        paintTotals();
      }

      function addLine(p) {
        closeAc();
        searchInput.value = "";
        var existing = p.id && d.lines.filter(function (l) { return l.product_id === p.id; })[0];
        if (existing) {
          existing.quantity = int(existing.quantity) + 1;
          paintLines();
          toast("زيدت كمية: " + existing.product_name);
          searchInput.focus();
          return;
        }
        d.lines.push({
          product_id: p.id || null,
          product_name: p.name || p.product_name || "صنف",
          barcode: p.barcode || null,
          quantity: p.suggested_qty ? int(p.suggested_qty) : 1,
          unit_cost: Number(p.cost_price) || Number(p.last_cost) || 0,
          discount: 0,
          new_selling_price: null,
          old_cost: Number(p.cost_price) || 0,
          old_selling: Number(p.selling_price) || 0,
          old_stock: int(p.stock_quantity),
          has_imei: !!p.has_imei
        });
        paintLines();
        searchInput.focus();
      }
      views.buy.addLine = addLine;   // تستعمله شاشة النواقص

      /* ④ الدفع */
      var discInput = numInput({
        value: d.discount || "", placeholder: "0",
        oninput: function () { d.discount = toNum(this.value); paintTotals(); }
      });
      var extraInput = numInput({
        value: d.extra || "", placeholder: "0",
        oninput: function () { d.extra = toNum(this.value); paintTotals(); }
      });
      var paidInput = numInput({
        value: d.paid || "", placeholder: "0",
        oninput: function () { d.paid = toNum(this.value); paintTotals(); }
      });
      var notesInput = el("textarea.textarea", {
        placeholder: "ملاحظات (اختياري)", maxlength: "1000",
        oninput: function () { d.notes = this.value; }
      });
      notesInput.value = d.notes || "";

      var payAllBtn = el("button.btn.btn-sm", {
        type: "button",
        onclick: function () {
          d.paid = calcTotals().total;
          paidInput.value = d.paid ? String(d.paid) : "";
          paintTotals();
        }
      }, "دفع الكل");

      /* ⑤ الترحيل */
      var postBtn = el("button.btn.btn-primary", { type: "button" }, "ترحيل الفاتورة");
      postBtn.addEventListener("click", async function () {
        if (!d.lines.length) { toast("أضف صنفًا واحدًا على الأقل", "warn"); return; }
        var supId = supSelect.value;
        if (!supId) { toast("اختر المورّد", "warn"); supSelect.focus(); return; }
        if (supId === "__new" && !newSupName.value.trim()) {
          toast("اكتب اسم المورّد الجديد", "warn"); newSupName.focus(); return;
        }

        var t = calcTotals();
        var ok = await confirmSheet("تأكيد الترحيل",
          "سيُضاف " + d.lines.length + " صنفًا للمخزون بإجمالي " + iqd(t.total) +
          ((toNum(d.paid) < t.total)
            ? " ويبقى " + iqd(t.total - toNum(d.paid)) + " على ذمّتك للمورّد."
            : " مدفوعة بالكامل."),
          "ترحيل");
        if (!ok) return;

        var payload = {
          client_id: d.opId || (d.opId = opId("PU")),
          discount: toNum(d.discount),
          extra_cost: toNum(d.extra),
          paid_amount: toNum(d.paid),
          notes: d.notes || null,
          items: d.lines.map(function (l) {
            var it = {
              product_id: l.product_id || null,
              product_name: l.product_name,
              barcode: l.barcode || null,
              quantity: int(l.quantity),
              unit_cost: toNum(l.unit_cost),
              discount: toNum(l.discount)
            };
            if (l.new_selling_price !== null && l.new_selling_price !== undefined) {
              it.new_selling_price = toNum(l.new_selling_price);
            }
            return it;
          })
        };
        if (supId === "__new") {
          payload.supplier_name = newSupName.value.trim();
          payload.supplier_phone = newSupPhone.value.trim() || null;
        } else {
          payload.supplier_id = supId;
        }

        busyBtn(postBtn, true, "يُرحّل…");
        try {
          var r = await api.auth("purchase_post", { p_payload: payload });
          if (r.duplicate) toast("الفاتورة مُرحّلة أصلًا: " + r.purchase_number, "warn");
          else toast("تمّ ترحيل الفاتورة " + r.purchase_number);

          (r.warnings || []).forEach(function (w) { toast(w.message, "warn"); });

          S.draft = { supplierId: "", supplierName: "", lines: [], discount: 0, extra: 0, paid: 0, notes: "" };
          S.cache = {};
          await refreshCounters();
          go("invoices");
        } catch (e) {
          fail(e);
          // معرّف جديد فقط لو الخطأ ليس شبكيًا — حتى لا نُرحّل مرتين
          if (e && !/الاتصال|وقتًا/.test(e.message || "")) d.opId = null;
        } finally { busyBtn(postBtn, false); }
      });

      /* التجميع */
      host.appendChild(el("section.card.glass", {}, [
        el("div.card-head", {}, el("h2", { text: "المورّد" })),
        field("اختر المورّد", supSelect),
        newSupBox
      ]));

      var countChip = el("span.chip.chip-brand", { text: d.lines.length + " صنف" });
      host.appendChild(el("section.card.glass", { style: "margin-top:14px" }, [
        el("div.card-head", {}, [el("h2", { text: "الأصناف" }), countChip]),
        searchWrap,
        el("div", { style: "margin-top:14px" }, linesBox)
      ]));

      host.appendChild(el("div.grid.g-2", { style: "margin-top:14px" }, [
        el("section.card.glass", {}, [
          el("div.card-head", {}, el("h2", { text: "المبالغ" })),
          el("div.grid", { style: "grid-template-columns:repeat(auto-fit,minmax(150px,1fr))" }, [
            field("خصم المورّد", discInput),
            field("نقل وشحن", extraInput, "يوزَّع على تكلفة الأصناف"),
            field("المدفوع الآن", paidInput)
          ]),
          el("div", { style: "margin-top:10px" }, payAllBtn),
          el("div", { style: "margin-top:12px" }, field("ملاحظات", notesInput))
        ]),
        el("section.card.glass", {}, [
          el("div.card-head", {}, el("h2", { text: "الخلاصة" })),
          totalsBox,
          el("div", { style: "margin-top:16px;display:flex;gap:8px;justify-content:flex-end" }, [
            el("button.btn", {
              type: "button",
              onclick: async function () {
                if (!d.lines.length) return;
                var ok = await confirmSheet("إفراغ الفاتورة",
                  "ستُحذف كل الأصناف المضافة. متأكد؟", "إفراغ", true);
                if (!ok) return;
                S.draft = { supplierId: "", supplierName: "", lines: [], discount: 0, extra: 0, paid: 0, notes: "" };
                go("buy");
              }
            }, "إفراغ"),
            postBtn
          ])
        ])
      ]));

      paintLines();
      setTimeout(function () { searchInput.focus(); }, 60);
    }
  };

  /* ── الفواتير ──────────────────────────────────────────────────────── */
  views.invoices = {
    title: "فواتير الشراء",
    render: async function (host) {
      var state = S.cache.inv || (S.cache.inv = { q: "", status: null });

      var search = inputEl({
        placeholder: "ابحث برقم الفاتورة أو اسم المورّد…",
        value: state.q, "aria-label": "بحث"
      });
      var timer = null;
      search.addEventListener("input", function () {
        state.q = this.value;
        clearTimeout(timer);
        timer = setTimeout(load, 240);
      });

      var seg = el("div.seg", { role: "group", "aria-label": "الحالة" },
        [[null, "الكل"], ["posted", "مُرحّلة"], ["cancelled", "ملغاة"]].map(function (o) {
          return el("button", {
            type: "button", "aria-pressed": state.status === o[0] ? "true" : "false",
            onclick: function () {
              state.status = o[0];
              $$("button", seg).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
              this.setAttribute("aria-pressed", "true");
              load();
            }
          }, o[1]);
        }));

      var body = el("div");
      host.appendChild(el("section.card.glass", {}, [
        el("div", {
          style: "display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px"
        }, [el("div.search-wrap", {}, [
          el("span.s-ico", { "aria-hidden": "true", text: "🔍" }), search
        ]), seg]),
        body
      ]));

      async function load() {
        clear(body).appendChild(el("div.empty", { text: "يُحمّل…" }));
        try {
          var r = await api.auth("purchase_list", {
            p_query: state.q, p_status: state.status, p_limit: 100, p_offset: 0
          });
          var rows = r.rows || [];
          clear(body);
          if (!rows.length) { body.appendChild(emptyState("🧾", "لا فواتير مطابقة")); return; }

          body.appendChild(table([
            { label: "الرقم" }, { label: "المورّد" }, { label: "التاريخ" },
            { label: "الإجمالي", end: true }, { label: "الباقي", end: true },
            { label: "الحالة" }
          ], rows.map(function (p) {
            return el("tr" + (p.status === "cancelled" ? ".row-muted" : "") + ".row-btn", {
              tabindex: "0", role: "button",
              onclick: function () { openInvoice(p.id); },
              onkeydown: function (e) {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInvoice(p.id); }
              }
            }, [
              el("td", {}, el("span.num", { text: p.purchase_number })),
              el("td", { text: p.supplier_name || "—" }),
              el("td", {}, el("span.num", { text: fmtDate(p.created_at) })),
              el("td.t-end", {}, num(p.total_amount)),
              el("td.t-end", {}, num(p.remaining)),
              el("td", {}, statusChip(p.status))
            ]);
          })));
          body.appendChild(el("div", {
            style: "margin-top:10px;font-size:.78rem;color:var(--ink-3)",
            text: "المعروض " + rows.length + " من " + r.total
          }));
        } catch (e) { clear(body); fail(e); }
      }
      await load();
    }
  };

  async function openInvoice(id) {
    try {
      var r = await api.auth("purchase_get", { p_id: id });
      if (!r.ok) { toast(r.message || "غير موجودة", "error"); return; }
      var p = r.purchase, items = r.items || [];

      var rows = [
        ["المورّد", p.supplier_name || "—"],
        ["التاريخ", fmtDateTime(p.created_at)],
        ["بواسطة", p.actor || "—"],
        ["مجموع الأصناف", money(p.items_total)],
        ["خصم المورّد", money(p.discount)],
        ["نقل وشحن", money(p.extra_cost)],
        ["الإجمالي", money(p.total_amount)],
        ["المدفوع", money(p.paid_amount)],
        ["الباقي", money(p.total_amount - p.paid_amount)]
      ];
      if (p.notes) rows.push(["ملاحظات", p.notes]);
      if (p.status === "cancelled") {
        rows.push(["أُلغيت في", fmtDateTime(p.cancelled_at)]);
        rows.push(["سبب الإلغاء", p.cancel_reason || "—"]);
        rows.push(["ألغاها", p.cancelled_by || "—"]);
      }

      var body = [
        el("div", { style: "display:flex;gap:8px;align-items:center;margin-bottom:14px" }, [
          statusChip(p.status), statusChip(p.payment_type)
        ]),
        el("div.totals", {}, rows.map(function (kv) {
          return el("div.row", {}, [
            el("span", { text: kv[0], style: "color:var(--ink-2)" }),
            el("span.num", { text: kv[1] })
          ]);
        })),
        el("h3", { text: "الأصناف", style: "margin:18px 0 8px" }),
        table([
          { label: "الصنف" }, { label: "كمية", end: true },
          { label: "التكلفة", end: true }, { label: "سعر البيع", end: true }
        ], items.map(function (i) {
          return el("tr", {}, [
            el("td", {}, [
              document.createTextNode(i.product_name),
              i.is_new_product ? el("small", {
                text: " (صنف جديد)", style: "color:var(--brand-deep)"
              }) : null,
              el("small", {
                style: "display:block;color:var(--ink-3)",
                text: "المخزون " + money(i.old_stock) + " ← " + money(i.new_stock)
              })
            ]),
            el("td.t-end", {}, num(i.quantity)),
            el("td.t-end", {}, [
              num(i.landed_unit_cost),
              el("small", {
                style: "display:block;color:var(--ink-3)",
                text: money(i.old_cost) + " ← " + money(i.new_cost)
              })
            ]),
            el("td.t-end", {}, [
              num(i.new_selling),
              i.old_selling !== i.new_selling
                ? el("small", { style: "display:block;color:var(--ink-3)", text: "كان " + money(i.old_selling) })
                : null
            ])
          ]);
        }))
      ];

      var foot = [el("button.btn", { type: "button", onclick: function () { sheet.close(); } }, "إغلاق")];
      if (p.status === "posted") {
        foot.unshift(el("button.btn.btn-danger", {
          type: "button",
          onclick: function () { askCancel(p); }
        }, "إلغاء الفاتورة"));
      }

      sheet.open("فاتورة " + p.purchase_number, body, foot);
    } catch (e) { fail(e); }
  }

  function askCancel(p) {
    var reason = el("textarea.textarea", { placeholder: "سبب الإلغاء…", maxlength: "500" });
    var btn = el("button.btn.btn-danger", { type: "button" }, "تأكيد الإلغاء");

    btn.addEventListener("click", async function () {
      var txt = reason.value.trim();
      if (!txt) { toast("اكتب سبب الإلغاء", "warn"); reason.focus(); return; }
      busyBtn(btn, true, "يُلغى…");
      try {
        var r = await api.auth("purchase_cancel", { p_id: p.id, p_reason: txt });
        if (r.already_cancelled) toast("الفاتورة ملغاة أصلًا", "warn");
        else toast("أُلغيت الفاتورة وأُرجع المخزون والأسعار");
        (r.warnings || []).forEach(function (w) { toast(w.message, "warn"); });
        sheet.close();
        S.cache = {};
        await refreshCounters();
        go("invoices");
      } catch (e) { fail(e); } finally { busyBtn(btn, false); }
    });

    sheet.open("إلغاء فاتورة " + p.purchase_number, [
      el("p", {
        style: "color:var(--ink-2);font-size:.88rem;margin-bottom:14px",
        text: "سيُرجَع المخزون والتكلفة وسعر البيع لما كانت عليه، ويُلغى المصروف المرتبط، " +
          "ويُعاد فتح سطور النواقص إن لزم. الفاتورة تبقى بالسجل ولا تُحذف."
      }),
      field("سبب الإلغاء", reason)
    ], [
      el("button.btn", { type: "button", onclick: function () { sheet.close(); } }, "تراجع"),
      btn
    ]);
  }

  /* ── الموردون ──────────────────────────────────────────────────────── */
  views.suppliers = {
    title: "الموردون",
    render: async function (host) {
      var state = S.cache.sup || (S.cache.sup = { q: "", onlyDebt: false });

      var search = inputEl({ placeholder: "ابحث باسم المورّد أو الهاتف…", value: state.q });
      var timer = null;
      search.addEventListener("input", function () {
        state.q = this.value; clearTimeout(timer); timer = setTimeout(load, 240);
      });

      var onlyDebt = el("label.switch", {}, [
        el("input", {
          type: "checkbox", checked: state.onlyDebt,
          onchange: function () { state.onlyDebt = this.checked; load(); }
        }),
        el("span.track"),
        el("span", { text: "عليهم رصيد فقط", style: "font-size:.84rem" })
      ]);

      var body = el("div");
      host.appendChild(el("section.card.glass", {}, [
        el("div", { style: "display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px" }, [
          el("div.search-wrap", {}, [el("span.s-ico", { "aria-hidden": "true", text: "🔍" }), search]),
          onlyDebt,
          el("button.btn.btn-primary.btn-sm", {
            type: "button", onclick: function () { editSupplier(null); }
          }, "+ مورّد جديد")
        ]),
        body
      ]));

      async function load() {
        clear(body).appendChild(el("div.empty", { text: "يُحمّل…" }));
        try {
          var r = await api.auth("purchase_suppliers_list", {
            p_query: state.q, p_only_debt: state.onlyDebt
          });
          var rows = r.rows || [];
          clear(body);
          if (!rows.length) { body.appendChild(emptyState("🏷️", "لا موردين بعد")); return; }

          body.appendChild(table([
            { label: "المورّد" }, { label: "الهاتف" },
            { label: "فواتير", end: true }, { label: "إجمالي الشراء", end: true },
            { label: "الرصيد", end: true }
          ], rows.map(function (s) {
            return el("tr.row-btn" + (s.is_active ? "" : ".row-muted"), {
              tabindex: "0", role: "button",
              onclick: function () { openSupplier(s); },
              onkeydown: function (e) {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSupplier(s); }
              }
            }, [
              el("td", {}, [
                document.createTextNode(s.name),
                s.company ? el("small", { style: "display:block;color:var(--ink-3)", text: s.company }) : null
              ]),
              el("td", {}, s.phone ? el("span.num", { text: s.phone }) : "—"),
              el("td.t-end", {}, num(s.purchases_count)),
              el("td.t-end", {}, num(s.purchases_total)),
              el("td.t-end", {}, el("span.num", {
                text: money(s.balance),
                style: Number(s.balance) > 0 ? "color:var(--danger);font-weight:700" : "color:var(--ok)"
              }))
            ]);
          })));
        } catch (e) { clear(body); fail(e); }
      }
      await load();
    }
  };

  async function openSupplier(s) {
    try {
      var r = await api.auth("purchase_supplier_statement", { p_supplier_id: s.id });
      var sup = r.supplier || s;
      var moves = r.movements || [];

      var kindLabel = { purchase: "فاتورة شراء", payment: "تسديد", return: "مرتجع" };

      var body = [
        el("div.grid.g-kpi", { style: "margin-bottom:16px" }, [
          kpi("الرصيد الحالي", sup.balance, { tone: Number(sup.balance) > 0 ? "danger" : "ok", unit: "IQD" }),
          kpi("سقف الائتمان", sup.credit_limit, { unit: "IQD" })
        ]),
        sup.phone ? el("div.totals", {}, [
          el("div.row", {}, [el("span", { text: "الهاتف" }), el("span.num", { text: sup.phone })]),
          sup.company ? el("div.row", {}, [el("span", { text: "الشركة" }), el("span", { text: sup.company })]) : null,
          sup.address ? el("div.row", {}, [el("span", { text: "العنوان" }), el("span", { text: sup.address })]) : null
        ]) : null,
        el("h3", { text: "كشف الحساب", style: "margin:18px 0 8px" }),
        moves.length ? table([
          { label: "التاريخ" }, { label: "الحركة" }, { label: "المرجع" }, { label: "الأثر", end: true }
        ], moves.map(function (m) {
          var effect = Number(m.effect) || 0;
          return el("tr" + (m.status === "cancelled" ? ".row-muted" : ""), {}, [
            el("td", {}, el("span.num", { text: fmtDate(m.at) })),
            el("td", { text: kindLabel[m.kind] || m.kind }),
            el("td", {}, el("span.num", { text: m.ref || "—" })),
            el("td.t-end", {}, el("span.num", {
              text: (effect > 0 ? "+" : "") + money(effect),
              style: effect > 0 ? "color:var(--danger)" : "color:var(--ok)"
            }))
          ]);
        })) : emptyState("📄", "لا حركات بعد")
      ];

      var foot = [
        el("button.btn", { type: "button", onclick: function () { editSupplier(sup); } }, "تعديل"),
        el("button.btn.btn-primary", {
          type: "button", disabled: !(Number(sup.balance) > 0),
          onclick: function () { paySupplier(sup); }
        }, "تسديد")
      ];

      sheet.open(sup.name, body, foot);
    } catch (e) { fail(e); }
  }

  function editSupplier(sup) {
    var name = inputEl({ value: (sup && sup.name) || "", maxlength: "120", required: true });
    var phone = inputEl({ value: (sup && sup.phone) || "", maxlength: "32", dir: "ltr" });
    var company = inputEl({ value: (sup && sup.company) || "", maxlength: "120" });
    var address = inputEl({ value: (sup && sup.address) || "", maxlength: "240" });
    var limit = numInput({ value: (sup && sup.credit_limit) || "" });
    var notes = el("textarea.textarea", { maxlength: "1000" });
    notes.value = (sup && sup.notes) || "";

    var save = el("button.btn.btn-primary", { type: "button" }, "حفظ");
    save.addEventListener("click", async function () {
      if (!name.value.trim()) { toast("اسم المورّد مطلوب", "warn"); name.focus(); return; }
      busyBtn(save, true, "يُحفظ…");
      try {
        await api.auth("purchase_supplier_save", {
          p_payload: {
            id: sup ? sup.id : null,
            name: name.value.trim(),
            phone: phone.value.trim() || null,
            company: company.value.trim() || null,
            address: address.value.trim() || null,
            notes: notes.value.trim() || null,
            credit_limit: toNum(limit.value)
          }
        });
        toast(sup ? "حُدّثت بيانات المورّد" : "أُضيف المورّد");
        sheet.close();
        await refreshSuppliers();
        S.cache.sup = null;
        go("suppliers");
      } catch (e) { fail(e); } finally { busyBtn(save, false); }
    });

    sheet.open(sup ? "تعديل مورّد" : "مورّد جديد", [
      field("الاسم *", name), field("الهاتف", phone), field("الشركة", company),
      field("العنوان", address), field("سقف الائتمان", limit), field("ملاحظات", notes)
    ].map(function (f) { f.style.marginBottom = "12px"; return f; }), [
      el("button.btn", { type: "button", onclick: function () { sheet.close(); } }, "تراجع"),
      save
    ]);
  }

  function paySupplier(sup) {
    var amount = numInput({ placeholder: "0", "aria-label": "المبلغ المدفوع" });
    var waived = numInput({ placeholder: "0", "aria-label": "مبلغ الحسم" });
    var reason = inputEl({ placeholder: "سبب الحسم", maxlength: "500" });
    var notes = inputEl({ placeholder: "ملاحظات", maxlength: "1000" });
    var summary = el("div.totals");

    function paint() {
      var bal = Number(sup.balance) || 0;
      var rem = Math.max(bal - toNum(amount.value) - toNum(waived.value), 0);
      clear(summary);
      append(summary, [
        el("div.row", {}, [el("span", { text: "الرصيد الحالي" }), num(bal)]),
        el("div.row.grand", {}, [el("span", { text: "الباقي بعد الدفع" }), num(rem, " IQD")])
      ]);
    }
    amount.addEventListener("input", paint);
    waived.addEventListener("input", paint);
    paint();

    var payAll = el("button.btn.btn-sm", {
      type: "button",
      onclick: function () { amount.value = String(Number(sup.balance) || 0); paint(); }
    }, "تسديد الكل");

    var save = el("button.btn.btn-primary", { type: "button" }, "تسجيل الدفعة");
    save.addEventListener("click", async function () {
      var a = toNum(amount.value), w = toNum(waived.value);
      if (a + w <= 0) { toast("أدخل مبلغًا", "warn"); amount.focus(); return; }
      if (w > 0 && !reason.value.trim()) { toast("اكتب سبب الحسم", "warn"); reason.focus(); return; }
      busyBtn(save, true, "يُسجّل…");
      try {
        var r = await api.auth("supplier_payment_post", {
          p_payload: {
            client_id: opId("SP"),
            supplier_id: sup.id,
            amount_paid: a,
            waived_amount: w,
            waiver_reason: reason.value.trim() || null,
            notes: notes.value.trim() || null
          }
        });
        toast(r.duplicate ? "الدفعة مسجّلة أصلًا" : "سُجّلت الدفعة — الباقي " + iqd(r.remaining_balance));
        sheet.close();
        await refreshSuppliers();
        S.cache.sup = null;
        go("suppliers");
      } catch (e) { fail(e); } finally { busyBtn(save, false); }
    });

    sheet.open("تسديد — " + sup.name, [
      summary,
      el("div", { style: "height:14px" }),
      field("المبلغ المدفوع نقدًا", amount, "يُسجَّل تلقائيًا بالمصروفات"),
      el("div", { style: "margin:8px 0" }, payAll),
      field("مبلغ الحسم (اختياري)", waived),
      field("سبب الحسم", reason),
      field("ملاحظات", notes)
    ].map(function (f) { if (f.classList && f.classList.contains("field")) f.style.marginBottom = "12px"; return f; }), [
      el("button.btn", { type: "button", onclick: function () { sheet.close(); } }, "تراجع"),
      save
    ]);
  }

  /* ── النواقص ───────────────────────────────────────────────────────── */
  views.shortages = {
    title: "النواقص",
    render: async function (host) {
      var r = await api.auth("purchase_shortages", { p_include_low: true });
      var rows = r.rows || [];

      host.appendChild(el("section.card.glass", {}, [
        el("div.card-head", {}, [
          el("h2", { text: "ما يحتاج شراء" }),
          el("span.chip" + (rows.length ? ".chip-warn" : ".chip-ok"), { text: rows.length + " صنف" })
        ]),
        el("p", {
          style: "color:var(--ink-2);font-size:.85rem;margin-bottom:14px",
          text: "هذه سطور قسم النواقص نفسه — تُغلق تلقائيًا أول ما تصل البضاعة، " +
            "وتُفتح من جديد إذا نزلت الكمية تحت الحد. أضف ما تحتاجه لفاتورة الشراء مباشرة."
        }),
        rows.length ? actionsBar(rows) : null,
        rows.length ? table([
          { label: "الصنف" }, { label: "الحالة" },
          { label: "بالمخزن", end: true }, { label: "الحد", end: true },
          { label: "بيع ٣٠ يوم", end: true }, { label: "المقترح", end: true },
          { label: "آخر تكلفة", end: true }, { label: "" }
        ], rows.map(rowFor)) : emptyState("✅", "ما في نواقص — المخزون بحالة زينة")
      ]));

      function actionsBar(list) {
        var buyable = list.filter(function (x) { return x.product_id; });
        return el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" }, [
          el("button.btn.btn-primary.btn-sm", {
            type: "button", disabled: !buyable.length,
            onclick: function () {
              buyable.forEach(addToDraft);
              toast("أُضيف " + buyable.length + " صنفًا لفاتورة الشراء");
              go("buy");
            }
          }, "أضف الكل لفاتورة شراء"),
          el("button.btn.btn-sm", {
            type: "button",
            onclick: function () {
              var urgent = buyable.filter(function (x) {
                return x.status === "out-of-stock" || x.status === "urgent";
              });
              if (!urgent.length) { toast("ما في أصناف مستعجلة", "warn"); return; }
              urgent.forEach(addToDraft);
              toast("أُضيف " + urgent.length + " صنفًا مستعجلًا");
              go("buy");
            }
          }, "المستعجل فقط")
        ]);
      }

      function addToDraft(x) {
        var d = S.draft;
        var found = d.lines.filter(function (l) { return l.product_id === x.product_id; })[0];
        if (found) { found.quantity = Math.max(int(found.quantity), int(x.suggested_qty)); return; }
        d.lines.push({
          product_id: x.product_id,
          product_name: x.name,
          barcode: x.barcode || null,
          quantity: Math.max(1, int(x.suggested_qty)),
          unit_cost: Number(x.last_cost) || Number(x.cost_price) || 0,
          discount: 0,
          new_selling_price: null,
          old_cost: Number(x.cost_price) || 0,
          old_selling: Number(x.selling_price) || 0,
          old_stock: int(x.current_qty),
          has_imei: !!x.has_imei
        });
        if (!d.supplierId && x.last_supplier_id) d.supplierId = x.last_supplier_id;
      }

      function rowFor(x) {
        return el("tr", {}, [
          el("td", {}, [
            document.createTextNode(x.name),
            el("small", {
              style: "display:block;color:var(--ink-3)",
              text: (x.category || "بلا تصنيف") +
                (x.last_supplier_name ? " · آخر مورّد: " + x.last_supplier_name : "")
            })
          ]),
          el("td", {}, statusChip(x.status)),
          el("td.t-end", {}, num(x.current_qty)),
          el("td.t-end", {}, num(x.limit_qty)),
          el("td.t-end", {}, num(x.sold_30d)),
          el("td.t-end", {}, el("span.num", {
            text: money(x.suggested_qty), style: "font-weight:700;color:var(--brand-deep)"
          })),
          el("td.t-end", {}, x.last_cost ? num(x.last_cost) : "—"),
          el("td.t-end", {}, x.product_id
            ? el("button.btn.btn-sm", {
              type: "button",
              onclick: function () {
                addToDraft(x);
                toast("أُضيف: " + x.name);
                go("buy");
              }
            }, "أضف")
            : el("span.chip", { text: "يدوي" }))
        ]);
      }
    }
  };

  /* ── المرتجعات ─────────────────────────────────────────────────────── */
  views.returns = {
    title: "مرتجعات للمورّد",
    render: async function (host) {
      var body = el("div");
      host.appendChild(el("section.card.glass", {}, [
        el("div.card-head", {}, [
          el("h2", { text: "المرتجعات" }),
          el("button.btn.btn-primary.btn-sm", {
            type: "button", onclick: function () { newReturn(); }
          }, "+ مرتجع جديد")
        ]),
        body
      ]));

      var r = await api.auth("purchase_returns_list", { p_query: "", p_limit: 100 });
      var rows = r.rows || [];
      if (!rows.length) { body.appendChild(emptyState("↩️", "لا مرتجعات مسجّلة")); return; }

      body.appendChild(table([
        { label: "الرقم" }, { label: "المورّد" }, { label: "التاريخ" },
        { label: "الأصناف", end: true }, { label: "المبلغ", end: true }, { label: "الاسترجاع" }
      ], rows.map(function (x) {
        return el("tr", {}, [
          el("td", {}, el("span.num", { text: x.return_number })),
          el("td", { text: x.supplier_name || "—" }),
          el("td", {}, el("span.num", { text: fmtDate(x.created_at) })),
          el("td.t-end", {}, num((x.items || []).length)),
          el("td.t-end", {}, num(x.total_amount)),
          el("td", {}, statusChip(x.refund_method))
        ]);
      })));
    }
  };

  function newReturn() {
    var lines = [];
    var supSelect = el("select.select", { "aria-label": "المورّد" },
      [el("option", { value: "" }, "— اختر المورّد —")].concat(
        S.suppliers.map(function (s) { return el("option", { value: s.id }, s.name); })));

    var method = el("select.select", {}, [
      el("option", { value: "BALANCE" }, "يُحسم من رصيد المورّد"),
      el("option", { value: "CASH" }, "استرجعنا المبلغ نقدًا")
    ]);
    var reason = inputEl({ placeholder: "سبب الإرجاع", maxlength: "500" });

    var acBox = el("div.ac", { hidden: true });
    var search = inputEl({ placeholder: "ابحث عن الصنف المرتجع…", autocomplete: "off" });
    var searchWrap = el("div.search-wrap", { style: "position:relative" }, [
      el("span.s-ico", { "aria-hidden": "true", text: "🔍" }), search, acBox
    ]);
    var linesBox = el("div");
    var totalBox = el("div.totals");

    var timer = null;
    search.addEventListener("input", function () {
      var q = this.value.trim();
      clearTimeout(timer);
      if (q.length < 2) { acBox.hidden = true; return; }
      timer = setTimeout(async function () {
        try {
          var r = await api.auth("purchase_products_search", { p_query: q, p_limit: 15 });
          clear(acBox);
          (r.rows || []).forEach(function (p) {
            acBox.appendChild(el("button.ac-item", {
              type: "button",
              onclick: function () {
                if (!lines.filter(function (l) { return l.product_id === p.id; }).length) {
                  lines.push({
                    product_id: p.id, product_name: p.name,
                    quantity: 1, unit_cost: Number(p.cost_price) || 0,
                    stock: int(p.stock_quantity)
                  });
                }
                search.value = ""; acBox.hidden = true; paint();
              }
            }, [
              el("span.ac-name", { text: p.name }),
              el("span.ac-meta", {}, el("span.num", { text: money(p.stock_quantity) + " بالمخزن" }))
            ]));
          });
          acBox.hidden = false;
        } catch (e) { fail(e); }
      }, 200);
    });

    function paint() {
      clear(linesBox);
      if (!lines.length) linesBox.appendChild(emptyState("📦", "أضف الأصناف المرتجعة"));
      lines.forEach(function (l, i) {
        var qty = numInput({
          value: l.quantity, "aria-label": "الكمية",
          oninput: function () { l.quantity = Math.max(1, int(this.value) || 1); paint(); }
        });
        var cost = numInput({
          value: l.unit_cost, "aria-label": "التكلفة",
          oninput: function () { l.unit_cost = toNum(this.value); paint(); }
        });
        linesBox.appendChild(el("div.line", {
          style: "grid-template-columns:1fr 74px 110px 40px"
        }, [
          el("div.line-name", {}, [
            document.createTextNode(l.product_name),
            el("small", { text: "بالمخزن " + money(l.stock) })
          ]),
          qty, cost,
          el("button.line-x", {
            type: "button", "aria-label": "حذف",
            onclick: function () { lines.splice(i, 1); paint(); }
          }, "✕")
        ]));
      });
      var total = lines.reduce(function (s, l) { return s + int(l.quantity) * toNum(l.unit_cost); }, 0);
      clear(totalBox).appendChild(el("div.row.grand", {}, [
        el("span", { text: "إجمالي المرتجع" }), num(total, " IQD")
      ]));
    }
    paint();

    var save = el("button.btn.btn-primary", { type: "button" }, "تسجيل المرتجع");
    save.addEventListener("click", async function () {
      if (!supSelect.value) { toast("اختر المورّد", "warn"); return; }
      if (!lines.length) { toast("أضف صنفًا", "warn"); return; }
      var over = lines.filter(function (l) { return int(l.quantity) > l.stock; })[0];
      if (over) { toast("كمية «" + over.product_name + "» أكبر من المخزون", "warn"); return; }

      busyBtn(save, true, "يُسجّل…");
      try {
        var r = await api.auth("purchase_return_post", {
          p_payload: {
            client_id: opId("PR"),
            supplier_id: supSelect.value,
            refund_method: method.value,
            reason: reason.value.trim() || null,
            items: lines.map(function (l) {
              return {
                product_id: l.product_id, quantity: int(l.quantity),
                unit_cost: toNum(l.unit_cost)
              };
            })
          }
        });
        toast(r.duplicate ? "المرتجع مسجّل أصلًا" : "سُجّل المرتجع " + r.return_number);
        sheet.close();
        S.cache = {};
        await refreshSuppliers();
        await refreshCounters();
        go("returns");
      } catch (e) { fail(e); } finally { busyBtn(save, false); }
    });

    sheet.open("مرتجع جديد", [
      field("المورّد", supSelect),
      el("div", { style: "height:12px" }),
      field("الأصناف", searchWrap),
      el("div", { style: "margin-top:12px" }, linesBox),
      totalBox,
      el("div", { style: "height:12px" }),
      field("طريقة الاسترجاع", method),
      el("div", { style: "height:12px" }),
      field("سبب الإرجاع", reason)
    ], [
      el("button.btn", { type: "button", onclick: function () { sheet.close(); } }, "تراجع"),
      save
    ]);
  }

  /* ── الإعدادات ─────────────────────────────────────────────────────── */
  views.settings = {
    title: "إعدادات الشراء",
    render: async function (host) {
      var isAdmin = S.role === "ADMIN";
      var st = S.settings || {};
      var draft = {};

      function pick(key, label, options, hint) {
        var sel = el("select.select", {
          disabled: !isAdmin,
          onchange: function () { draft[key] = this.value; }
        }, options.map(function (o) {
          return el("option", { value: o[0], selected: st[key] === o[0] }, o[1]);
        }));
        return field(label, sel, hint);
      }
      function toggle(key, label, hint) {
        var input = el("input", {
          type: "checkbox", checked: st[key] === true, disabled: !isAdmin,
          onchange: function () { draft[key] = this.checked; }
        });
        return el("div.field", {}, [
          el("label.switch", {}, [input, el("span.track"), el("span", { text: label })]),
          hint ? el("span.hint", { text: hint }) : null
        ]);
      }
      function number(key, label, hint) {
        var inp = numInput({
          value: st[key], disabled: !isAdmin,
          oninput: function () { draft[key] = toNum(this.value); }
        });
        return field(label, inp, hint);
      }

      var saveBtn = el("button.btn.btn-primary", { type: "button", disabled: !isAdmin }, "حفظ الإعدادات");
      saveBtn.addEventListener("click", async function () {
        if (!Object.keys(draft).length) { toast("ما في تغييرات", "warn"); return; }
        busyBtn(saveBtn, true, "يُحفظ…");
        try {
          await api.auth("purchase_settings_save", { p_payload: draft });
          toast("انحفظت الإعدادات");
          draft = {};
          await refreshBootstrap();
        } catch (e) { fail(e); } finally { busyBtn(saveBtn, false); }
      });

      host.appendChild(el("section.card.glass", {}, [
        el("div.card-head", {}, el("h2", { text: "سياسة التكلفة والتسعير" })),
        !isAdmin ? el("p", {
          style: "color:var(--warn);font-size:.84rem;margin-bottom:12px",
          text: "العرض فقط — تعديل الإعدادات للمدير العام."
        }) : null,
        el("div.grid", { style: "grid-template-columns:repeat(auto-fit,minmax(230px,1fr))" }, [
          pick("cost_method", "طريقة احتساب التكلفة", [
            ["moving_average", "متوسط مرجّح متحرك"], ["last", "آخر سعر شراء"]
          ], "المتوسط المرجّح يوزّع فرق السعر على الكمية كلها"),
          pick("price_policy", "سياسة سعر البيع", [
            ["manual", "يدوي بالفاتورة"], ["margin", "هامش ثابت"], ["keep", "لا يتغيّر"]
          ]),
          number("default_margin_pct", "هامش الربح الافتراضي ٪"),
          pick("expense_category", "تصنيف مصروف المشتريات", [
            ["cat_purchases", "مشتريات"], ["cat_supplies", "مستلزمات"], ["cat_misc", "متفرقات"]
          ])
        ])
      ]));

      host.appendChild(el("section.card.glass", { style: "margin-top:14px" }, [
        el("div.card-head", {}, el("h2", { text: "الربط والحدود" })),
        el("div.grid", { style: "grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px" }, [
          toggle("auto_expense", "تسجيل مصروف تلقائي", "كل دفعة نقدية تُسجَّل بقسم المصروفات"),
          toggle("auto_resolve_shortages", "تحديث النواقص تلقائيًا", "إغلاق سطر النواقص عند وصول البضاعة"),
          toggle("allow_new_products", "السماح بإنشاء أصناف", "إضافة صنف جديد من داخل فاتورة الشراء"),
          number("cancel_window_hours", "مهلة الإلغاء للمدير (ساعة)"),
          number("session_ttl_hours", "عمر الجلسة (ساعة)"),
          number("max_items_per_invoice", "أقصى أصناف بالفاتورة")
        ]),
        el("div", { style: "margin-top:16px;display:flex;justify-content:flex-end" }, saveBtn)
      ]));

      if (isAdmin) {
        var auditBox = el("div");
        host.appendChild(el("section.card.glass", { style: "margin-top:14px" }, [
          el("div.card-head", {}, el("h2", { text: "سجل التدقيق" })),
          el("p", {
            style: "color:var(--ink-2);font-size:.84rem;margin-bottom:12px",
            text: "كل عملية بالقسم تُسجَّل هنا ولا يمكن تعديلها ولا حذفها."
          }),
          auditBox
        ]));

        try {
          var a = await api.auth("purchase_audit_list", { p_limit: 120 });
          var rows = a.rows || [];
          var actionLabel = {
            login: "دخول", login_denied: "دخول مرفوض", purchase_post: "ترحيل فاتورة",
            purchase_cancel: "إلغاء فاتورة", supplier_payment: "تسديد مورّد",
            purchase_return: "مرتجع", supplier_create: "مورّد جديد",
            supplier_update: "تعديل مورّد", product_create: "صنف جديد",
            settings_save: "تغيير إعدادات", expense_reverse: "إلغاء مصروف"
          };
          auditBox.appendChild(rows.length ? table([
            { label: "الوقت" }, { label: "الموظف" }, { label: "العملية" }, { label: "التفاصيل" }
          ], rows.map(function (x) {
            var detail = "";
            try {
              var d = x.detail || {};
              detail = [d.number, d.name, d.supplier, d.reason,
              d.total !== undefined ? money(d.total) : null]
                .filter(Boolean).join(" · ");
            } catch (e) { detail = ""; }
            return el("tr", {}, [
              el("td", {}, el("span.num", { text: fmtDateTime(x.at) })),
              el("td", { text: x.actor || "—" }),
              el("td", { text: actionLabel[x.action] || x.action }),
              el("td", { text: detail || "—", style: "color:var(--ink-3);font-size:.8rem" })
            ]);
          })) : emptyState("📋", "السجل فارغ"));
        } catch (e) { auditBox.appendChild(emptyState("📋", "تعذّر تحميل السجل")); }
      }
    }
  };

  /* ======================================================================
     ٩) التنقّل
     ====================================================================== */
  /* short = عنوان الشريط السفلي على الجوال — كلمة واحدة لا تلتف */
  var NAV = [
    { id: "dash", label: "اللوحة", short: "اللوحة", icon: "📊" },
    { id: "buy", label: "فاتورة شراء", short: "شراء", icon: "🛒" },
    { id: "invoices", label: "الفواتير", short: "الفواتير", icon: "🧾" },
    { id: "suppliers", label: "الموردون", short: "الموردون", icon: "🏷️" },
    { id: "shortages", label: "النواقص", short: "النواقص", icon: "⚠️", badge: "open_shortages" },
    { id: "returns", label: "المرتجعات", short: "مرتجع", icon: "↩️" },
    { id: "settings", label: "الإعدادات", short: "إعدادات", icon: "⚙️" }
  ];

  var rendering = false;
  async function go(id) {
    if (rendering) return;
    if (!views[id]) id = "dash";
    S.view = id;
    rendering = true;

    $$("[data-nav]").forEach(function (b) {
      if (b.dataset.nav === id) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    refs.title.textContent = views[id].title;

    var host = el("div.view");
    clear(refs.content).appendChild(host);
    host.style.opacity = "0";

    try {
      await views[id].render(host);
    } catch (e) {
      clear(host);
      host.appendChild(emptyState("⚠️", (e && e.message) || "تعذّر تحميل الشاشة"));
      if (e && e.expired) { rendering = false; lock.show("انتهت الجلسة"); return; }
    }

    if (reduceMotion.matches) host.style.opacity = "1";
    else {
      host.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
        { duration: 260, easing: "cubic-bezier(.32,.72,0,1)", fill: "forwards" });
      host.style.opacity = "1";
    }
    refs.content.scrollTop = 0;
    global.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
    rendering = false;
    idle.reset();
  }

  function paintBadges() {
    $$("[data-badge]").forEach(function (b) {
      var v = S.counters[b.dataset.badge];
      b.textContent = money(v || 0);
      b.hidden = !v;
    });
  }

  async function refreshCounters() {
    try {
      var r = await api.auth("purchase_bootstrap", {});
      S.counters = r.counters || {};
      paintBadges();
    } catch (e) { /* غير حرج */ }
  }
  async function refreshSuppliers() {
    try {
      var r = await api.auth("purchase_bootstrap", {});
      S.suppliers = r.suppliers || [];
      S.counters = r.counters || {};
      paintBadges();
    } catch (e) { }
  }
  async function refreshBootstrap() {
    var r = await api.auth("purchase_bootstrap", {});
    S.settings = r.settings || {};
    S.suppliers = r.suppliers || [];
    S.categories = r.categories || [];
    S.counters = r.counters || {};
    if (r.session) { S.role = r.session.role; }
    paintBadges();
    return r;
  }

  /* ======================================================================
     ١٠) البناء والإقلاع
     ====================================================================== */
  function buildShell() {
    var navBtn = function (n, cls) {
      return el("button." + cls, {
        type: "button", dataset: { nav: n.id },
        "aria-label": n.label,
        onclick: function () { go(n.id); }
      }, [
        el("span.ico", { "aria-hidden": "true", text: n.icon }),
        el("span", { text: cls === "tab" ? (n.short || n.label) : n.label }),
        n.badge ? el("span.nav-badge", { dataset: { badge: n.badge }, hidden: true }) : null
      ]);
    };

    var side = el("nav.side", { "aria-label": "أقسام الشراء" }, [
      el("div.brand", {}, [
        el("div.brand-mark", { "aria-hidden": "true" }, "🛒"),
        el("div", {}, [
          el("div.brand-name", { text: "قسم الشراء" }),
          el("div.brand-sub", { text: "مركز سفيان" })
        ])
      ])
    ]);
    NAV.forEach(function (n) { side.appendChild(navBtn(n, "nav-item")); });

    refs.whoName = el("div.who-name");
    refs.whoRole = el("div.who-role");
    refs.whoAv = el("div.who-av", { "aria-hidden": "true" });
    side.appendChild(el("div.side-foot", {}, [
      el("div.who", {}, [refs.whoAv, el("div", {}, [refs.whoName, refs.whoRole])]),
      el("button.nav-item", {
        type: "button",
        onclick: async function () {
          var ok = await confirmSheet("تسجيل الخروج", "تريد قفل قسم الشراء؟", "خروج");
          if (!ok) return;
          try { await api.call("purchase_logout", { p_token: api.token }); } catch (e) { }
          lock.show("");
        }
      }, [el("span.ico", { "aria-hidden": "true", text: "🔒" }), el("span", { text: "خروج" })])
    ]));

    refs.title = el("h1", { text: "لوحة الشراء" });
    refs.content = el("main.content", { id: "pzContent" });

    var topbar = el("header.topbar", {}, [
      refs.title,
      el("span.topbar-sub", { text: "مركز سفيان للهواتف" })
    ]);

    var tabbar = el("nav.tabbar", { "aria-label": "أقسام الشراء" });
    NAV.forEach(function (n) { tabbar.appendChild(navBtn(n, "tab")); });

    refs.sheetTitle = el("h2");
    refs.sheetBody = el("div.sheet-body");
    refs.sheetFoot = el("div.sheet-foot", { hidden: true });
    refs.sheetClose = el("button.btn.btn-icon.btn-ghost", {
      type: "button", "aria-label": "إغلاق", onclick: function () { sheet.close(); }
    }, "✕");

    var sheetEl = el("div.sheet", {
      id: "pzSheet", role: "dialog", "aria-modal": "true", hidden: true
    }, [
      el("div.grabber", { "aria-hidden": "true" }),
      el("div.sheet-head", {}, [refs.sheetTitle, refs.sheetClose]),
      refs.sheetBody, refs.sheetFoot
    ]);
    var scrimEl = el("div.scrim", { id: "pzScrim", hidden: true });

    refs.toasts = el("div.toasts", { "aria-live": "polite", "aria-atomic": "false" });
    refs.shell = el("div.shell", {}, [side, el("div.main", {}, [topbar, refs.content])]);

    return el("div", {}, [refs.shell, tabbar, scrimEl, sheetEl, refs.toasts, lock.build()]);
  }

  async function boot() {
    try {
      var r = await refreshBootstrap();
      var name = (r.session && r.session.employee) || (S.employee && S.employee.name) || "—";
      var roleLabel = { ADMIN: "مدير عام", MANAGER: "مدير", CASHIER: "كاشير" };
      refs.whoName.textContent = name;
      refs.whoRole.textContent = roleLabel[S.role] || "";
      refs.whoAv.textContent = String(name).trim().charAt(0) || "؟";
      idle.start();
      await go(S.view || "dash");
    } catch (e) {
      if (e && e.expired) lock.show("انتهت الجلسة — أدخل رمزك");
      else { toast((e && e.message) || "تعذّر الإقلاع", "error"); lock.show(""); }
    }
  }

  function init(container) {
    mount = container || document.body;
    document.body.classList.add("pz");
    document.documentElement.setAttribute("lang", "ar");
    document.documentElement.setAttribute("dir", "rtl");

    mount.appendChild(buildShell());
    sheet.init($("#pzSheet"), $("#pzScrim"));

    if (api.load()) { lock.hide(); boot(); }
    else lock.show("");
  }

  global.SoufyanPurchasing = {
    init: init,
    go: go,
    lock: function () { lock.show(""); },
    version: "1.0.0"
  };

  /* إقلاع تلقائي — بلا سكربت مضمّن، حتى تبقى سياسة script-src 'self' سليمة.
     للتحكّم اليدوي (دمج القسم داخل تطبيق أكبر):
       window.SOUFYAN_PURCHASING_MANUAL = true;  ثم  SoufyanPurchasing.init(myContainer) */
  function autoInit() {
    if (global.SOUFYAN_PURCHASING_MANUAL) return;
    init(document.getElementById("soufyan-purchasing") || document.body);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }

})(window);
