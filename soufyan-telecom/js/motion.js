/* ============================================================
   إخراج الحركة — GSAP + ScrollTrigger
   المشاهد تُبنى على التمرير كما في صفحات منتجات آبل
   ============================================================ */
(function (global) {
  "use strict";

  var hasGSAP = !!global.gsap;
  var REDUCED = global.Physics ? global.Physics.reduced : false;
  var RTL = getComputedStyle(document.documentElement).direction === "rtl";

  if (!hasGSAP || REDUCED) {
    document.documentElement.classList.add("no-gsap");
  }

  var gsap = global.gsap;
  if (hasGSAP && global.ScrollTrigger) gsap.registerPlugin(global.ScrollTrigger);

  /* ---------- إعدادات مشتركة ---------- */
  var EASE = "power3.out";
  var EASE_SOFT = "power2.out";

  function q(s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  }

  /* ============================================================
     افتتاحية المشهد الأول
     ============================================================ */
  function intro() {
    if (!hasGSAP || REDUCED) return;
    var tl = gsap.timeline({ defaults: { ease: EASE } });

    tl.to(".hero .rise > span", {
      y: 0,
      duration: 1.15,
      stagger: 0.09,
      ease: "expo.out",
    })
      .from(
        ".hero__eyebrow",
        { y: 14, opacity: 0, duration: 0.7 },
        0.15
      )
      .from(
        ".hero__lead",
        { y: 18, opacity: 0, duration: 0.8 },
        0.55
      )
      .from(
        ".hero__acts > *",
        { y: 16, opacity: 0, duration: 0.7, stagger: 0.08 },
        0.68
      )
      .from(
        ".hero__facts .fact",
        { y: 14, opacity: 0, duration: 0.6, stagger: 0.06 },
        0.82
      )
      .from(
        ".phone",
        { y: 60, opacity: 0, scale: 0.94, rotateY: RTL ? -12 : 12, duration: 1.4, ease: "expo.out" },
        0.2
      )
      .from(
        ".chip-float",
        { y: 22, opacity: 0, scale: 0.9, duration: 0.9, stagger: 0.1, ease: "back.out(1.6)" },
        0.9
      )
      .from(".scroll-cue", { opacity: 0, duration: 0.6 }, 1.3);
    return tl;
  }

  /* ============================================================
     الظهور المرتبط بالتمرير
     ============================================================ */
  function reveals(root) {
    if (!hasGSAP || REDUCED) return;
    var items = q("[data-anim]", root || document).filter(function (el) {
      return !el.dataset.animDone;
    });
    items.forEach(function (el) {
      el.dataset.animDone = "1";
      var kind = el.dataset.anim;
      var delay = parseFloat(el.dataset.animDelay || 0);
      var from = { opacity: 0, duration: 0.9, ease: EASE, delay: delay };
      if (kind === "up") from.y = 42;
      if (kind === "scale") {
        from.scale = 0.94;
        from.y = 24;
      }
      if (kind === "side") from.x = RTL ? 46 : -46;

      gsap.from(el, Object.assign(from, {
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      }));
      gsap.set(el, { opacity: 1 });
    });

    /* المجموعات المتتابعة */
    q("[data-stagger]", root || document).forEach(function (wrap) {
      if (wrap.dataset.stagDone) return;
      wrap.dataset.stagDone = "1";
      gsap.from(wrap.children, {
        y: 40,
        opacity: 0,
        duration: 0.85,
        ease: EASE,
        stagger: 0.07,
        scrollTrigger: { trigger: wrap, start: "top 86%", once: true },
      });
    });
  }

  /* ============================================================
     مشاهد مرتبطة بالتمرير
     ============================================================ */
  function scenes() {
    if (!hasGSAP || !global.ScrollTrigger) return;

    /* شريط تقدّم القراءة */
    var bar = document.querySelector(".rail-progress");
    if (bar) {
      gsap.to(bar, {
        scaleX: 1,
        ease: "none",
        scrollTrigger: { start: 0, end: "max", scrub: 0.25 },
      });
    }
    if (REDUCED) return;

    /* الجهاز يبتعد ويميل مع النزول */
    var phone = document.querySelector(".phone");
    if (phone) {
      gsap.to(phone, {
        y: -90,
        scale: 0.9,
        rotateX: 9,
        opacity: 0.35,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          scrub: 0.6,
        },
      });
    }

    /* نص المشهد الأول ينسحب أسرع قليلًا */
    var copy = document.querySelector(".hero__copy");
    if (copy) {
      gsap.to(copy, {
        y: -60,
        opacity: 0.2,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero",
          start: "top top",
          end: "bottom 30%",
          scrub: 0.5,
        },
      });
    }

    /* الرقائق العائمة ببارالاكس متفاوت */
    q(".chip-float").forEach(function (el, i) {
      gsap.to(el, {
        y: -(40 + i * 26),
        ease: "none",
        scrollTrigger: {
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          scrub: 0.8,
        },
      });
    });

    /* عناوين الأقسام تكبر قليلًا وهي داخلة */
    q(".scene .display").forEach(function (el) {
      gsap.from(el, {
        scale: 0.965,
        y: 26,
        opacity: 0,
        duration: 1,
        ease: EASE,
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
      });
    });

    /* صفّ المنتجات ينساب أفقيًا مع التمرير */
    var track = document.querySelector("#lineTrack");
    if (track && innerWidth > 720) {
      gsap.fromTo(
        track,
        { x: 0 },
        {
          x: RTL ? 90 : -90,
          ease: "none",
          scrollTrigger: {
            trigger: "#shop",
            start: "top bottom",
            end: "bottom top",
            scrub: 1,
          },
        }
      );
    }
  }

  /* ============================================================
     شريط العلامات اللانهائي
     ============================================================ */
  function marquee(sel, seconds) {
    var track = document.querySelector(sel);
    if (!track) return;
    track.innerHTML += track.innerHTML;
    if (!hasGSAP || REDUCED) return;
    var half = track.scrollWidth / 2;
    gsap.fromTo(
      track,
      { x: 0 },
      {
        x: RTL ? half : -half,
        duration: seconds || 34,
        ease: "none",
        repeat: -1,
      }
    );
  }

  /* ============================================================
     العدّادات
     ============================================================ */
  function counters() {
    q("[data-count]").forEach(function (el) {
      var to = parseFloat(el.dataset.count);
      var suffix = el.dataset.suffix || "";
      if (!hasGSAP || REDUCED) {
        el.textContent = to.toLocaleString("en-US") + suffix;
        return;
      }
      var obj = { v: 0 };
      gsap.to(obj, {
        v: to,
        duration: 1.9,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 92%", once: true },
        onUpdate: function () {
          el.textContent = Math.round(obj.v).toLocaleString("en-US") + suffix;
        },
      });
    });
  }

  /* حركة صغيرة عند فتح الألواح */
  function sheetIn(el) {
    if (!hasGSAP || REDUCED || !el) return;
    gsap.from(el.querySelectorAll(":scope > *"), {
      y: 18,
      opacity: 0,
      duration: 0.55,
      stagger: 0.05,
      ease: EASE_SOFT,
    });
  }

  function refresh() {
    if (hasGSAP && global.ScrollTrigger) global.ScrollTrigger.refresh();
  }

  global.Motion = {
    intro: intro,
    reveals: reveals,
    scenes: scenes,
    marquee: marquee,
    counters: counters,
    sheetIn: sheetIn,
    refresh: refresh,
    has: hasGSAP && !REDUCED,
  };
})(window);
