/* ============================================================
   محرّك الفيزياء — نوابض حقيقية بأسلوب آبل
   تكامل أويلر شبه الضمني بخطوات ثابتة (1/240 ثانية) للاستقرار.
   لا يعتمد على أي مكتبة خارجية.
   ============================================================ */
(function (global) {
  "use strict";

  var REDUCED = global.matchMedia
    ? global.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  /* ---------- حلقة رسم واحدة لكل الحركات ---------- */
  var Ticker = {
    items: [],
    raf: 0,
    last: 0,
    add: function (fn) {
      if (this.items.indexOf(fn) === -1) this.items.push(fn);
      this.start();
    },
    remove: function (fn) {
      var i = this.items.indexOf(fn);
      if (i > -1) this.items.splice(i, 1);
      if (!this.items.length) this.stop();
    },
    start: function () {
      if (this.raf) return;
      this.last = performance.now();
      var self = this;
      var loop = function (now) {
        // سقف 64 ملي ثانية حتى لا تنفجر المحاكاة بعد تبديل التبويب
        var dt = Math.min((now - self.last) / 1000, 0.064);
        self.last = now;
        for (var i = self.items.length - 1; i >= 0; i--) {
          self.items[i](dt, now);
        }
        self.raf = self.items.length ? requestAnimationFrame(loop) : 0;
      };
      this.raf = requestAnimationFrame(loop);
    },
    stop: function () {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    },
  };

  /* ---------- النابض ---------- */
  var PRESETS = {
    // القيم: صلابة، تخميد، كتلة
    snappy: { stiffness: 320, damping: 30, mass: 1 },
    smooth: { stiffness: 190, damping: 26, mass: 1 },
    gentle: { stiffness: 120, damping: 20, mass: 1 },
    bouncy: { stiffness: 300, damping: 17, mass: 1 },
    wobbly: { stiffness: 210, damping: 12, mass: 1 },
    stiff: { stiffness: 520, damping: 38, mass: 1 },
    lazy: { stiffness: 80, damping: 18, mass: 1.4 },
  };

  function Spring(opts) {
    opts = opts || {};
    var preset = PRESETS[opts.preset || "smooth"];
    this.stiffness = opts.stiffness != null ? opts.stiffness : preset.stiffness;
    this.damping = opts.damping != null ? opts.damping : preset.damping;
    this.mass = opts.mass != null ? opts.mass : preset.mass;
    this.value = opts.value || 0;
    this.target = opts.value || 0;
    this.velocity = opts.velocity || 0;
    this.restDelta = opts.restDelta || 0.01;
    this.restVelocity = opts.restVelocity || 0.05;
    this.onUpdate = opts.onUpdate || null;
    this.onRest = opts.onRest || null;
    this.running = false;

    var self = this;
    this._tick = function (dt) {
      self.step(dt);
    };
  }

  Spring.prototype.step = function (dt) {
    var steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    var h = dt / steps;
    for (var i = 0; i < steps; i++) {
      var f = -this.stiffness * (this.value - this.target);
      var d = -this.damping * this.velocity;
      var a = (f + d) / this.mass;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    if (
      Math.abs(this.velocity) < this.restVelocity &&
      Math.abs(this.value - this.target) < this.restDelta
    ) {
      this.value = this.target;
      this.velocity = 0;
      this._emit();
      this.stop();
      if (this.onRest) this.onRest(this.value);
      return;
    }
    this._emit();
  };

  Spring.prototype._emit = function () {
    if (this.onUpdate) this.onUpdate(this.value, this.velocity);
  };

  /** حرّك النابض نحو قيمة جديدة */
  Spring.prototype.to = function (v, velocityBoost) {
    this.target = v;
    if (velocityBoost) this.velocity += velocityBoost;
    if (REDUCED) {
      this.value = v;
      this.velocity = 0;
      this._emit();
      if (this.onRest) this.onRest(v);
      return this;
    }
    this.start();
    return this;
  };

  /** اقفز فورًا بلا حركة */
  Spring.prototype.jump = function (v) {
    this.value = this.target = v;
    this.velocity = 0;
    this._emit();
    this.stop();
    return this;
  };

  Spring.prototype.start = function () {
    if (this.running) return this;
    this.running = true;
    Ticker.add(this._tick);
    return this;
  };

  Spring.prototype.stop = function () {
    if (!this.running) return this;
    this.running = false;
    Ticker.remove(this._tick);
    return this;
  };

  /* ---------- نابض ثنائي الأبعاد ---------- */
  function Spring2(opts) {
    opts = opts || {};
    var self = this;
    var emit = function () {
      if (self.onUpdate) self.onUpdate(self.x.value, self.y.value);
    };
    this.onUpdate = opts.onUpdate || null;
    var base = {
      preset: opts.preset,
      stiffness: opts.stiffness,
      damping: opts.damping,
      mass: opts.mass,
      onUpdate: emit,
    };
    this.x = new Spring(Object.assign({}, base, { value: opts.x || 0 }));
    this.y = new Spring(Object.assign({}, base, { value: opts.y || 0 }));
  }
  Spring2.prototype.to = function (x, y) {
    this.x.to(x);
    this.y.to(y);
    return this;
  };
  Spring2.prototype.jump = function (x, y) {
    this.x.jump(x);
    this.y.jump(y);
    return this;
  };

  /* ---------- مطّاطية الحواف (معادلة iOS) ---------- */
  function rubberBand(distance, dimension, constant) {
    var c = constant == null ? 0.55 : constant;
    if (!dimension) return 0;
    return (1 - 1 / ((Math.abs(distance) * c) / dimension + 1)) * dimension *
      (distance < 0 ? -1 : 1);
  }

  /** يحصر القيمة داخل المدى مع سماح مطّاطي خارجه */
  function rubberClamp(value, min, max, dimension) {
    if (value < min) return min - rubberBand(min - value, dimension || 260);
    if (value > max) return max + rubberBand(value - max, dimension || 260);
    return value;
  }

  /* ---------- القصور الذاتي (انزلاق بعد رفع الإصبع) ---------- */
  function inertia(opts) {
    var value = opts.from || 0;
    var velocity = opts.velocity || 0;
    var min = opts.min != null ? opts.min : -Infinity;
    var max = opts.max != null ? opts.max : Infinity;
    var power = opts.power || 0.82;
    var onUpdate = opts.onUpdate || function () {};
    var onRest = opts.onRest || function () {};
    var boundarySpring = null;
    var stopped = false;

    function finish() {
      if (stopped) return;
      stopped = true;
      Ticker.remove(tick);
      onRest(value);
    }

    function tick(dt) {
      if (boundarySpring) return;
      velocity *= Math.pow(power, dt * 60);
      value += velocity * dt;

      if (value < min || value > max) {
        var edge = value < min ? min : max;
        // تسليم السرعة إلى نابض يعيدها إلى الحد
        boundarySpring = new Spring({
          preset: "smooth",
          value: value,
          velocity: velocity,
          onUpdate: function (v) {
            value = v;
            onUpdate(v);
          },
          onRest: function () {
            boundarySpring = null;
            finish();
          },
        });
        Ticker.remove(tick);
        boundarySpring.to(edge);
        return;
      }
      onUpdate(value);
      if (Math.abs(velocity) < 8) finish();
    }

    if (REDUCED) {
      value = Math.max(min, Math.min(max, value));
      onUpdate(value);
      onRest(value);
      return { cancel: function () {} };
    }

    Ticker.add(tick);
    return {
      cancel: function () {
        if (boundarySpring) boundarySpring.stop();
        boundarySpring = null;
        finish();
      },
    };
  }

  /* ---------- متتبّع سرعة الإيماءة ---------- */
  function VelocityTracker() {
    this.samples = [];
  }
  VelocityTracker.prototype.add = function (v) {
    var now = performance.now();
    this.samples.push({ v: v, t: now });
    while (this.samples.length > 6) this.samples.shift();
  };
  VelocityTracker.prototype.velocity = function () {
    if (this.samples.length < 2) return 0;
    var a = this.samples[0];
    var b = this.samples[this.samples.length - 1];
    var dt = (b.t - a.t) / 1000;
    if (dt <= 0) return 0;
    return (b.v - a.v) / dt;
  };
  VelocityTracker.prototype.reset = function () {
    this.samples.length = 0;
  };

  /* ---------- أدوات ---------- */
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  /** تنعيم مستقل عن معدّل الإطارات */
  function damp(current, target, smoothing, dt) {
    return lerp(current, target, 1 - Math.pow(smoothing, dt * 60));
  }
  function mapRange(v, inMin, inMax, outMin, outMax) {
    if (inMax === inMin) return outMin;
    return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
  }

  global.Physics = {
    Ticker: Ticker,
    Spring: Spring,
    Spring2: Spring2,
    presets: PRESETS,
    rubberBand: rubberBand,
    rubberClamp: rubberClamp,
    inertia: inertia,
    VelocityTracker: VelocityTracker,
    clamp: clamp,
    lerp: lerp,
    damp: damp,
    mapRange: mapRange,
    reduced: REDUCED,
  };
})(window);
