/* ============================================================
   مكتب سفيان للاتصالات — منطق الواجهة
   spring.js (فيزياء) · liquid.js (زجاج) · motion.js (GSAP) · data.js (محتوى)
   ============================================================ */
(function () {
  "use strict";

  var P = window.Physics;
  var S = window.STORE;
  var M = window.Motion;

  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };
  var fmt = function (n) {
    return Number(n).toLocaleString("en-US");
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var wa = function (text, i) {
    return (
      "https://wa.me/" + S.info.whatsapp[i || 0] + "?text=" + encodeURIComponent(text)
    );
  };

  /* ---------- الأيقونات (خط موحّد 24×24) ---------- */
  var PATHS = {
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    wifi: '<path d="M5 12.6a10 10 0 0 1 14 0"/><path d="M8.6 16.1a5.4 5.4 0 0 1 6.8 0"/><path d="M1.8 9.1a15 15 0 0 1 20.4 0"/><circle cx="12" cy="19.6" r="1"/>',
    phone: '<rect x="6.5" y="2" width="11" height="20" rx="3"/><path d="M10.6 18.6h2.8"/>',
    headphones:
      '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.6" y="13.4" width="4.4" height="7" rx="2"/><rect x="17" y="13.4" width="4.4" height="7" rx="2"/>',
    tools:
      '<path d="M14.6 6.4a4 4 0 0 0 5 5L21 21H3l8.3-8.3a4 4 0 0 0 5-5z"/><path d="m6 6 3 3"/>',
    swap: '<path d="M4 8.5h13l-3.2-3.2"/><path d="M20 15.5H7l3.2 3.2"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    cart: '<path d="M5.5 6h15l-1.5 8.6a2 2 0 0 1-2 1.6H9.4a2 2 0 0 1-2-1.6L5.4 3.9A1 1 0 0 0 4.4 3H2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>',
    home: '<path d="M4 11 12 4l8 7v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    pin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 1.9"/>',
    call: '<path d="M5 3h4l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 5.2 2 2 0 0 1 5 3z"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
    sun: '<circle cx="12" cy="12" r="4.1"/><path d="M12 2.2v2M12 19.8v2M2.2 12h2M19.8 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h11"/>',
    shield: '<path d="M12 3.2 19 6v6c0 4.3-3 8-7 8.9C8 20 5 16.3 5 12V6z"/>',
    battery:
      '<rect x="2.5" y="7.5" width="16" height="9" rx="2.5"/><path d="M21.5 11v2"/><path d="M6 11v2"/>',
    watch:
      '<rect x="7" y="6.5" width="10" height="11" rx="3"/><path d="M9.5 6.5 9 3h6l-.5 3.5M9.5 17.5 9 21h6l-.5-3.5"/>',
    car: '<path d="M5 16.5h14M4 16.5v-4l2-4.5h12l2 4.5v4"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/>',
    screen: '<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M9 6.5h6"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
    box: '<path d="M20.5 8.2 12 3.5 3.5 8.2v7.6L12 20.5l8.5-4.7z"/><path d="m3.5 8.2 8.5 4.7 8.5-4.7M12 20.5v-7.6"/>',
    truck:
      '<path d="M2.5 6.5h11v10h-11z"/><path d="M13.5 10h4l3 3v3.5h-7z"/><circle cx="6.5" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    spark:
      '<path d="M12 3.2 13.6 9 19.5 10.6 13.6 12.2 12 18 10.4 12.2 4.5 10.6 10.4 9z"/><path d="M18.5 16.5 19.2 19 21.5 19.8 19.2 20.6 18.5 23"/>',
    star: '<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>',
    minus: '<path d="M5.5 12h13"/>',
    game: '<rect x="2.5" y="7.5" width="19" height="9.5" rx="4.5"/><path d="M7 10.8v3.4M5.3 12.5h3.4"/><circle cx="16" cy="11.8" r="1"/><circle cx="18.4" cy="13.8" r="1"/>',
    camera:
      '<path d="M3 8h3.5l1.5-2h8l1.5 2H21v11H3z"/><circle cx="12" cy="13" r="3.6"/>',
    sim: '<path d="M6 3h8l4 4v14H6z"/><rect x="9" y="11" width="6" height="6" rx="1.5"/>',
  };

  function ico(name, cls) {
    return (
      '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + (PATHS[name] || "") + "</svg>"
    );
  }
  function icoFill(name, cls) {
    return (
      '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' +
      (PATHS[name] || "") + "</svg>"
    );
  }

  /* ============================================================
     الثيم
     ============================================================ */
  var THEME_KEY = "sf_theme_v2";
  var updatePill = function () {}; /* يُستبدل داخل initNav */

  function paintThemeBtn(t) {
    var btn = $("#themeBtn");
    if (!btn) return;
    btn.innerHTML = ico(t === "dark" ? "moon" : "sun");
    btn.setAttribute(
      "aria-label",
      t === "dark" ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي"
    );
  }

  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch (e) {}
    paintThemeBtn(t);
  }

  function initTheme() {
    var saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {}
    applyTheme(
      saved || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    );

    var btn = $("#themeBtn");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      var root = document.documentElement;
      var isDark = root.getAttribute("data-theme") === "dark";
      var next = isDark ? "light" : "dark";
      root.style.setProperty("--vtx", e.clientX + "px");
      root.style.setProperty("--vty", e.clientY + "px");

      var swap = function () {
        applyTheme(next);
      };
      if (root.startViewTransition && !P.reduced) {
        root.classList.add("vt");
        root.startViewTransition(swap).finished.finally(function () {
          root.classList.remove("vt");
        });
      } else {
        swap();
      }
      /* بعد تبديل الثيم تتغيّر المقاسات قليلًا — أعِد ضبط الحبّة */
      setTimeout(function () {
        var active = $(".nav__link.on");
        if (active) updatePill(active, true);
      }, 100);
    });
  }

  /* ============================================================
     التنقّل — حبّة سائلة تنضغط وتتمدّد حسب سرعتها
     ============================================================ */
  function initNav() {
    var nav = $("#nav");
    var links = $$(".nav__link");
    var pill = $("#navPill");
    var burger = $("#burger");
    var menu = $("#menu");

    var xs = new P.Spring({ preset: "smooth" });
    var ws = new P.Spring({ preset: "smooth" });

    function paint() {
      /* الانضغاط: كلما زادت السرعة، تمطّطت الحبّة أفقيًا ونحفت رأسيًا */
      var v = Math.abs(xs.velocity);
      var stretch = P.clamp(v / 2600, 0, 0.16);
      pill.style.width = Math.max(0, ws.value).toFixed(2) + "px";
      pill.style.transform =
        "translateX(" + xs.value.toFixed(2) + "px) scale(" +
        (1 + stretch).toFixed(3) + "," + (1 - stretch * 0.75).toFixed(3) + ")";
    }
    xs.onUpdate = paint;
    ws.onUpdate = paint;

    updatePill = function (link, instant) {
      if (!link) return;
      pill.classList.add("ready");
      if (instant) {
        xs.jump(link.offsetLeft);
        ws.jump(link.offsetWidth);
      } else {
        xs.to(link.offsetLeft);
        ws.to(link.offsetWidth);
      }
    };

    var active = links[0];
    function setActive(id) {
      var hit = null;
      links.forEach(function (l) {
        var on = l.getAttribute("href") === "#" + id;
        l.classList.toggle("on", on);
        if (on) hit = l;
      });
      $$(".menu a").forEach(function (l) {
        l.classList.toggle("on", l.getAttribute("href") === "#" + id);
      });
      $$(".dock a").forEach(function (l) {
        l.classList.toggle("on", l.getAttribute("href") === "#" + id);
      });
      if (hit) {
        active = hit;
        updatePill(hit);
      }
    }

    links.forEach(function (l) {
      l.addEventListener("pointerenter", function () {
        updatePill(l);
      });
      l.addEventListener("pointerleave", function () {
        updatePill(active);
      });
    });

    var last = scrollY;
    var busy = false;
    function onScroll() {
      var y = scrollY;
      nav.classList.toggle("tight", y > 40);
      if (!menu.classList.contains("open"))
        nav.classList.toggle("gone", y > last + 8 && y > 340);
      last = y;
      busy = false;
    }
    addEventListener(
      "scroll",
      function () {
        if (!busy) {
          busy = true;
          requestAnimationFrame(onScroll);
        }
      },
      { passive: true }
    );

    var spy = new IntersectionObserver(
      function (es) {
        es.forEach(function (en) {
          if (en.isIntersecting) setActive(en.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    $$("section[id]").forEach(function (s) {
      spy.observe(s);
    });

    function toggleMenu(force) {
      var open = force != null ? force : !menu.classList.contains("open");
      menu.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
    }
    burger.addEventListener("click", function () {
      toggleMenu();
    });
    $$(".menu a").forEach(function (l) {
      l.addEventListener("click", function () {
        toggleMenu(false);
      });
    });
    document.addEventListener("click", function (e) {
      if (menu.classList.contains("open") && !menu.contains(e.target) && !burger.contains(e.target))
        toggleMenu(false);
    });
    addEventListener("keydown", function (e) {
      if (e.key === "Escape") toggleMenu(false);
    });
    addEventListener("resize", function () {
      updatePill(active, true);
    });
    setTimeout(function () {
      updatePill(active, true);
    }, 300);
  }

  /* ============================================================
     اللوح السفلي
     ============================================================ */
  var Sheet = (function () {
    var el, scrim, body, title, foot, grab, spring, open = false, onClose = null;

    function paint(v) {
      el.style.transform = "translate3d(0," + v.toFixed(2) + "%,0)";
      scrim.style.opacity = String(P.clamp(1 - v / 100, 0, 1));
    }

    function build() {
      if (el) return;
      el = $("#sheet");
      scrim = $("#scrim");
      body = $("#sheetBody");
      title = $("#sheetTitle");
      foot = $("#sheetFoot");
      grab = $("#sheetGrab");

      spring = new P.Spring({
        preset: "smooth",
        value: 101,
        restDelta: 0.05,
        onUpdate: paint,
        onRest: function (v) {
          if (v >= 100) {
            el.classList.remove("on");
            scrim.classList.remove("on");
            document.body.style.overflow = "";
            if (onClose) {
              onClose();
              onClose = null;
            }
          }
        },
      });

      scrim.addEventListener("click", close);
      $("#sheetClose").addEventListener("click", close);
      addEventListener("keydown", function (e) {
        if (e.key === "Escape" && open) close();
      });

      var drag = false, y0 = 0, v0 = 0, h = 1;
      var track = new P.VelocityTracker();
      grab.addEventListener("pointerdown", function (e) {
        drag = true;
        y0 = e.clientY;
        h = el.offsetHeight || 1;
        v0 = spring.value;
        spring.stop();
        track.reset();
        grab.setPointerCapture(e.pointerId);
      });
      grab.addEventListener("pointermove", function (e) {
        if (!drag) return;
        var pct = v0 + ((e.clientY - y0) / h) * 100;
        if (pct < 0) pct = -P.rubberBand(-pct, 38, 0.5);
        track.add(pct);
        spring.value = pct;
        paint(pct);
      });
      function up() {
        if (!drag) return;
        drag = false;
        var v = track.velocity();
        spring.velocity = v;
        if (spring.value + v * 0.16 > 32) close(v);
        else spring.to(0);
      }
      grab.addEventListener("pointerup", up);
      grab.addEventListener("pointercancel", up);
    }

    function show(opts) {
      build();
      title.innerHTML = opts.title || "";
      body.innerHTML = opts.body || "";
      body.dataset.kind = opts.kind || "";
      foot.innerHTML = opts.foot || "";
      foot.style.display = opts.foot ? "" : "none";
      onClose = opts.onClose || null;
      el.classList.add("on");
      scrim.classList.add("on");
      document.body.style.overflow = "hidden";
      open = true;
      spring.velocity = 0;
      spring.value = 101;
      spring.to(0);
      body.scrollTop = 0;
      if (window.Liquid) Liquid.init(el);
      if (M) M.sheetIn(body);
      if (opts.onOpen) opts.onOpen(body, foot);
    }

    function close(v) {
      if (!el) return;
      open = false;
      spring.to(101, v ? v * 0.4 : 0);
    }

    return { show: show, close: close, isOpen: function () { return open; } };
  })();

  /* ============================================================
     التنبيهات
     ============================================================ */
  function toast(msg, icon) {
    var el = document.createElement("div");
    el.className = "toast lg lg--pill lg--solid";
    el.innerHTML = ico(icon || "check") + "<span>" + esc(msg) + "</span>";
    $("#toasts").appendChild(el);

    var s = new P.Spring({
      preset: "bouncy",
      value: 0,
      onUpdate: function (v) {
        el.style.opacity = String(P.clamp(v, 0, 1));
        el.style.transform =
          "translate3d(0," + ((1 - v) * -16).toFixed(2) + "px,0) scale(" +
          (0.88 + v * 0.12).toFixed(3) + ")";
      },
    });
    s.to(1);
    setTimeout(function () {
      new P.Spring({
        preset: "snappy",
        value: 1,
        onUpdate: function (v) {
          el.style.opacity = String(P.clamp(v, 0, 1));
          el.style.transform = "translate3d(0," + ((1 - v) * -12).toFixed(2) + "px,0)";
        },
        onRest: function () {
          el.remove();
        },
      }).to(0);
    }, 2500);
  }

  /* ============================================================
     السلة
     ============================================================ */
  var CART_KEY = "sf_cart_v3";
  var cart = [];
  try {
    cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch (e) {}

  var badge = null;
  function paintBadge() {
    var n = cart.reduce(function (t, i) {
      return t + i.qty;
    }, 0);
    $$(".count").forEach(function (b) {
      b.textContent = n;
      b.classList.toggle("on", n > 0);
    });
    var btn = $("#cartBtn");
    if (btn && n > 0 && !P.reduced) {
      if (!badge)
        badge = new P.Spring({
          preset: "wobbly",
          value: 1,
          onUpdate: function (v) {
            btn.style.transform = "scale(" + v.toFixed(3) + ")";
          },
        });
      badge.value = 1.22;
      badge.velocity = 0;
      badge.to(1);
    }
  }
  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {}
    paintBadge();
  }

  function item(id) {
    return S.phones.concat(S.accessories).filter(function (p) {
      return p.id === id;
    })[0];
  }

  function addToCart(id, qty) {
    var it = item(id);
    if (!it) return;
    if (!it.stock) {
      toast("هذا المنتج غير متوفر حاليًا", "close");
      return;
    }
    var line = cart.filter(function (c) {
      return c.id === id;
    })[0];
    if (line) line.qty += qty || 1;
    else cart.push({ id: id, name: it.name, price: it.price, qty: qty || 1 });
    saveCart();
    toast("أُضيف إلى السلة: " + it.name);
  }

  function setQty(id, d) {
    var line = cart.filter(function (c) {
      return c.id === id;
    })[0];
    if (!line) return;
    line.qty += d;
    if (line.qty <= 0)
      cart = cart.filter(function (c) {
        return c.id !== id;
      });
    saveCart();
    renderCart();
  }

  function total() {
    return cart.reduce(function (t, i) {
      return t + i.price * i.qty;
    }, 0);
  }

  function cartBody() {
    if (!cart.length)
      return '<p class="empty">السلة فارغة — أضف منتجًا من المتجر لتبدأ طلبك.</p>';
    return cart
      .map(function (i) {
        var it = item(i.id) || {};
        return (
          '<div class="li">' +
          '<div class="li__art">' + ico(it.icon || "phone") + "</div>" +
          "<div><b>" + esc(i.name) + "</b><span>الكمية " +
          '<span class="n">' + i.qty + '</span> · <span class="n">' +
          fmt(i.price * i.qty) + "</span> " + S.info.currency + "</span></div>" +
          '<div class="stepper" data-line="' + i.id + '">' +
          '<button data-d="-1" aria-label="إنقاص">−</button><span>' + i.qty +
          '</span><button data-d="1" aria-label="زيادة">+</button></div></div>'
        );
      })
      .join("");
  }

  function orderText() {
    return (
      "السلام عليكم 👋\nأرغب بطلب من " + S.info.name + ":\n\n" +
      cart
        .map(function (i, n) {
          return n + 1 + ") " + i.name + " × " + i.qty + " = " + fmt(i.price * i.qty) + " " + S.info.currency;
        })
        .join("\n") +
      "\n\nالمجموع: " + fmt(total()) + " " + S.info.currency +
      "\n\nالاسم:\nالعنوان:\nملاحظات:"
    );
  }

  function cartFoot() {
    return (
      '<div class="total"><span>المجموع</span><b class="n">' + fmt(total()) + " " +
      S.info.currency + "</b></div>" +
      '<a class="btn btn--wa btn--block" href="' + (cart.length ? wa(orderText()) : "#") +
      '" target="_blank" rel="noopener"' + (cart.length ? "" : ' aria-disabled="true"') +
      ">إرسال الطلب عبر واتساب</a>" +
      (cart.length
        ? '<button class="link" id="cartClear" style="justify-self:center">تفريغ السلة</button>'
        : "")
    );
  }

  function bindCart() {
    var body = $("#sheetBody");
    $$(".stepper", body).forEach(function (st) {
      st.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (b) setQty(st.dataset.line, parseInt(b.dataset.d, 10));
      });
    });
    var clr = $("#cartClear");
    if (clr)
      clr.addEventListener("click", function () {
        cart = [];
        saveCart();
        renderCart();
        toast("تم تفريغ السلة");
      });
  }

  function renderCart() {
    if (!Sheet.isOpen() || $("#sheetBody").dataset.kind !== "cart") return;
    $("#sheetBody").innerHTML = cartBody();
    $("#sheetFoot").innerHTML = cartFoot();
    bindCart();
  }

  function openCart() {
    Sheet.show({
      kind: "cart",
      title: "سلة الطلب",
      body: cartBody(),
      foot: cartFoot(),
      onOpen: bindCart,
    });
  }

  /* ============================================================
     الخدمات (بينتو)
     ============================================================ */
  function renderServices() {
    var wrap = $("#bento");
    if (!wrap) return;
    var acts = ["topup", "go:#plans", "go:#shop", "cat:chargers", "book", "wa"];
    var span = ["cell--wide", "", "", "", "", "cell--wide"];
    wrap.innerHTML = S.services
      .map(function (s, i) {
        return (
          '<article class="cell ' + span[i] + '" data-act="' + acts[i] +
          '" data-tilt="5" tabindex="0" role="button">' +
          '<span class="cell__art"></span>' +
          '<span class="cell__ico">' + ico(s.icon) + "</span>" +
          "<h3>" + esc(s.title) + "</h3><p>" + esc(s.desc) + "</p>" +
          '<span class="link">' + esc(s.cta) + ico("left") + "</span></article>"
        );
      })
      .join("");

    wrap.addEventListener("click", function (e) {
      var c = e.target.closest("[data-act]");
      if (c) act(c.dataset.act);
    });
    wrap.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var c = e.target.closest("[data-act]");
      if (c) {
        e.preventDefault();
        act(c.dataset.act);
      }
    });
  }

  function act(a) {
    if (a === "topup") return openTopup();
    if (a === "book") return openBooking();
    if (a === "wa")
      return window.open(wa("السلام عليكم، أستفسر عن تحويل الرصيد والبطاقات الرقمية."), "_blank");
    if (a.indexOf("go:") === 0) {
      var t = $(a.slice(3));
      if (t) t.scrollIntoView({ behavior: P.reduced ? "auto" : "smooth" });
      return;
    }
    if (a.indexOf("cat:") === 0) {
      setCat(a.slice(4));
      var sh = $("#shop");
      if (sh) sh.scrollIntoView({ behavior: P.reduced ? "auto" : "smooth" });
    }
  }

  /* ---------- شحن الرصيد ---------- */
  function openTopup() {
    var st = { carrier: S.topups[0].carrier, amount: S.topups[0].amounts[1] };
    Sheet.show({
      kind: "topup",
      title: "شحن رصيد فوري",
      body:
        '<div class="field"><label>الشبكة</label><div class="pills" id="tpC">' +
        S.topups
          .map(function (c, i) {
            return (
              '<button class="pill' + (i ? "" : " on") + '" data-c="' + esc(c.carrier) +
              '">' + esc(c.carrier) + "</button>"
            );
          })
          .join("") +
        '</div></div><div class="field"><label>المبلغ</label><div class="pills" id="tpA"></div></div>' +
        '<div class="field"><label for="tpP">رقم الهاتف المراد شحنه</label>' +
        '<input class="input n" id="tpP" inputmode="numeric" placeholder="07XXXXXXXXX"></div>' +
        '<p style="font-size:var(--t-caption);color:var(--ink-4)">يصلك تأكيد الشحن على واتساب خلال دقائق.</p>',
      foot: '<a class="btn btn--wa btn--block" id="tpGo" href="#" target="_blank" rel="noopener">إرسال طلب الشحن</a>',
      onOpen: function () {
        function amounts() {
          var c = S.topups.filter(function (x) {
            return x.carrier === st.carrier;
          })[0];
          $("#tpA").innerHTML = c.amounts
            .map(function (a) {
              return (
                '<button class="pill' + (a === st.amount ? " on" : "") + '" data-a="' + a +
                '"><span class="n">' + fmt(a) + "</span></button>"
              );
            })
            .join("");
        }
        function link() {
          $("#tpGo").href = wa(
            "طلب شحن رصيد\nالشبكة: " + st.carrier +
            "\nالمبلغ: " + fmt(st.amount) + " " + S.info.currency +
            "\nالرقم: " + (($("#tpP").value || "").trim() || "—")
          );
        }
        amounts();
        link();
        $("#tpC").addEventListener("click", function (e) {
          var b = e.target.closest("[data-c]");
          if (!b) return;
          st.carrier = b.dataset.c;
          $$("#tpC .pill").forEach(function (x) {
            x.classList.toggle("on", x === b);
          });
          st.amount = S.topups.filter(function (x) {
            return x.carrier === st.carrier;
          })[0].amounts[1];
          amounts();
          link();
        });
        $("#tpA").addEventListener("click", function (e) {
          var b = e.target.closest("[data-a]");
          if (!b) return;
          st.amount = parseInt(b.dataset.a, 10);
          $$("#tpA .pill").forEach(function (x) {
            x.classList.toggle("on", x === b);
          });
          link();
        });
        $("#tpP").addEventListener("input", link);
      },
    });
  }

  /* ---------- حجز صيانة ---------- */
  function openBooking() {
    Sheet.show({
      kind: "book",
      title: "حجز موعد صيانة",
      body:
        '<div class="field"><label for="bN">الاسم</label><input class="input" id="bN" placeholder="اسمك الكريم"></div>' +
        '<div class="field"><label for="bD">الجهاز</label><input class="input" id="bD" placeholder="مثال: iPhone 13"></div>' +
        '<div class="field"><label for="bI">وصف المشكلة</label><textarea class="input" id="bI" rows="3" placeholder="مثال: الشاشة مكسورة"></textarea></div>' +
        '<div class="field"><label for="bP">رقم للتواصل</label><input class="input n" id="bP" inputmode="numeric" placeholder="07XXXXXXXXX"></div>',
      foot: '<a class="btn btn--wa btn--block" id="bGo" href="#" target="_blank" rel="noopener">تأكيد الحجز عبر واتساب</a>',
      onOpen: function (body) {
        function upd() {
          $("#bGo").href = wa(
            "حجز صيانة\nالاسم: " + ($("#bN").value || "—") +
            "\nالجهاز: " + ($("#bD").value || "—") +
            "\nالمشكلة: " + ($("#bI").value || "—") +
            "\nالهاتف: " + ($("#bP").value || "—")
          );
        }
        upd();
        body.addEventListener("input", upd);
      },
    });
  }

  /* ============================================================
     الباقات
     ============================================================ */
  var planMode = "monthly";
  function renderPlans() {
    var wrap = $("#plansGrid");
    if (!wrap) return;
    wrap.innerHTML = S.plans
      .map(function (p) {
        var v = planMode === "monthly" ? p.monthly : p.yearly;
        var unit = planMode === "monthly" ? "شهريًا" : "سنويًا";
        return (
          '<article class="plan' + (p.best ? " plan--pick" : "") + '">' +
          (p.best ? '<span class="plan__flag">الأكثر طلبًا</span>' : "") +
          '<div><div class="plan__size">' + esc(p.size) + '</div>' +
          '<div class="plan__speed">' + esc(p.speed) + "</div></div>" +
          '<div class="plan__cost"><b class="n">' + fmt(v) + "</b><span>" +
          S.info.currency + " / " + unit + "</span></div><ul>" +
          p.perks
            .map(function (k) {
              return "<li>" + ico("check") + "<span>" + esc(k) + "</span></li>";
            })
            .join("") +
          '</ul><a class="btn' + (p.best ? "" : " btn--quiet") + '" href="' +
          wa(
            "طلب اشتراك إنترنت\nالباقة: " + p.size + " — " + p.speed +
            "\nالسعر: " + fmt(v) + " " + S.info.currency + " / " + unit + "\n\nالاسم:\nالعنوان:"
          ) + '" target="_blank" rel="noopener">اشترك الآن</a></article>'
        );
      })
      .join("");
  }

  function initSeg() {
    var seg = $("#seg");
    if (!seg) return;
    var thumb = $(".seg__thumb", seg);
    var btns = $$("button", seg);
    var xs = new P.Spring({ preset: "snappy" });
    var ws = new P.Spring({ preset: "snappy" });
    function paint() {
      var v = Math.abs(xs.velocity);
      var st = P.clamp(v / 3000, 0, 0.12);
      thumb.style.width = Math.max(0, ws.value).toFixed(2) + "px";
      thumb.style.transform =
        "translateX(" + xs.value.toFixed(2) + "px) scaleX(" + (1 + st).toFixed(3) + ")";
    }
    xs.onUpdate = paint;
    ws.onUpdate = paint;

    function pick(b, instant) {
      btns.forEach(function (x) {
        x.classList.toggle("on", x === b);
      });
      if (instant) {
        xs.jump(b.offsetLeft);
        ws.jump(b.offsetWidth);
      } else {
        xs.to(b.offsetLeft);
        ws.to(b.offsetWidth);
      }
      planMode = b.dataset.mode;
      renderPlans();
    }
    seg.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) pick(b);
    });
    setTimeout(function () {
      pick(btns[0], true);
    }, 150);
    addEventListener("resize", function () {
      var cur = btns.filter(function (b) {
        return b.classList.contains("on");
      })[0];
      if (cur) pick(cur, true);
    });
  }

  /* ============================================================
     صفّ قابل للسحب (يُستخدم للمتجر وللآراء)
     ============================================================ */
  function dragRail(rail, track, onTap) {
    var rtl = getComputedStyle(document.documentElement).direction === "rtl";
    var x = 0, motion = null, drag = false, x0 = 0, v0 = 0, moved = 0;
    var vt = new P.VelocityTracker();

    function bounds() {
      var diff = Math.max(0, track.scrollWidth - rail.clientWidth);
      return rtl ? { min: 0, max: diff } : { min: -diff, max: 0 };
    }
    function paint() {
      track.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
    }
    rail.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      drag = true;
      moved = 0;
      x0 = e.clientX;
      v0 = x;
      if (motion) motion.cancel();
      vt.reset();
      rail.classList.add("grabbing");
      rail.setPointerCapture(e.pointerId);
    });
    rail.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - x0;
      moved = Math.max(moved, Math.abs(dx));
      var b = bounds();
      x = P.rubberClamp(v0 + dx, b.min, b.max, 300);
      vt.add(x);
      paint();
    });
    function up(e) {
      if (!drag) return;
      drag = false;
      rail.classList.remove("grabbing");
      var b = bounds();
      motion = P.inertia({
        from: x,
        velocity: vt.velocity(),
        min: b.min,
        max: b.max,
        onUpdate: function (v) {
          x = v;
          paint();
        },
      });
      if (moved < 6 && onTap) onTap(e);
    }
    rail.addEventListener("pointerup", up);
    rail.addEventListener("pointercancel", function () {
      drag = false;
      rail.classList.remove("grabbing");
    });
    rail.addEventListener("dragstart", function (e) {
      e.preventDefault();
    });

    var nudge = new P.Spring({
      preset: "smooth",
      onUpdate: function (v) {
        x = v;
        paint();
      },
    });
    return {
      step: function (dir) {
        var b = bounds();
        var s = Math.min(rail.clientWidth * 0.8, 420);
        if (motion) motion.cancel();
        nudge.value = x;
        nudge.velocity = 0;
        nudge.to(P.clamp(x + dir * s * (rtl ? 1 : -1), b.min, b.max));
      },
      reset: function () {
        if (motion) motion.cancel();
        x = 0;
        paint();
      },
    };
  }

  /* ============================================================
     المتجر
     ============================================================ */
  var shop = { cat: "all", q: "", sort: "featured" };
  var lineRail = null;

  function art(p) {
    if (p.cat === "phones")
      return '<span class="dev" style="--c1:' + p.hue[0] + ";--c2:" + p.hue[1] + '"></span>';
    return (
      '<span class="dev dev--sq" style="--c1:' + p.hue[0] + ";--c2:" + p.hue[1] + '">' +
      ico(p.icon || "box") + "</span>"
    );
  }

  function cardHTML(p) {
    var flag = !p.stock
      ? '<span class="badge badge--out">نفد</span>'
      : p.hot
      ? '<span class="badge badge--new">الأكثر طلبًا</span>'
      : "";
    return (
      '<article class="card" data-id="' + p.id + '" tabindex="0">' +
      '<div class="card__art">' + art(p) + '<div class="card__flags">' + flag + "</div></div>" +
      '<div class="card__brand">' + esc(p.brand) + "</div>" +
      '<h3 class="card__name">' + esc(p.name) + "</h3>" +
      '<div class="card__note">' + esc(p.spec || "") + "</div>" +
      '<div class="card__foot"><div class="card__cost n">' + fmt(p.price) +
      " <small>" + S.info.currency + "</small></div>" +
      '<button class="card__add" data-add="' + p.id + '" aria-label="أضف ' + esc(p.name) + ' إلى السلة">' +
      ico("plus") + "</button></div></article>"
    );
  }

  function renderShop() {
    var track = $("#lineTrack");
    if (!track) return;
    var q = shop.q.trim().toLowerCase();
    var list = S.phones.concat(S.accessories).filter(function (p) {
      var okc = shop.cat === "all" || p.cat === shop.cat;
      var okq =
        !q ||
        p.name.toLowerCase().indexOf(q) > -1 ||
        (p.brand || "").toLowerCase().indexOf(q) > -1 ||
        (p.spec || "").toLowerCase().indexOf(q) > -1;
      return okc && okq;
    });
    if (shop.sort === "low") list.sort(function (a, b) { return a.price - b.price; });
    else if (shop.sort === "high") list.sort(function (a, b) { return b.price - a.price; });
    else
      list.sort(function (a, b) {
        return (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || b.price - a.price;
      });

    $("#shopCount").textContent = list.length;
    track.innerHTML = list.length
      ? list.map(cardHTML).join("")
      : '<p class="empty">ما لكينا نتيجة — جرّب كلمة ثانية أو غيّر التصنيف.</p>';
    if (lineRail) lineRail.reset();
  }

  function setCat(c) {
    shop.cat = c;
    $$("#shopCats .pill").forEach(function (b) {
      var on = b.dataset.cat === c;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    renderShop();
  }

  function initShop() {
    var cats = $("#shopCats");
    if (!cats) return;
    cats.innerHTML = S.categories
      .map(function (c, i) {
        return (
          '<button class="pill' + (i ? "" : " on") + '" data-cat="' + c.id +
          '" aria-pressed="' + (i === 0) + '">' + esc(c.label) + "</button>"
        );
      })
      .join("");
    cats.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (b) setCat(b.dataset.cat);
    });

    var s = $("#shopSearch"), t;
    s.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        shop.q = s.value;
        renderShop();
      }, 130);
    });
    $("#shopSort").addEventListener("change", function (e) {
      shop.sort = e.target.value;
      renderShop();
    });

    renderShop();

    var rail = $("#line"), track = $("#lineTrack");
    lineRail = dragRail(rail, track, function (e) {
      var add = e.target.closest("[data-add]");
      if (add) {
        addToCart(add.dataset.add, 1);
        return;
      }
      var card = e.target.closest("[data-id]");
      if (card) openDetail(card.dataset.id);
    });
    track.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var card = e.target.closest("[data-id]");
      if (card) openDetail(card.dataset.id);
    });
    $$("[data-line]").forEach(function (b) {
      b.addEventListener("click", function () {
        lineRail.step(parseInt(b.dataset.line, 10));
      });
    });
  }

  function openDetail(id) {
    var p = item(id);
    if (!p) return;
    var rows = p.specs
      ? Object.keys(p.specs)
          .map(function (k) {
            return "<div><b>" + esc(k) + "</b><span>" + esc(p.specs[k]) + "</span></div>";
          })
          .join("")
      : "<div><b>الوصف</b><span>" + esc(p.spec || "") + "</span></div>";

    Sheet.show({
      kind: "detail",
      title: esc(p.name),
      body:
        '<div class="hero-art">' + art(p) + "</div>" +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem">' +
        '<div class="card__cost n" style="font-size:var(--t-h3);font-weight:600">' + fmt(p.price) +
        " <small>" + S.info.currency + "</small></div>" +
        (p.stock
          ? '<span class="badge badge--live"><span class="dot"></span>متوفر بالمكتب</span>'
          : '<span class="badge badge--out">غير متوفر</span>') +
        '</div><div class="specs">' + rows + "</div>" +
        (p.colors
          ? '<div class="field"><label>الألوان المتوفرة</label><div class="swatches">' +
            p.colors
              .map(function (c) {
                return '<span class="swatch" style="background:' + c + '"></span>';
              })
              .join("") +
            "</div></div>"
          : ""),
      foot:
        '<button class="btn btn--block" data-buy="' + p.id + '"' +
        (p.stock ? "" : ' aria-disabled="true"') + ">" +
        (p.stock ? "أضف إلى السلة" : "غير متوفر حاليًا") + "</button>" +
        '<a class="btn btn--quiet btn--block" href="' +
        wa("السلام عليكم، أستفسر عن: " + p.name + " — السعر " + fmt(p.price) + " " + S.info.currency) +
        '" target="_blank" rel="noopener">استفسار عبر واتساب</a>',
      onOpen: function (body, foot) {
        var b = $("[data-buy]", foot);
        if (b)
          b.addEventListener("click", function () {
            addToCart(p.id, 1);
            if (p.stock) Sheet.close();
          });
      },
    });
  }

  /* ============================================================
     المرشد
     ============================================================ */
  function initAdvisor() {
    var range = $("#budget");
    if (!range) return;
    var out = $("#budgetOut"), res = $("#verdict"), prios = new Set();

    function paintRange() {
      range.style.setProperty(
        "--fill",
        ((range.value - range.min) / (range.max - range.min)) * 100 + "%"
      );
      out.textContent = fmt(range.value);
    }

    function pick() {
      var budget = parseInt(range.value, 10);
      var keys = prios.size ? Array.from(prios) : ["gaming", "camera", "battery", "storage"];
      var pool = S.phones.filter(function (p) {
        return p.stock && p.price <= budget;
      });
      if (!pool.length) {
        var min = Math.min.apply(
          null,
          S.phones.filter(function (p) { return p.stock; }).map(function (p) { return p.price; })
        );
        res.innerHTML =
          "<b>ما لكينا جهاز بهذي الميزانية</b>" +
          '<p class="verdict__why">أقل جهاز متوفر عدنا سعره <span class="n">' + fmt(min) +
          "</span> " + S.info.currency + " — تواصل ويانا ونلكلك بديل مناسب.</p>";
        return;
      }
      pool.forEach(function (p) {
        p._s = keys.reduce(function (t, k) { return t + p.score[k]; }, 0) / keys.length;
      });
      pool.sort(function (a, b) {
        return b._s - a._s || b.price - a.price;
      });
      var best = pool[0];
      var lbl = { gaming: "الألعاب", camera: "الكاميرا", battery: "البطارية", storage: "التخزين" };
      res.innerHTML =
        art(best) +
        "<b>" + esc(best.name) + "</b>" +
        '<div class="card__cost n">' + fmt(best.price) + " <small>" + S.info.currency + "</small></div>" +
        '<p class="verdict__why">الأقوى ضمن ميزانيتك في ' +
        keys.map(function (k) { return lbl[k]; }).join(" و") + ".</p>" +
        '<button class="btn btn--sm" data-buy>أضفه إلى السلة</button>';
      var b = $("[data-buy]", res);
      if (b)
        b.addEventListener("click", function () {
          addToCart(best.id, 1);
        });
    }

    range.addEventListener("input", function () {
      paintRange();
      pick();
    });
    $("#prios").addEventListener("click", function (e) {
      var b = e.target.closest("[data-p]");
      if (!b) return;
      var k = b.dataset.p;
      prios.has(k) ? prios.delete(k) : prios.add(k);
      b.classList.toggle("on", prios.has(k));
      b.setAttribute("aria-pressed", String(prios.has(k)));
      pick();
    });
    paintRange();
    pick();
  }

  /* ============================================================
     الآراء
     ============================================================ */
  function initVoices() {
    var rail = $("#voicesRail");
    if (!rail) return;
    var track = $(".voices__track", rail);
    track.innerHTML = S.voices
      .map(function (v) {
        var stars = "";
        for (var i = 0; i < v.stars; i++) stars += icoFill("star");
        return (
          '<article class="voice"><div class="voice__stars">' + stars + "</div>" +
          "<p>" + esc(v.text) + "</p>" +
          '<div class="voice__who"><span class="voice__ava">' + esc(v.name.charAt(0)) + "</span>" +
          "<div><b>" + esc(v.name) + "</b><span>" + esc(v.role) + "</span></div></div></article>"
        );
      })
      .join("");
    var r = dragRail(rail, track);
    $$("[data-voice]").forEach(function (b) {
      b.addEventListener("click", function () {
        r.step(parseInt(b.dataset.voice, 10));
      });
    });
  }

  /* ============================================================
     الأسئلة
     ============================================================ */
  function initFaq() {
    var wrap = $("#faqList");
    if (!wrap) return;
    wrap.innerHTML = S.faq
      .map(function (f, i) {
        return (
          '<div class="faq__item"><button class="faq__q" aria-expanded="false" aria-controls="fa' + i + '">' +
          "<span>" + esc(f.q) + '</span><span class="faq__sign"></span></button>' +
          '<div class="faq__a" id="fa' + i + '"><div>' + esc(f.a) + "</div></div></div>"
        );
      })
      .join("");

    $$(".faq__item", wrap).forEach(function (it) {
      var btn = $(".faq__q", it), panel = $(".faq__a", it), inner = panel.firstElementChild;
      var s = new P.Spring({
        preset: "smooth",
        restDelta: 0.5,
        onUpdate: function (v) {
          panel.style.height = Math.max(0, v) + "px";
        },
        onRest: function (v) {
          panel.style.height = v > 0 ? "auto" : "0px";
        },
      });
      btn.addEventListener("click", function () {
        var open = it.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
        if (open) {
          $$(".faq__item.open", wrap).forEach(function (o) {
            if (o !== it) $(".faq__q", o).click();
          });
          s.value = panel.offsetHeight;
          s.to(inner.offsetHeight);
        } else {
          s.value = panel.offsetHeight;
          s.to(0);
        }
      });
    });
  }

  /* ============================================================
     متفرقات
     ============================================================ */
  function initMisc() {
    var y = $("#year");
    if (y) y.textContent = new Date().getFullYear();

    $("#cartBtn").addEventListener("click", openCart);
    var dc = $("#dockCart");
    if (dc)
      dc.addEventListener("click", function (e) {
        e.preventDefault();
        openCart();
      });
    var tb = $("#topupBtn");
    if (tb) tb.addEventListener("click", openTopup);

    $$("[data-wa]").forEach(function (a) {
      a.href = wa(a.dataset.wa || "السلام عليكم، أرغب بالاستفسار.");
    });
    $$("[data-ico]").forEach(function (el) {
      el.innerHTML = ico(el.dataset.ico) + el.innerHTML;
    });
    paintBadge();
  }

  function boot() {
    var b = $(".boot");
    if (!b) return;
    setTimeout(function () {
      b.classList.add("done");
      if (M) M.intro();
    }, 380);
  }

  /* ============================================================
     الإقلاع
     ============================================================ */
  function start() {
    document.documentElement.classList.add("js");
    initTheme();
    renderServices();
    renderPlans();
    initSeg();
    initShop();
    initAdvisor();
    initVoices();
    initFaq();
    initNav();
    initMisc();

    if (window.Liquid) {
      Liquid.init(document);
      Liquid.initCanvas($("#lgCanvas"));
      Liquid.ambientSweep($(".nav__bar"), 7500);
    }
    if (M) {
      M.marquee("#marqTrack", 36);
      M.reveals();
      M.scenes();
      M.counters();
      setTimeout(M.refresh, 600);
    }
    boot();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
