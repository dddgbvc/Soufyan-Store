/* ============================================================
   Liquid Glass — الطبقة الحيّة
   1) قماشة WebGL: زجاج سائل يتدفّق ويكسر الضوء خلف المشهد الافتتاحي
   2) مرشّحات SVG متحرّكة: انكسار يتنفّس + دمج صمغي لحبّة التنقّل
   3) بريق يجري على السطح ويتبع المؤشّر
   4) ميلان ثلاثي الأبعاد وجذب مغناطيسي بنوابض
   ============================================================ */
(function (global) {
  "use strict";

  var P = global.Physics;
  var REDUCED = P.reduced;
  var FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ============================================================
     1) قماشة الزجاج السائل (WebGL)
     ============================================================ */
  var VERT =
    "attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}";

  var FRAG = [
    "precision highp float;",
    "varying vec2 vUv;",
    "uniform vec2 uRes;",
    "uniform float uT;",
    "uniform vec2 uPtr;",
    "uniform float uPtrOn;",
    "uniform float uScroll;",

    /* خلفية إجرائية: عمق أسود مع بركتي ضوء باردتين */
    "vec3 bg(vec2 uv){",
    "  vec3 base = mix(vec3(0.011,0.013,0.021), vec3(0.0,0.0,0.002), smoothstep(0.0,1.0,uv.y));",
    "  float d1 = length((uv-vec2(0.74,0.30))*vec2(1.5,1.0));",
    "  float d2 = length((uv-vec2(0.22,0.74))*vec2(1.4,1.0));",
    "  float d3 = length((uv-vec2(0.50,1.05))*vec2(1.1,1.0));",
    "  base += vec3(0.020,0.052,0.120) * exp(-d1*d1*6.0);",
    "  base += vec3(0.032,0.024,0.082) * exp(-d2*d2*7.0);",
    "  base += vec3(0.008,0.030,0.062) * exp(-d3*d3*4.0);",
    "  return base;",
    "}",

    /* كتلة ناعمة بمشتقّة تحليلية — لا حاجة لعيّنات إضافية */
    "float blob(vec2 p, vec2 c, float r, inout vec2 grad){",
    "  vec2 d = p - c;",
    "  float k = 1.0/(r*r);",
    "  float w = exp(-dot(d,d)*k);",
    "  grad += -2.0*k*d*w;",
    "  return w;",
    "}",

    "float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }",

    "void main(){",
    "  vec2 uv = vUv;",
    "  vec2 p = (uv - 0.5) * vec2(uRes.x/uRes.y, 1.0);",
    "  float t = uT*0.14 + uScroll*0.6;",
    "  vec2 g = vec2(0.0);",
    "  float f = 0.0;",
    "  f += blob(p, vec2(sin(t*0.71)*0.46, cos(t*0.52)*0.26 + 0.05), 0.54, g);",
    "  f += blob(p, vec2(cos(t*0.43)*0.62 + 0.12, sin(t*0.61)*0.32 - 0.12), 0.46, g);",
    "  f += blob(p, vec2(sin(t*0.31+2.0)*0.52 - 0.22, cos(t*0.37+1.0)*0.42 + 0.18), 0.62, g);",
    "  f += blob(p, vec2(cos(t*0.53+4.0)*0.34, sin(t*0.29+3.0)*0.46), 0.34, g);",
    "  f += blob(p, uPtr, 0.26, g) * uPtrOn;",

    "  float h = smoothstep(0.22, 1.25, f);",
    "  vec3 N = normalize(vec3(-g*0.42, 1.0));",
    "  vec2 refr = N.xy * 0.13 * h;",

    /* تشتّت لوني: كل قناة تنكسر بمقدار مختلف */
    "  vec3 col;",
    "  col.r = bg(uv + refr*1.08).r;",
    "  col.g = bg(uv + refr*1.00).g;",
    "  col.b = bg(uv + refr*0.92).b;",

    "  float fres = pow(1.0 - N.z, 2.6);",
    "  vec3 L = normalize(vec3(0.35, 0.72, 0.6));",
    "  float spec = pow(max(dot(N, L), 0.0), 78.0);",
    "  col += vec3(0.40,0.58,1.0) * fres * 0.085 * h;",
    "  col += vec3(1.0) * spec * 0.20 * h;",
    "  col = mix(bg(uv), col, 0.10 + h*0.9);",

    /* تعتيم الأطراف + تشويش خفيف ضد التحزّم */
    "  float vig = smoothstep(1.25, 0.25, length((uv-0.5)*vec2(1.15,1.0))*1.4);",
    "  col *= 0.34 + 0.66*vig;",
    "  col += (hash(gl_FragCoord.xy + uT) - 0.5) / 220.0;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function initCanvas(canvas) {
    if (!canvas || REDUCED) return null;
    var gl =
      canvas.getContext("webgl", { antialias: false, alpha: false, depth: false }) ||
      canvas.getContext("experimental-webgl");
    if (!gl) return null;

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    var loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, "uRes");
    var uT = gl.getUniformLocation(prog, "uT");
    var uPtr = gl.getUniformLocation(prog, "uPtr");
    var uPtrOn = gl.getUniformLocation(prog, "uPtrOn");
    var uScroll = gl.getUniformLocation(prog, "uScroll");

    var dpr = Math.min(devicePixelRatio || 1, 1.5);
    function resize() {
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, canvas.width, canvas.height);
    }
    resize();
    addEventListener("resize", resize, { passive: true });

    /* المؤشّر يجرّ كتلة زجاج خلفه بنابض */
    var px = new P.Spring({ preset: "gentle", value: 0 });
    var py = new P.Spring({ preset: "gentle", value: 0 });
    var on = new P.Spring({ preset: "smooth", value: 0 });
    var host = canvas.parentElement || canvas;
    host.addEventListener(
      "pointermove",
      function (e) {
        var r = canvas.getBoundingClientRect();
        var ar = r.width / r.height;
        px.to(((e.clientX - r.left) / r.width - 0.5) * ar);
        py.to((e.clientY - r.top) / r.height - 0.5);
        on.to(1);
      },
      { passive: true }
    );
    host.addEventListener("pointerleave", function () {
      on.to(0);
    });

    var visible = true;
    if (global.IntersectionObserver) {
      new IntersectionObserver(
        function (es) {
          visible = es[0].isIntersecting;
        },
        { threshold: 0 }
      ).observe(canvas);
    }

    var scroll = 0;
    addEventListener(
      "scroll",
      function () {
        scroll = scrollY / Math.max(1, innerHeight);
      },
      { passive: true }
    );

    var t0 = performance.now();
    function frame(now) {
      if (visible && !document.hidden) {
        resize();
        gl.uniform1f(uT, (now - t0) / 1000);
        gl.uniform2f(uPtr, px.value, py.value);
        gl.uniform1f(uPtrOn, on.value);
        gl.uniform1f(uScroll, scroll);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    canvas.classList.add("on");
    return gl;
  }

  /* ============================================================
     2) مرشّحات SVG: انكسار يتنفّس + دمج صمغي
     ============================================================ */
  function injectFilters() {
    if (document.getElementById("lgDisplace")) return;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    svg.innerHTML =
      "<defs>" +
      '<filter id="lgDisplace" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">' +
      '<feTurbulence id="lgNoise" type="fractalNoise" baseFrequency="0.0016 0.0038" numOctaves="2" seed="4" result="n"/>' +
      '<feGaussianBlur in="n" stdDeviation="1.4" result="sn"/>' +
      '<feDisplacementMap id="lgMap" in="SourceGraphic" in2="sn" scale="16" xChannelSelector="R" yChannelSelector="G"/>' +
      "</filter>" +
      '<filter id="lgGoo" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/>' +
      '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g"/>' +
      '<feBlend in="SourceGraphic" in2="g"/>' +
      "</filter>" +
      "</defs>";
    document.body.appendChild(svg);

    if (REDUCED) return;
    /* الانكسار يتنفّس: تردّد ومقياس يتحرّكان ببطء عند 12 إطارًا/ثانية */
    var noise = document.getElementById("lgNoise");
    var map = document.getElementById("lgMap");
    var t = 0;
    setInterval(function () {
      if (document.hidden) return;
      t += 0.08;
      var fx = (0.0016 + Math.sin(t * 0.6) * 0.0006).toFixed(5);
      var fy = (0.0038 + Math.cos(t * 0.42) * 0.0011).toFixed(5);
      noise.setAttribute("baseFrequency", fx + " " + fy);
      map.setAttribute("scale", (16 + Math.sin(t * 0.8) * 6).toFixed(2));
    }, 83);
  }

  /* ============================================================
     3) البريق: خصلة ضوء تجري + وميض يتبع المؤشّر
     ============================================================ */
  function bindSpecular(el) {
    if (el.dataset.specBound) return;
    el.dataset.specBound = "1";

    var layer = el.querySelector(":scope > .lg__spec");
    if (!layer) {
      layer = document.createElement("span");
      layer.className = "lg__spec";
      el.prepend(layer);
    }
    if (!FINE || REDUCED) return;

    var pos = new P.Spring2({
      preset: "smooth",
      onUpdate: function (x, y) {
        el.style.setProperty("--mx", x + "%");
        el.style.setProperty("--my", y + "%");
      },
    });
    var sweep = new P.Spring({
      preset: "lazy",
      value: -140,
      onUpdate: function (v) {
        el.style.setProperty("--sweep", v + "%");
      },
    });

    el.addEventListener("pointerenter", function (e) {
      var r = el.getBoundingClientRect();
      pos.jump(
        ((e.clientX - r.left) / r.width) * 100,
        ((e.clientY - r.top) / r.height) * 100
      );
      el.style.setProperty("--spec", "1");
      sweep.jump(-140);
      sweep.to(320);
    });
    el.addEventListener(
      "pointermove",
      function (e) {
        var r = el.getBoundingClientRect();
        pos.to(
          ((e.clientX - r.left) / r.width) * 100,
          ((e.clientY - r.top) / r.height) * 100
        );
      },
      { passive: true }
    );
    el.addEventListener("pointerleave", function () {
      el.style.setProperty("--spec", "0");
    });
  }

  /* بريق دوري تلقائي — يمرّ على شريط التنقّل كل بضع ثوانٍ */
  function ambientSweep(el, every) {
    if (REDUCED || !el) return;
    var s = new P.Spring({
      preset: "lazy",
      value: -140,
      onUpdate: function (v) {
        el.style.setProperty("--sweep", v + "%");
      },
    });
    setInterval(function () {
      if (document.hidden) return;
      el.style.setProperty("--spec", "0.75");
      s.jump(-140);
      s.to(320);
      setTimeout(function () {
        el.style.setProperty("--spec", "0");
      }, 1400);
    }, every || 7000);
  }

  /* ============================================================
     4) الميلان والجذب المغناطيسي
     ============================================================ */
  function bindTilt(el) {
    if (!FINE || REDUCED || el.dataset.tiltBound) return;
    el.dataset.tiltBound = "1";
    var max = parseFloat(el.dataset.tilt) || 7;
    var lift = parseFloat(el.dataset.tiltLift || "8");
    var rx = new P.Spring({ preset: "smooth", onUpdate: apply });
    var ry = new P.Spring({ preset: "smooth", onUpdate: apply });
    var tz = new P.Spring({ preset: "bouncy", onUpdate: apply });

    function apply() {
      el.style.transform =
        "perspective(1000px) rotateX(" + rx.value.toFixed(3) +
        "deg) rotateY(" + ry.value.toFixed(3) +
        "deg) translate3d(0," + (-tz.value).toFixed(2) + "px,0)";
    }
    el.addEventListener("pointerenter", function () {
      tz.to(lift);
    });
    el.addEventListener(
      "pointermove",
      function (e) {
        var r = el.getBoundingClientRect();
        ry.to(((e.clientX - r.left) / r.width - 0.5) * max * 2);
        rx.to(-((e.clientY - r.top) / r.height - 0.5) * max * 2);
      },
      { passive: true }
    );
    el.addEventListener("pointerleave", function () {
      rx.to(0);
      ry.to(0);
      tz.to(0);
    });
  }

  function bindMagnetic(el) {
    if (!FINE || REDUCED || el.dataset.magBound) return;
    el.dataset.magBound = "1";
    var pull = parseFloat(el.dataset.magnetic) || 0.28;
    var radius = parseFloat(el.dataset.magneticRadius || "110");
    var s = new P.Spring2({
      preset: "bouncy",
      onUpdate: function (x, y) {
        el.style.transform = "translate3d(" + x + "px," + y + "px,0)";
      },
    });
    addEventListener(
      "pointermove",
      function (e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) > radius + Math.max(r.width, r.height) / 2) {
          s.to(0, 0);
          return;
        }
        s.to(dx * pull, dy * pull);
      },
      { passive: true }
    );
    el.addEventListener("pointerleave", function () {
      s.to(0, 0);
    });
  }

  /* موجة ضغط سائلة */
  function bindRipple(el) {
    if (el.dataset.rippleBound) return;
    el.dataset.rippleBound = "1";
    el.addEventListener("pointerdown", function (e) {
      if (REDUCED) return;
      var r = el.getBoundingClientRect();
      var d = Math.max(r.width, r.height) * 1.8;
      var span = document.createElement("span");
      span.style.cssText =
        "position:absolute;z-index:0;pointer-events:none;border-radius:50%;overflow:hidden;" +
        "width:" + d + "px;height:" + d + "px;left:" + (e.clientX - r.left - d / 2) +
        "px;top:" + (e.clientY - r.top - d / 2) + "px;" +
        "background:radial-gradient(circle,rgba(255,255,255,.42),transparent 62%);" +
        "transform:scale(.12);opacity:.9;";
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      el.appendChild(span);
      new P.Spring({
        preset: "gentle",
        value: 0.12,
        onUpdate: function (v) {
          span.style.transform = "scale(" + v + ")";
          span.style.opacity = String(Math.max(0, 0.9 * (1 - v)));
        },
        onRest: function () {
          span.remove();
        },
      }).to(1);
    });
  }

  /* ============================================================
     التهيئة
     ============================================================ */
  function init(root) {
    root = root || document;
    injectFilters();
    root.querySelectorAll(".lg:not([data-no-spec])").forEach(bindSpecular);
    root.querySelectorAll("[data-tilt]").forEach(bindTilt);
    root.querySelectorAll("[data-magnetic]").forEach(bindMagnetic);
    root.querySelectorAll("[data-ripple]").forEach(bindRipple);
  }

  global.Liquid = {
    init: init,
    initCanvas: initCanvas,
    ambientSweep: ambientSweep,
    bindSpecular: bindSpecular,
    bindTilt: bindTilt,
  };
})(window);
