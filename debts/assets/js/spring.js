/* ============================================================
   spring.js — محرّك الحركة (نوابض قابلة للمقاطعة)
   لا مكتبات خارجية. المعاملان بأسلوب Apple:
     response = سرعة الوصول للهدف بالثواني
     damping  = 1.0 بلا ارتداد | 0.8 ارتداد خفيف (للحركات ذات الزخم)
   ============================================================ */
(function (global) {
  "use strict";

  var motionQuery = global.matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = motionQuery.matches;
  motionQuery.addEventListener("change", function (e) { reduced = e.matches; });

  /* ---------- نابض واحد على قيمة واحدة ----------
     المهم: عند تغيير الهدف أثناء الحركة لا نعيد التشغيل من الصفر،
     بل نكمل من القيمة والسرعة الحاليتين — هذا سرّ قابلية المقاطعة. */
  function Spring(cfg) {
    cfg = cfg || {};
    this.value    = cfg.from || 0;
    this.target   = cfg.to != null ? cfg.to : this.value;
    this.velocity = cfg.velocity || 0;
    this.response = cfg.response != null ? cfg.response : 0.4;
    this.damping  = cfg.damping  != null ? cfg.damping  : 1.0;
    this.onUpdate = cfg.onUpdate || null;
    this.onRest   = cfg.onRest   || null;
    /* عتبة السكون بمقياس القيمة نفسها:
       نابض بالبكسل يسكن عند نصف بكسل، ونابض تقدّم 0→1 يحتاج عتبة أدقّ.
       عتبة أصغر من اللازم تُبقي الحركة "شغّالة" بعد أن تختفي من العين. */
    this.precision = cfg.precision != null ? cfg.precision : 0.01;

    this._raf = 0;
    this._prev = 0;
    this._running = false;
  }

  Spring.prototype._step = function (now) {
    var self = this;
    if (!this._prev) this._prev = now;

    // نحدّ الخطوة: التبويب المخفي أو التلعثم يعطي dt ضخمًا يفجّر المحاكاة
    var dt = Math.min((now - this._prev) / 1000, 0.064);
    this._prev = now;

    var omega = (2 * Math.PI) / this.response;   // التردد الطبيعي
    var k = omega * omega;                        // الصلابة
    var c = 2 * this.damping * omega;             // التخميد

    // تكامل أويلر شبه الضمني بخطوات ثابتة صغيرة — مستقر عند أي معدل إطارات
    var h = 1 / 240, steps = Math.max(1, Math.ceil(dt / h));
    var sh = dt / steps;
    for (var i = 0; i < steps; i++) {
      var a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * sh;
      this.value    += this.velocity * sh;
    }

    if (this.onUpdate) this.onUpdate(this.value, this.velocity);

    // شرط السكون: قريب من الهدف وبطيء بما يكفي ألا تُرى الحركة
    if (Math.abs(this.value - this.target) < this.precision &&
        Math.abs(this.velocity) < this.precision * 20) {
      this.value = this.target;
      this.velocity = 0;
      if (this.onUpdate) this.onUpdate(this.value, 0);
      this._running = false;
      this._prev = 0;
      if (this.onRest) this.onRest();
      return;
    }
    this._raf = global.requestAnimationFrame(function (t) { self._step(t); });
  };

  Spring.prototype.start = function () {
    if (this._running) return this;
    this._running = true;
    this._prev = 0;
    var self = this;
    this._raf = global.requestAnimationFrame(function (t) { self._step(t); });
    return this;
  };

  /* إعادة توجيه أثناء الطيران: القيمة والسرعة تُحفظان فلا تحدث قفزة */
  Spring.prototype.setTarget = function (target, velocity) {
    this.target = target;
    if (velocity != null) this.velocity = velocity;
    if (reduced) {                       // حركة أقل: نقفز للهدف مباشرة
      this.value = target; this.velocity = 0;
      if (this.onUpdate) this.onUpdate(this.value, 0);
      if (this.onRest) this.onRest();
      return this;
    }
    return this.start();
  };

  /* إمساك العنصر أثناء الحركة: نوقف النابض ونحتفظ بالسرعة الحالية */
  Spring.prototype.stop = function () {
    if (this._raf) global.cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._running = false;
    this._prev = 0;
    return this;
  };

  Spring.prototype.setValue = function (v, velocity) {
    this.value = v;
    if (velocity != null) this.velocity = velocity;
    if (this.onUpdate) this.onUpdate(this.value, this.velocity);
    return this;
  };

  /* ---------- إسقاط الزخم ----------
     أين ستستقر الحركة لو تركناها تتباطأ؟ (نفس دالة Apple في عيّنة
     Designing Fluid Interfaces — تحلّل أُسّي، وليس v²/2a) */
  function project(velocity, decelerationRate) {
    var d = decelerationRate == null ? 0.998 : decelerationRate;
    return (velocity / 1000) * d / (1 - d);
  }

  /* ---------- الحد المطاطي ----------
     كلما ابتعد المستخدم عن الحد قلّت استجابة العنصر — مقاومة متدرجة
     بدل توقّف صلب يوحي بأن الواجهة تجمّدت */
  function rubberband(overshoot, dimension, constant) {
    var c = constant == null ? 0.55 : constant;
    return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
  }

  /* ---------- متتبّع السرعة ----------
     السرعة اللحظية بين إطارين مليئة بالضجيج؛ نأخذ نافذة قصيرة (~100ms) */
  function VelocityTracker(windowMs) {
    this.samples = [];
    this.window = windowMs || 100;
  }
  VelocityTracker.prototype.add = function (position) {
    var now = performance.now();
    this.samples.push({ p: position, t: now });
    while (this.samples.length > 1 && now - this.samples[0].t > this.window) {
      this.samples.shift();
    }
  };
  VelocityTracker.prototype.velocity = function () {
    if (this.samples.length < 2) return 0;
    var a = this.samples[0], b = this.samples[this.samples.length - 1];
    var dt = (b.t - a.t) / 1000;
    if (dt <= 0) return 0;
    return (b.p - a.p) / dt;                 // بكسل/ثانية
  };
  VelocityTracker.prototype.reset = function () { this.samples.length = 0; };

  /* ---------- ظهور المادة ----------
     الزجاج لا "يتلاشى" بل يتجسّد: الضبابية والحجم والشفافية معًا */
  function materialize(el, opts) {
    opts = opts || {};
    var dir = opts.dir === "out" ? "out" : "in";
    var dist = opts.distance || 0;

    if (reduced) {                            // بديل غير دهليزي: تلاشٍ قصير
      el.style.transform = "";
      el.style.filter = "";
      el.style.opacity = dir === "in" ? "1" : "0";
      if (opts.onRest) opts.onRest();
      return null;
    }

    var s = new Spring({
      from: dir === "in" ? 0 : 1,
      to:   dir === "in" ? 1 : 0,
      velocity: opts.velocity || 0,
      response: opts.response || 0.42,
      damping:  opts.damping  || 1.0,
      onUpdate: function (p) {
        var inv = 1 - p;
        el.style.opacity = String(Math.max(0, Math.min(1, p)));
        el.style.transform = "translate3d(0," + (inv * dist) + "px,0) scale(" + (0.94 + p * 0.06) + ")";
        el.style.filter = inv > 0.005 ? "blur(" + (inv * 8) + "px)" : "";
      },
      onRest: function () {
        el.style.filter = "";
        if (dir === "in") el.style.transform = "";
        if (opts.onRest) opts.onRest();
      }
    });
    return s.start();
  }

  global.SFN = global.SFN || {};
  global.SFN.motion = {
    Spring: Spring,
    VelocityTracker: VelocityTracker,
    project: project,
    rubberband: rubberband,
    materialize: materialize,
    get reduced() { return reduced; }
  };
})(window);
