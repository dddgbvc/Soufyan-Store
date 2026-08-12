/* ============================================================
   سلوك الزجاج السائل
   بريق يتبع المؤشّر • ميلان ثلاثي الأبعاد • جذب مغناطيسي • بارالاكس
   كل الحركات مدفوعة بنوابض من Physics
   ============================================================ */
(function (global) {
  "use strict";

  var P = global.Physics;
  var REDUCED = P.reduced;
  var FINE_POINTER = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ------------------------------------------------------------
     1) مرشّح الانكسار: خريطة إزاحة SVG تُحقن مرّة واحدة
     ------------------------------------------------------------ */
  function injectRefractionFilter() {
    if (document.getElementById("liquid-refraction")) return;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    svg.innerHTML =
      '<defs>' +
      '<filter id="liquid-refraction" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.0018 0.0042" numOctaves="2" seed="7" result="noise"/>' +
      '<feGaussianBlur in="noise" stdDeviation="1.6" result="softNoise"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="softNoise" scale="18" xChannelSelector="R" yChannelSelector="G"/>' +
      "</filter>" +
      "</defs>";
    document.body.appendChild(svg);
  }

  /* ------------------------------------------------------------
     2) البريق التخصّصي: وميض وزاوية حافة يتبعان المؤشّر بنابض
     ------------------------------------------------------------ */
  function bindSpecular(el) {
    if (!FINE_POINTER || REDUCED) return;

    var lens = el.querySelector(":scope > .glass__lens");
    if (!lens) {
      lens = document.createElement("span");
      lens.className = "glass__lens";
      el.prepend(lens);
    }

    var pos = new P.Spring2({
      preset: "smooth",
      onUpdate: function (x, y) {
        el.style.setProperty("--mx", x + "%");
        el.style.setProperty("--my", y + "%");
      },
    });
    var sheen = new P.Spring({
      preset: "gentle",
      value: 118,
      onUpdate: function (v) {
        el.style.setProperty("--sheen", v + "deg");
      },
    });

    el.addEventListener("pointerenter", function (e) {
      var r = el.getBoundingClientRect();
      pos.jump(
        ((e.clientX - r.left) / r.width) * 100,
        ((e.clientY - r.top) / r.height) * 100
      );
      el.style.setProperty("--lens-alpha", "1");
    });

    el.addEventListener("pointermove", function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      pos.to(px * 100, py * 100);
      // زاوية الحافة تلاحق اتجاه المؤشّر من المركز — كأن الضوء يلتف
      var ang =
        (Math.atan2(py - 0.5, px - 0.5) * 180) / Math.PI + 90;
      sheen.to(ang);
    });

    el.addEventListener("pointerleave", function () {
      el.style.setProperty("--lens-alpha", "0");
      sheen.to(118);
    });
  }

  /* ------------------------------------------------------------
     3) الميلان الفيزيائي ثلاثي الأبعاد
     ------------------------------------------------------------ */
  function bindTilt(el) {
    if (!FINE_POINTER || REDUCED) return;
    var max = parseFloat(el.dataset.tilt) || 9;
    var lift = parseFloat(el.dataset.tiltLift || "10");

    var rx = new P.Spring({ preset: "smooth", onUpdate: apply });
    var ry = new P.Spring({ preset: "smooth", onUpdate: apply });
    var tz = new P.Spring({ preset: "bouncy", onUpdate: apply });

    function apply() {
      el.style.transform =
        "perspective(900px) rotateX(" +
        rx.value.toFixed(3) +
        "deg) rotateY(" +
        ry.value.toFixed(3) +
        "deg) translate3d(0," +
        (-tz.value).toFixed(2) +
        "px,0) scale(" +
        (1 + tz.value * 0.0035).toFixed(4) +
        ")";
    }

    el.addEventListener("pointerenter", function () {
      tz.to(lift);
    });
    el.addEventListener("pointermove", function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      ry.to(px * max * 2);
      rx.to(-py * max * 2);
    });
    el.addEventListener("pointerleave", function () {
      rx.to(0);
      ry.to(0);
      tz.to(0);
    });
  }

  /* ------------------------------------------------------------
     4) الجذب المغناطيسي للأزرار
     ------------------------------------------------------------ */
  function bindMagnetic(el) {
    if (!FINE_POINTER || REDUCED) return;
    var pull = parseFloat(el.dataset.magnetic) || 0.32;
    var radius = parseFloat(el.dataset.magneticRadius || "120");
    var label = el.querySelector("[data-magnetic-label]");

    var s = new P.Spring2({
      preset: "bouncy",
      onUpdate: function (x, y) {
        el.style.transform = "translate3d(" + x + "px," + y + "px,0)";
        if (label)
          label.style.transform =
            "translate3d(" + x * 0.35 + "px," + y * 0.35 + "px,0)";
      },
    });

    function onMove(e) {
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var dx = e.clientX - cx;
      var dy = e.clientY - cy;
      var dist = Math.hypot(dx, dy);
      if (dist > radius + Math.max(r.width, r.height) / 2) {
        s.to(0, 0);
        return;
      }
      s.to(dx * pull, dy * pull);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", function () {
      s.to(0, 0);
    });
  }

  /* ------------------------------------------------------------
     5) بارالاكس التمرير المخمّد
     ------------------------------------------------------------ */
  var parallaxItems = [];
  function bindParallax(el) {
    if (REDUCED) return;
    parallaxItems.push({
      el: el,
      speed: parseFloat(el.dataset.parallax) || 0.12,
      current: 0,
      target: 0,
      rotate: parseFloat(el.dataset.parallaxRotate || "0"),
    });
  }

  function parallaxTick(dt) {
    if (!parallaxItems.length) return;
    var vh = window.innerHeight;
    for (var i = 0; i < parallaxItems.length; i++) {
      var it = parallaxItems[i];
      var r = it.el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      var center = r.top + r.height / 2 - vh / 2;
      it.target = -center * it.speed;
      it.current = P.damp(it.current, it.target, 0.86, dt);
      it.el.style.transform =
        "translate3d(0," +
        it.current.toFixed(2) +
        "px,0)" +
        (it.rotate
          ? " rotate(" + (it.current * it.rotate * 0.02).toFixed(3) + "deg)"
          : "");
    }
  }

  /* ------------------------------------------------------------
     6) موجة الضغط (Ripple) — استجابة لمسية آبل
     ------------------------------------------------------------ */
  function bindRipple(el) {
    el.addEventListener("pointerdown", function (e) {
      if (REDUCED) return;
      var r = el.getBoundingClientRect();
      var d = Math.max(r.width, r.height) * 1.6;
      var span = document.createElement("span");
      span.style.cssText =
        "position:absolute;z-index:0;pointer-events:none;border-radius:50%;" +
        "width:" + d + "px;height:" + d + "px;" +
        "left:" + (e.clientX - r.left - d / 2) + "px;" +
        "top:" + (e.clientY - r.top - d / 2) + "px;" +
        "background:radial-gradient(circle,rgba(255,255,255,.5),transparent 62%);" +
        "transform:scale(.15);opacity:.85;";
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      el.appendChild(span);
      var s = new P.Spring({
        preset: "gentle",
        value: 0.15,
        onUpdate: function (v) {
          span.style.transform = "scale(" + v + ")";
          span.style.opacity = String(Math.max(0, 0.85 * (1 - v)));
        },
        onRest: function () {
          span.remove();
        },
      });
      s.to(1);
    });
  }

  /* ------------------------------------------------------------
     التهيئة
     ------------------------------------------------------------ */
  function init(root) {
    root = root || document;
    injectRefractionFilter();
    root.querySelectorAll(".glass:not([data-no-lens])").forEach(bindSpecular);
    root.querySelectorAll("[data-tilt]").forEach(bindTilt);
    root.querySelectorAll("[data-magnetic]").forEach(bindMagnetic);
    root.querySelectorAll("[data-parallax]").forEach(bindParallax);
    root.querySelectorAll("[data-ripple]").forEach(bindRipple);
    if (parallaxItems.length) P.Ticker.add(parallaxTick);
  }

  global.LiquidGlass = {
    init: init,
    bindSpecular: bindSpecular,
    bindTilt: bindTilt,
    bindMagnetic: bindMagnetic,
    bindRipple: bindRipple,
  };
})(window);
