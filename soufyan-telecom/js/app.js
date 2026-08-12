/* ============================================================
   مكتب سفيان للاتصالات — منطق الواجهة
   يعتمد على: spring.js (الفيزياء) و glass.js (الزجاج) و data.js (المحتوى)
   ============================================================ */
(function () {
  "use strict";

  var P = window.Physics;
  var S = window.STORE;
  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };
  var fmt = function (n) {
    return Number(n).toLocaleString("en-US");
  };
  var price = function (n) {
    return '<span class="num">' + fmt(n) + "</span> " + S.info.currency;
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var waLink = function (text, idx) {
    var num = S.info.whatsapp[idx || 0];
    return "https://wa.me/" + num + "?text=" + encodeURIComponent(text);
  };

  /* ---------- أيقونات ---------- */
  var ICONS = {
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5.5 5.5 0 0 1 7 0"/><path d="M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r="1.2"/>',
    phone:
      '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10.5 18.5h3"/>',
    headphones:
      '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13.5" width="4.5" height="7" rx="2"/><rect x="17" y="13.5" width="4.5" height="7" rx="2"/>',
    tools:
      '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 21H3l8.2-8.2a4 4 0 0 0 5-5z"/><path d="M6 6l3 3"/>',
    swap: '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    call: '<path d="M5 3h4l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 5.2 2 2 0 0 1 5 3z"/>',
  };
  var svg = function (name, cls) {
    return (
      '<svg class="' +
      (cls || "") +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || "") +
      "</svg>"
    );
  };

  /* ============================================================
     1) شاشة الإقلاع
     ============================================================ */
  function bootDone() {
    var boot = $(".boot");
    if (!boot) return;
    setTimeout(function () {
      boot.classList.add("is-done");
      document.body.classList.add("is-ready");
    }, 420);
  }

  /* ============================================================
     2) الثيم — انتقال دائري بأسلوب آبل
     ============================================================ */
  var THEME_KEY = "sf_theme";
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch (e) {}
    var btn = $("#themeBtn");
    if (btn) {
      btn.innerHTML =
        t === "dark"
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
      btn.setAttribute(
        "aria-label",
        t === "dark" ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي"
      );
    }
  }

  function initTheme() {
    var saved;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {}
    var t =
      saved ||
      (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    applyTheme(t);

    var btn = $("#themeBtn");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      var next =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light"
          : "dark";
      var doc = document.documentElement;
      doc.style.setProperty("--vt-x", e.clientX + "px");
      doc.style.setProperty("--vt-y", e.clientY + "px");
      if (doc.startViewTransition && !P.reduced) {
        doc.classList.add("vt-theme");
        var vt = doc.startViewTransition(function () {
          applyTheme(next);
        });
        vt.finished.finally(function () {
          doc.classList.remove("vt-theme");
        });
      } else {
        applyTheme(next);
      }
    });
  }

  /* ============================================================
     3) شريط التنقّل: تكثّف + إخفاء + مؤشّر نابض + تتبّع الأقسام
     ============================================================ */
  function initNav() {
    var nav = $("#nav");
    var links = $$(".nav__link");
    var pill = $("#navPill");
    var burger = $("#burger");
    var menu = $("#menu");
    var progress = $("#progress");

    /* -- المؤشّر السائل -- */
    var xs = new P.Spring({ preset: "smooth" });
    var ws = new P.Spring({ preset: "smooth" });
    function paintPill() {
      pill.style.transform = "translateX(" + xs.value.toFixed(2) + "px)";
      pill.style.width = Math.max(0, ws.value).toFixed(2) + "px";
    }
    xs.onUpdate = paintPill;
    ws.onUpdate = paintPill;

    function movePill(link, instant) {
      if (!link) return;
      pill.classList.add("is-ready");
      if (instant) {
        xs.jump(link.offsetLeft);
        ws.jump(link.offsetWidth);
      } else {
        xs.to(link.offsetLeft);
        ws.to(link.offsetWidth);
      }
    }

    var activeLink = links[0];
    function setActive(id) {
      var found = null;
      links.forEach(function (l) {
        var on = l.getAttribute("href") === "#" + id;
        l.classList.toggle("is-active", on);
        if (on) found = l;
      });
      $$(".menu__link").forEach(function (l) {
        l.classList.toggle("is-active", l.getAttribute("href") === "#" + id);
      });
      $$(".dock__btn").forEach(function (l) {
        l.classList.toggle("is-active", l.getAttribute("href") === "#" + id);
      });
      if (found) {
        activeLink = found;
        movePill(found);
      }
    }

    links.forEach(function (l) {
      l.addEventListener("pointerenter", function () {
        movePill(l);
      });
      l.addEventListener("pointerleave", function () {
        movePill(activeLink);
      });
    });

    /* -- سلوك التمرير -- */
    var lastY = window.scrollY;
    var ticking = false;
    function onScroll() {
      var y = window.scrollY;
      nav.classList.toggle("is-condensed", y > 40);
      if (!menu.classList.contains("is-open")) {
        nav.classList.toggle("is-hidden", y > lastY + 6 && y > 320);
      }
      lastY = y;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.setProperty("--p", h > 0 ? (y / h).toFixed(4) : 0);
      ticking = false;
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(onScroll);
        }
      },
      { passive: true }
    );
    onScroll();

    /* -- تتبّع القسم الظاهر -- */
    var sections = $$("section[id]");
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) setActive(en.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach(function (s) {
      spy.observe(s);
    });

    /* -- قائمة الجوال -- */
    function toggleMenu(force) {
      var open = force != null ? force : !menu.classList.contains("is-open");
      menu.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
    }
    burger.addEventListener("click", function () {
      toggleMenu();
    });
    $$(".menu__link").forEach(function (l) {
      l.addEventListener("click", function () {
        toggleMenu(false);
      });
    });
    document.addEventListener("click", function (e) {
      if (
        menu.classList.contains("is-open") &&
        !menu.contains(e.target) &&
        !burger.contains(e.target)
      )
        toggleMenu(false);
    });
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") toggleMenu(false);
    });

    window.addEventListener("resize", function () {
      movePill(activeLink, true);
    });
    setTimeout(function () {
      movePill(activeLink, true);
    }, 260);
  }

  /* ============================================================
     4) الظهور عند التمرير + العدّادات
     ============================================================ */
  function initReveal() {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    $$(".reveal, .stagger").forEach(function (el, i) {
      if (!el.style.getPropertyValue("--rd"))
        el.style.setProperty("--rd", (i % 6) * 45 + "ms");
      io.observe(el);
    });

    var cio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var el = en.target;
          var to = parseFloat(el.dataset.count);
          var suffix = el.dataset.suffix || "";
          var s = new P.Spring({
            preset: "lazy",
            value: 0,
            restDelta: 0.4,
            onUpdate: function (v) {
              el.textContent = fmt(Math.round(v)) + suffix;
            },
          });
          s.to(to);
          cio.unobserve(el);
        });
      },
      { threshold: 0.6 }
    );
    $$("[data-count]").forEach(function (el) {
      cio.observe(el);
    });
  }

  /* ============================================================
     5) اللوح السفلي (Sheet) بفيزياء السحب
     ============================================================ */
  var Sheet = (function () {
    var sheet, scrim, body, titleEl, foot, grab;
    var openSpring, isOpen = false, height = 0, onCloseCb = null;

    function paint(v) {
      sheet.style.transform = "translate3d(0," + v.toFixed(2) + "%,0)";
      scrim.style.opacity = String(P.clamp(1 - v / 100, 0, 1));
    }

    function ensure() {
      if (sheet) return;
      sheet = $("#sheet");
      scrim = $("#scrim");
      body = $("#sheetBody");
      titleEl = $("#sheetTitle");
      foot = $("#sheetFoot");
      grab = $("#sheetGrab");

      openSpring = new P.Spring({
        preset: "smooth",
        value: 101,
        restDelta: 0.05,
        onUpdate: paint,
        onRest: function (v) {
          if (v >= 100) {
            sheet.classList.remove("is-open");
            scrim.classList.remove("is-on");
            document.body.style.overflow = "";
            if (onCloseCb) {
              onCloseCb();
              onCloseCb = null;
            }
          }
        },
      });

      scrim.addEventListener("click", close);
      $("#sheetClose").addEventListener("click", close);
      window.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && isOpen) close();
      });

      /* سحب المقبض: مطّاطية للأعلى وتسليم السرعة عند الإفلات */
      var dragging = false, startY = 0, startVal = 0;
      var tracker = new P.VelocityTracker();

      grab.addEventListener("pointerdown", function (e) {
        dragging = true;
        startY = e.clientY;
        height = sheet.offsetHeight || 1;
        startVal = openSpring.value;
        openSpring.stop();
        tracker.reset();
        grab.setPointerCapture(e.pointerId);
      });
      grab.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var dy = e.clientY - startY;
        var pct = startVal + (dy / height) * 100;
        // مقاومة مطّاطية عند السحب للأعلى فوق الحد
        if (pct < 0) pct = -P.rubberBand(-pct, 40, 0.5);
        tracker.add(pct);
        paint(pct);
        openSpring.value = pct;
      });
      function release(e) {
        if (!dragging) return;
        dragging = false;
        var v = tracker.velocity();
        openSpring.velocity = v;
        // القرار الفيزيائي: الموضع المتوقّع بعد الاندفاع
        var projected = openSpring.value + v * 0.16;
        if (projected > 34) close(v);
        else openSpring.to(0);
      }
      grab.addEventListener("pointerup", release);
      grab.addEventListener("pointercancel", release);
    }

    function open(opts) {
      ensure();
      titleEl.innerHTML = opts.title || "";
      body.innerHTML = opts.body || "";
      foot.innerHTML = opts.foot || "";
      foot.style.display = opts.foot ? "" : "none";
      onCloseCb = opts.onClose || null;
      sheet.classList.add("is-open");
      scrim.classList.add("is-on");
      document.body.style.overflow = "hidden";
      isOpen = true;
      openSpring.velocity = 0;
      openSpring.value = 101;
      openSpring.to(0);
      body.scrollTop = 0;
      if (window.LiquidGlass) LiquidGlass.init(sheet);
      if (opts.onOpen) opts.onOpen(body, foot);
    }

    function close(vel) {
      if (!sheet) return;
      isOpen = false;
      openSpring.to(101, vel ? vel * 0.4 : 0);
    }

    return { open: open, close: close, isOpen: function () { return isOpen; } };
  })();

  /* ============================================================
     6) التنبيهات
     ============================================================ */
  function toast(msg, icon) {
    var wrap = $("#toasts");
    var el = document.createElement("div");
    el.className = "toast glass glass--pill glass--solid";
    el.innerHTML = "<i>" + (icon || "✅") + "</i><span>" + esc(msg) + "</span>";
    wrap.appendChild(el);

    var s = new P.Spring({
      preset: "bouncy",
      value: 0,
      onUpdate: function (v) {
        el.style.opacity = String(P.clamp(v, 0, 1));
        el.style.transform =
          "translate3d(0," + ((1 - v) * -18).toFixed(2) + "px,0) scale(" +
          (0.86 + v * 0.14).toFixed(3) + ")";
      },
    });
    s.to(1);
    setTimeout(function () {
      var out = new P.Spring({
        preset: "snappy",
        value: 1,
        onUpdate: function (v) {
          el.style.opacity = String(P.clamp(v, 0, 1));
          el.style.transform =
            "translate3d(0," + ((1 - v) * -14).toFixed(2) + "px,0) scale(" +
            (0.9 + v * 0.1).toFixed(3) + ")";
        },
        onRest: function () {
          el.remove();
        },
      });
      out.to(0);
    }, 2600);
  }

  /* ============================================================
     7) السلة
     ============================================================ */
  var CART_KEY = "sf_cart_v2";
  var cart = [];
  try {
    cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch (e) {
    cart = [];
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {}
    paintCartBadge();
  }

  var badgeSpring = null;
  function paintCartBadge() {
    var n = cart.reduce(function (t, i) {
      return t + i.qty;
    }, 0);
    $$(".cart-count").forEach(function (b) {
      b.textContent = n;
      b.classList.toggle("is-on", n > 0);
    });
    var btn = $("#cartBtn");
    if (btn && n > 0 && !P.reduced) {
      if (!badgeSpring)
        badgeSpring = new P.Spring({
          preset: "wobbly",
          value: 1,
          onUpdate: function (v) {
            btn.style.transform = "scale(" + v.toFixed(3) + ")";
          },
        });
      badgeSpring.value = 1.24;
      badgeSpring.velocity = 0;
      badgeSpring.to(1);
    }
  }

  function findItem(id) {
    return S.phones.concat(S.accessories).filter(function (p) {
      return p.id === id;
    })[0];
  }

  function addToCart(id, qty) {
    var item = findItem(id);
    if (!item) return;
    if (!item.stock) {
      toast("هذا المنتج غير متوفر حاليًا", "⚠️");
      return;
    }
    var line = cart.filter(function (c) {
      return c.id === id;
    })[0];
    if (line) line.qty += qty || 1;
    else cart.push({ id: id, name: item.name, price: item.price, qty: qty || 1 });
    saveCart();
    toast("تمت الإضافة: " + item.name, "🛍️");
  }

  function setQty(id, delta) {
    var line = cart.filter(function (c) {
      return c.id === id;
    })[0];
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0)
      cart = cart.filter(function (c) {
        return c.id !== id;
      });
    saveCart();
    renderCartSheet();
  }

  function cartTotal() {
    return cart.reduce(function (t, i) {
      return t + i.price * i.qty;
    }, 0);
  }

  function cartBodyHTML() {
    if (!cart.length)
      return '<div class="empty">السلة فارغة — أضف منتجًا من المتجر لتبدأ طلبك.</div>';
    return cart
      .map(function (i) {
        var item = findItem(i.id) || {};
        return (
          '<div class="line-item">' +
          '<div class="line-item__thumb">' + (item.emoji || "📱") + "</div>" +
          "<div><b>" + esc(i.name) + "</b><span>الكمية " +
          '<span class="num">' + i.qty + "</span> · " +
          '<span class="num">' + fmt(i.price * i.qty) + "</span> " +
          S.info.currency + "</span></div>" +
          '<div class="stepper" data-line="' + i.id + '">' +
          '<button data-d="-1" aria-label="إنقاص">−</button>' +
          "<span>" + i.qty + "</span>" +
          '<button data-d="1" aria-label="زيادة">+</button>' +
          "</div></div>"
        );
      })
      .join("");
  }

  function cartFootHTML() {
    var t = cartTotal();
    return (
      '<div class="total"><span>المجموع</span><b class="num">' +
      fmt(t) + " " + S.info.currency + "</b></div>" +
      '<a class="btn btn--wa btn--lg" id="cartOrder" href="' +
      (cart.length ? waLink(orderMessage()) : "#") +
      '" target="_blank" rel="noopener">إرسال الطلب عبر واتساب</a>' +
      '<button class="btn btn--ghost btn--sm" id="cartClear">تفريغ السلة</button>'
    );
  }

  function orderMessage() {
    var lines = cart.map(function (i, n) {
      return (
        n + 1 + ") " + i.name + " × " + i.qty + " = " + fmt(i.price * i.qty) + " " +
        S.info.currency
      );
    });
    return (
      "السلام عليكم 👋\nأرغب بطلب من " + S.info.name + ":\n\n" +
      lines.join("\n") +
      "\n\nالمجموع: " + fmt(cartTotal()) + " " + S.info.currency +
      "\n\nالاسم:\nالعنوان:\nملاحظات:"
    );
  }

  function renderCartSheet() {
    if (!Sheet.isOpen()) return;
    var body = $("#sheetBody");
    var foot = $("#sheetFoot");
    if (!body || body.dataset.kind !== "cart") return;
    body.innerHTML = cartBodyHTML();
    foot.innerHTML = cartFootHTML();
    bindCartSheet();
  }

  function bindCartSheet() {
    var body = $("#sheetBody");
    body.dataset.kind = "cart";
    $$(".stepper", body).forEach(function (st) {
      st.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        setQty(st.dataset.line, parseInt(b.dataset.d, 10));
      });
    });
    var clear = $("#cartClear");
    if (clear)
      clear.addEventListener("click", function () {
        cart = [];
        saveCart();
        renderCartSheet();
        toast("تم تفريغ السلة", "🧹");
      });
  }

  function openCart() {
    Sheet.open({
      title: "سلة الطلب",
      body: cartBodyHTML(),
      foot: cartFootHTML(),
      onOpen: bindCartSheet,
    });
  }

  /* ============================================================
     8) الخدمات
     ============================================================ */
  function renderServices() {
    var wrap = $("#servicesGrid");
    if (!wrap) return;
    var actions = ["topup", "goto:#plans", "goto:#shop", "cat:chargers", "book", "wa"];
    wrap.innerHTML = S.services
      .map(function (s, i) {
        return (
          '<article class="tile glass glass--interactive" data-tilt="7" data-action="' +
          actions[i] + '" tabindex="0">' +
          '<span class="tile__glow"></span>' +
          '<div class="tile__icon">' + svg(s.icon) + "</div>" +
          "<h3>" + esc(s.title) + "</h3>" +
          "<p>" + esc(s.desc) + "</p>" +
          '<div class="tile__foot">' + esc(s.cta) + svg("arrow") + "</div>" +
          "</article>"
        );
      })
      .join("");

    wrap.addEventListener("click", function (e) {
      var tile = e.target.closest("[data-action]");
      if (!tile) return;
      runAction(tile.dataset.action);
    });
    wrap.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var tile = e.target.closest("[data-action]");
      if (tile) runAction(tile.dataset.action);
    });
  }

  function runAction(action) {
    if (action === "topup") return openTopup();
    if (action === "book") return openBooking();
    if (action === "wa")
      return window.open(
        waLink("السلام عليكم، أرغب بالاستفسار عن تحويل الرصيد والبطاقات الرقمية."),
        "_blank"
      );
    if (action.indexOf("goto:") === 0) {
      var t = $(action.slice(5));
      if (t) t.scrollIntoView({ behavior: P.reduced ? "auto" : "smooth" });
      return;
    }
    if (action.indexOf("cat:") === 0) {
      var cat = action.slice(4);
      setCategory(cat);
      var shop = $("#shop");
      if (shop) shop.scrollIntoView({ behavior: P.reduced ? "auto" : "smooth" });
    }
  }

  /* -- لوح شحن الرصيد -- */
  function openTopup() {
    var state = { carrier: S.topups[0].carrier, amount: S.topups[0].amounts[1], phone: "" };
    var bodyHTML =
      '<div class="field"><label>الشبكة</label><div class="chips" id="tpCarriers">' +
      S.topups
        .map(function (c, i) {
          return (
            '<button class="chip' + (i === 0 ? " is-on" : "") +
            '" data-carrier="' + esc(c.carrier) + '">' + esc(c.carrier) + "</button>"
          );
        })
        .join("") +
      "</div></div>" +
      '<div class="field"><label>المبلغ</label><div class="chips" id="tpAmounts"></div></div>' +
      '<div class="field"><label for="tpPhone">رقم الهاتف المراد شحنه</label>' +
      '<input class="input num" id="tpPhone" inputmode="numeric" placeholder="07XXXXXXXXX"></div>' +
      '<p style="font-size:var(--fs-3xs);color:var(--ink-4)">يصلك تأكيد الشحن عبر واتساب خلال دقائق من إرسال الطلب.</p>';

    Sheet.open({
      title: "شحن رصيد فوري",
      body: bodyHTML,
      foot: '<a class="btn btn--wa btn--lg" id="tpSend" href="#" target="_blank" rel="noopener">إرسال طلب الشحن</a>',
      onOpen: function (body, foot) {
        body.dataset.kind = "topup";
        function paintAmounts() {
          var c = S.topups.filter(function (x) {
            return x.carrier === state.carrier;
          })[0];
          $("#tpAmounts").innerHTML = c.amounts
            .map(function (a) {
              return (
                '<button class="chip' + (a === state.amount ? " is-on" : "") +
                '" data-amount="' + a + '"><span class="num">' + fmt(a) + "</span></button>"
              );
            })
            .join("");
        }
        function link() {
          var phone = ($("#tpPhone").value || "").trim();
          return waLink(
            "طلب شحن رصيد 📲\nالشبكة: " + state.carrier +
            "\nالمبلغ: " + fmt(state.amount) + " " + S.info.currency +
            "\nالرقم: " + (phone || "—")
          );
        }
        paintAmounts();
        $("#tpSend").href = link();
        $("#tpCarriers").addEventListener("click", function (e) {
          var b = e.target.closest("[data-carrier]");
          if (!b) return;
          state.carrier = b.dataset.carrier;
          $$("#tpCarriers .chip").forEach(function (x) {
            x.classList.toggle("is-on", x === b);
          });
          state.amount = S.topups.filter(function (x) {
            return x.carrier === state.carrier;
          })[0].amounts[1];
          paintAmounts();
          $("#tpSend").href = link();
        });
        $("#tpAmounts").addEventListener("click", function (e) {
          var b = e.target.closest("[data-amount]");
          if (!b) return;
          state.amount = parseInt(b.dataset.amount, 10);
          $$("#tpAmounts .chip").forEach(function (x) {
            x.classList.toggle("is-on", x === b);
          });
          $("#tpSend").href = link();
        });
        $("#tpPhone").addEventListener("input", function () {
          $("#tpSend").href = link();
        });
      },
    });
  }

  /* -- لوح حجز الصيانة -- */
  function openBooking() {
    Sheet.open({
      title: "حجز موعد صيانة",
      body:
        '<div class="field"><label for="bkName">الاسم</label><input class="input" id="bkName" placeholder="اسمك الكريم"></div>' +
        '<div class="field"><label for="bkDevice">الجهاز</label><input class="input" id="bkDevice" placeholder="مثال: iPhone 13"></div>' +
        '<div class="field"><label for="bkIssue">وصف المشكلة</label><textarea class="input" id="bkIssue" rows="3" placeholder="مثال: الشاشة مكسورة / البطارية تنفد بسرعة"></textarea></div>' +
        '<div class="field"><label for="bkPhone">رقم للتواصل</label><input class="input num" id="bkPhone" inputmode="numeric" placeholder="07XXXXXXXXX"></div>',
      foot: '<a class="btn btn--wa btn--lg" id="bkSend" href="#" target="_blank" rel="noopener">تأكيد الحجز عبر واتساب</a>',
      onOpen: function (body) {
        body.dataset.kind = "book";
        function upd() {
          $("#bkSend").href = waLink(
            "حجز صيانة 🛠️\nالاسم: " + ($("#bkName").value || "—") +
            "\nالجهاز: " + ($("#bkDevice").value || "—") +
            "\nالمشكلة: " + ($("#bkIssue").value || "—") +
            "\nالهاتف: " + ($("#bkPhone").value || "—")
          );
        }
        upd();
        body.addEventListener("input", upd);
      },
    });
  }

  /* ============================================================
     9) الباقات + المفتاح المقسّم
     ============================================================ */
  var planMode = "monthly";
  function renderPlans() {
    var wrap = $("#plansGrid");
    if (!wrap) return;
    wrap.innerHTML = S.plans
      .map(function (p) {
        var val = planMode === "monthly" ? p.monthly : p.yearly;
        var unit = planMode === "monthly" ? "/ شهريًا" : "/ سنويًا";
        return (
          '<article class="plan glass glass--interactive' +
          (p.best ? " plan--best" : "") + '" data-tilt="5">' +
          (p.best ? '<span class="plan__ribbon">الأكثر طلبًا</span>' : "") +
          '<div><div class="plan__size">' + esc(p.size) + "</div>" +
          '<div class="plan__speed">' + esc(p.speed) + "</div></div>" +
          '<div class="plan__price"><b class="num">' + fmt(val) + "</b><span>" +
          S.info.currency + " " + unit + "</span></div>" +
          '<ul class="plan__list">' +
          p.perks.map(function (k) { return "<li>" + esc(k) + "</li>"; }).join("") +
          "</ul>" +
          '<a class="btn ' + (p.best ? "btn--primary" : "") + '" href="' +
          waLink(
            "طلب اشتراك إنترنت 🌐\nالباقة: " + p.size + " — " + p.speed +
            "\nالسعر: " + fmt(val) + " " + S.info.currency + " " + unit +
            "\n\nالاسم:\nالعنوان:"
          ) + '" target="_blank" rel="noopener">اشترك الآن</a>' +
          "</article>"
        );
      })
      .join("");
    if (window.LiquidGlass) LiquidGlass.init(wrap);
  }

  function initSegmented() {
    var seg = $("#planSeg");
    if (!seg) return;
    var thumb = $(".seg__thumb", seg);
    var btns = $$(".seg__btn", seg);
    var xs = new P.Spring({ preset: "snappy" });
    var ws = new P.Spring({ preset: "snappy" });
    function paint() {
      thumb.style.transform = "translateX(" + xs.value.toFixed(2) + "px)";
      thumb.style.width = Math.max(0, ws.value).toFixed(2) + "px";
    }
    xs.onUpdate = paint;
    ws.onUpdate = paint;

    function select(btn, instant) {
      btns.forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      if (instant) {
        xs.jump(btn.offsetLeft);
        ws.jump(btn.offsetWidth);
      } else {
        xs.to(btn.offsetLeft);
        ws.to(btn.offsetWidth);
      }
      planMode = btn.dataset.mode;
      renderPlans();
    }
    seg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg__btn");
      if (b) select(b);
    });
    setTimeout(function () {
      select(btns[0], true);
    }, 120);
    window.addEventListener("resize", function () {
      var cur = btns.filter(function (b) {
        return b.classList.contains("is-active");
      })[0];
      if (cur) select(cur, true);
    });
  }

  /* ============================================================
     10) المتجر
     ============================================================ */
  var shopState = { cat: "all", q: "", sort: "featured" };

  function allItems() {
    return S.phones.concat(S.accessories);
  }

  function cardHTML(p) {
    var tags = "";
    if (!p.stock) tags += '<span class="tag tag--out">نفد</span>';
    else if (p.hot) tags += '<span class="tag tag--hot">الأكثر طلبًا</span>';
    var art = p.cat === "phones"
      ? '<div class="phone-shape" style="--pc1:' + p.hue[0] + ";--pc2:" + p.hue[1] + '"></div>'
      : '<div class="phone-shape" style="--pc1:' + p.hue[0] + ";--pc2:" + p.hue[1] +
        ';width:56%;aspect-ratio:1;border-radius:26%;display:grid;place-items:center;font-size:1.8rem">' +
        (p.emoji || "🎧") + "</div>";
    return (
      '<article class="card glass glass--interactive" data-id="' + p.id + '" tabindex="0">' +
      '<div class="card__media">' + art +
      '<div class="card__tags">' + tags + "</div></div>" +
      '<div class="card__brand">' + esc(p.brand) + "</div>" +
      '<h3 class="card__name">' + esc(p.name) + "</h3>" +
      '<div class="card__spec">' + esc(p.spec || "") + "</div>" +
      '<div class="card__foot"><div class="card__price num">' + fmt(p.price) +
      " <small>" + S.info.currency + "</small></div>" +
      '<button class="card__add" data-add="' + p.id + '" aria-label="أضف إلى السلة">' +
      svg("plus") + "</button></div></article>"
    );
  }

  function renderShop() {
    var grid = $("#shopGrid");
    if (!grid) return;
    var q = shopState.q.trim().toLowerCase();
    var list = allItems().filter(function (p) {
      var okCat = shopState.cat === "all" || p.cat === shopState.cat;
      var okQ =
        !q ||
        p.name.toLowerCase().indexOf(q) > -1 ||
        (p.brand || "").toLowerCase().indexOf(q) > -1 ||
        (p.spec || "").toLowerCase().indexOf(q) > -1;
      return okCat && okQ;
    });

    if (shopState.sort === "low")
      list.sort(function (a, b) { return a.price - b.price; });
    else if (shopState.sort === "high")
      list.sort(function (a, b) { return b.price - a.price; });
    else
      list.sort(function (a, b) {
        return (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || b.price - a.price;
      });

    $("#shopCount").textContent = list.length;
    grid.innerHTML = list.length
      ? list.map(cardHTML).join("")
      : '<div class="empty">ما لكينا نتيجة مطابقة — جرّب كلمة ثانية أو غيّر التصنيف.</div>';
    if (window.LiquidGlass) LiquidGlass.init(grid);
  }

  function setCategory(cat) {
    shopState.cat = cat;
    $$("#shopCats .chip").forEach(function (c) {
      c.classList.toggle("is-on", c.dataset.cat === cat);
      c.setAttribute("aria-pressed", String(c.dataset.cat === cat));
    });
    renderShop();
  }

  function initShop() {
    var cats = $("#shopCats");
    if (!cats) return;
    cats.innerHTML = S.categories
      .map(function (c, i) {
        return (
          '<button class="chip' + (i === 0 ? " is-on" : "") + '" data-cat="' +
          c.id + '" aria-pressed="' + (i === 0) + '">' + esc(c.label) + "</button>"
        );
      })
      .join("");
    cats.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (b) setCategory(b.dataset.cat);
    });

    var search = $("#shopSearch");
    var t;
    search.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        shopState.q = search.value;
        renderShop();
      }, 140);
    });

    $("#shopSort").addEventListener("change", function (e) {
      shopState.sort = e.target.value;
      renderShop();
    });

    var grid = $("#shopGrid");
    grid.addEventListener("click", function (e) {
      var add = e.target.closest("[data-add]");
      if (add) {
        e.stopPropagation();
        addToCart(add.dataset.add, 1);
        return;
      }
      var card = e.target.closest("[data-id]");
      if (card) openDetail(card.dataset.id);
    });
    grid.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var card = e.target.closest("[data-id]");
      if (card) openDetail(card.dataset.id);
    });

    renderShop();
  }

  function openDetail(id) {
    var p = findItem(id);
    if (!p) return;
    var specsHTML = p.specs
      ? '<div class="specs">' +
        Object.keys(p.specs)
          .map(function (k) {
            return (
              '<div class="specs__row"><b>' + esc(k) + "</b><span>" +
              esc(p.specs[k]) + "</span></div>"
            );
          })
          .join("") +
        "</div>"
      : '<div class="specs"><div class="specs__row"><b>الوصف</b><span>' +
        esc(p.spec || "") + "</span></div></div>";

    var colorsHTML = p.colors
      ? '<div class="field"><label>الألوان المتوفرة</label><div class="dots">' +
        p.colors
          .map(function (c) {
            return '<span class="dot" style="background:' + c + '"></span>';
          })
          .join("") +
        "</div></div>"
      : "";

    var art =
      p.cat === "phones"
        ? '<div class="phone-shape" style="--pc1:' + p.hue[0] + ";--pc2:" + p.hue[1] + '"></div>'
        : '<div class="phone-shape" style="--pc1:' + p.hue[0] + ";--pc2:" + p.hue[1] +
          ';width:5.5rem;aspect-ratio:1;border-radius:26%;display:grid;place-items:center;font-size:2rem">' +
          (p.emoji || "🎧") + "</div>";

    Sheet.open({
      title: esc(p.name),
      body:
        '<div class="detail__hero">' + art + "</div>" +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem">' +
        '<div class="card__price num" style="font-size:var(--fs-lg)">' + fmt(p.price) +
        " <small>" + S.info.currency + "</small></div>" +
        (p.stock
          ? '<span class="tag tag--live"><span class="pulse-dot"></span> متوفر بالمكتب</span>'
          : '<span class="tag tag--out">غير متوفر حاليًا</span>') +
        "</div>" +
        specsHTML +
        colorsHTML,
      foot:
        '<button class="btn btn--primary btn--lg" data-add-detail="' + p.id + '">' +
        (p.stock ? "أضف إلى السلة" : "غير متوفر") + "</button>" +
        '<a class="btn btn--wa" href="' +
        waLink("السلام عليكم، أستفسر عن: " + p.name + " — السعر " + fmt(p.price) + " " + S.info.currency) +
        '" target="_blank" rel="noopener">استفسار مباشر عبر واتساب</a>',
      onOpen: function (body, foot) {
        body.dataset.kind = "detail";
        var b = $("[data-add-detail]", foot);
        if (b)
          b.addEventListener("click", function () {
            addToCart(p.id, 1);
            if (p.stock) Sheet.close();
          });
      },
    });
  }

  /* ============================================================
     11) مرشد الاختيار
     ============================================================ */
  function initGuide() {
    var range = $("#gBudget");
    if (!range) return;
    var out = $("#gBudgetOut");
    var prios = new Set();
    var result = $("#gResult");

    function paintRange() {
      var pct =
        ((range.value - range.min) / (range.max - range.min)) * 100;
      range.style.setProperty("--fill", pct + "%");
      out.textContent = fmt(range.value);
    }

    function recommend() {
      var budget = parseInt(range.value, 10);
      var keys = prios.size ? Array.from(prios) : ["gaming", "camera", "battery", "storage"];
      var pool = S.phones.filter(function (p) {
        return p.stock && p.price <= budget;
      });
      if (!pool.length) {
        result.innerHTML =
          '<div style="font-size:2rem">🤔</div><b>ما لكينا جهاز بهذي الميزانية</b>' +
          '<p class="result__why">أقل جهاز متوفر عدنا سعره ' +
          fmt(Math.min.apply(null, S.phones.filter(function (p) { return p.stock; }).map(function (p) { return p.price; }))) +
          " " + S.info.currency + " — أو تواصل ويانا ونلكلك بديل مناسب.</p>";
        return;
      }
      pool.forEach(function (p) {
        p._s =
          keys.reduce(function (t, k) {
            return t + p.score[k];
          }, 0) / keys.length;
      });
      pool.sort(function (a, b) {
        return b._s - a._s || b.price - a.price;
      });
      var best = pool[0];
      var labels = {
        gaming: "أداء الألعاب",
        camera: "الكاميرا",
        battery: "البطارية",
        storage: "التخزين",
      };
      result.innerHTML =
        '<div class="phone-shape" style="--pc1:' + best.hue[0] + ";--pc2:" + best.hue[1] +
        ';width:4.4rem"></div>' +
        "<b>" + esc(best.name) + "</b>" +
        '<div class="card__price num">' + fmt(best.price) + " <small>" + S.info.currency + "</small></div>" +
        '<p class="result__why">اخترناه لأنه الأقوى ضمن ميزانيتك بـ' +
        keys.map(function (k) { return labels[k]; }).join(" و") + ".</p>" +
        '<button class="btn btn--primary btn--sm" data-add="' + best.id + '">أضفه إلى السلة</button>';
      var addBtn = $("[data-add]", result);
      if (addBtn)
        addBtn.addEventListener("click", function () {
          addToCart(best.id, 1);
        });
    }

    range.addEventListener("input", function () {
      paintRange();
      recommend();
    });

    $("#gPrios").addEventListener("click", function (e) {
      var b = e.target.closest("[data-prio]");
      if (!b) return;
      var k = b.dataset.prio;
      if (prios.has(k)) prios.delete(k);
      else prios.add(k);
      b.classList.toggle("is-on", prios.has(k));
      b.setAttribute("aria-pressed", String(prios.has(k)));
      recommend();
    });

    paintRange();
    recommend();
  }

  /* ============================================================
     12) شريط الآراء — سحب بالقصور الذاتي ومطّاطية الحواف
     ============================================================ */
  function initRail() {
    var rail = $("#voicesRail");
    if (!rail) return;
    var track = $(".rail__track", rail);
    track.innerHTML = S.voices
      .map(function (v) {
        return (
          '<article class="voice glass">' +
          '<div class="voice__stars">' + "★".repeat(v.stars) + "☆".repeat(5 - v.stars) + "</div>" +
          "<p>" + esc(v.text) + "</p>" +
          '<div class="voice__who"><span class="voice__ava">' + esc(v.name.charAt(0)) + "</span>" +
          "<div><b>" + esc(v.name) + "</b><span>" + esc(v.role) + "</span></div></div>" +
          "</article>"
        );
      })
      .join("");
    if (window.LiquidGlass) LiquidGlass.init(track);

    var rtl = getComputedStyle(document.documentElement).direction === "rtl";
    var x = 0, motion = null;
    function bounds() {
      var diff = Math.max(0, track.scrollWidth - rail.clientWidth);
      return rtl ? { min: 0, max: diff } : { min: -diff, max: 0 };
    }
    function paint() {
      track.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
    }

    var dragging = false, startX = 0, startVal = 0, moved = 0;
    var tracker = new P.VelocityTracker();

    rail.addEventListener("pointerdown", function (e) {
      if (e.button === 1 || e.button === 2) return;
      dragging = true;
      moved = 0;
      startX = e.clientX;
      startVal = x;
      if (motion) motion.cancel();
      tracker.reset();
      rail.classList.add("is-dragging");
      rail.setPointerCapture(e.pointerId);
    });
    rail.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      moved = Math.abs(dx);
      var b = bounds();
      x = P.rubberClamp(startVal + dx, b.min, b.max, 320);
      tracker.add(x);
      paint();
    });
    function up() {
      if (!dragging) return;
      dragging = false;
      rail.classList.remove("is-dragging");
      var b = bounds();
      motion = P.inertia({
        from: x,
        velocity: tracker.velocity(),
        min: b.min,
        max: b.max,
        onUpdate: function (v) {
          x = v;
          paint();
        },
      });
    }
    rail.addEventListener("pointerup", up);
    rail.addEventListener("pointercancel", up);
    rail.addEventListener("dragstart", function (e) {
      e.preventDefault();
    });

    /* أزرار التنقّل */
    var nudge = new P.Spring({
      preset: "smooth",
      onUpdate: function (v) {
        x = v;
        paint();
      },
    });
    $$("[data-rail]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var dir = parseInt(btn.dataset.rail, 10);
        var step = Math.min(rail.clientWidth * 0.8, 380);
        var b = bounds();
        if (motion) motion.cancel();
        nudge.value = x;
        nudge.velocity = 0;
        nudge.to(P.clamp(x + dir * step * (rtl ? 1 : -1), b.min, b.max));
      });
    });
  }

  /* ============================================================
     13) الأسئلة الشائعة — ارتفاع نابض
     ============================================================ */
  function initFaq() {
    var wrap = $("#faqList");
    if (!wrap) return;
    wrap.innerHTML = S.faq
      .map(function (f, i) {
        return (
          '<div class="faq__item glass glass--thin" data-no-lens>' +
          '<button class="faq__q" aria-expanded="false" aria-controls="faq-' + i + '">' +
          "<span>" + esc(f.q) + '</span><span class="faq__sign"></span></button>' +
          '<div class="faq__a" id="faq-' + i + '"><div>' + esc(f.a) + "</div></div>" +
          "</div>"
        );
      })
      .join("");

    $$(".faq__item", wrap).forEach(function (item) {
      var btn = $(".faq__q", item);
      var panel = $(".faq__a", item);
      var inner = panel.firstElementChild;
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
        var open = item.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", String(open));
        if (open) {
          $$(".faq__item.is-open", wrap).forEach(function (other) {
            if (other !== item) $(".faq__q", other).click();
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
     14) شريط الشعارات + متفرقات
     ============================================================ */
  function initTicker() {
    var track = $("#tickerTrack");
    if (!track) return;
    track.innerHTML += track.innerHTML; // نسخة ثانية لدوران سلس
  }

  function initMisc() {
    var y = $("#year");
    if (y) y.textContent = new Date().getFullYear();

    $("#cartBtn").addEventListener("click", openCart);
    var dockCart = $("#dockCart");
    if (dockCart)
      dockCart.addEventListener("click", function (e) {
        e.preventDefault();
        openCart();
      });
    var topupBtn = $("#topupBtn");
    if (topupBtn) topupBtn.addEventListener("click", openTopup);

    $$("[data-wa]").forEach(function (a) {
      a.href = waLink(a.dataset.wa || "السلام عليكم، أرغب بالاستفسار.");
    });
    $$("[data-tel]").forEach(function (a) {
      a.href = "tel:+964" + a.dataset.tel.replace(/^0/, "");
    });

    paintCartBadge();
  }

  /* ============================================================
     التشغيل
     ============================================================ */
  function start() {
    initTheme();
    renderServices();
    renderPlans();
    initSegmented();
    initShop();
    initGuide();
    initRail();
    initFaq();
    initTicker();
    initNav();
    initReveal();
    initMisc();
    if (window.LiquidGlass) LiquidGlass.init(document);
    bootDone();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
