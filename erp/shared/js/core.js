/* ==========================================================================
   Soufyan ERP — Core runtime (vanilla, no build step, no dependencies)
   يحمَّل قبل أي ملف آخر. كل الأنظمة تشترك بهذه الطبقة.
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP || (global.ERP = {});
  ERP.version = '1.0.0';

  /* ---- DOM helpers ------------------------------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /**
   * el('div.card#id', {attrs}, [children])
   * children: string | Node | array | falsy (ignored)
   */
  function el(spec, attrs, children) {
    var m = /^([a-zA-Z0-9-]+)?((?:[.#][^.#]+)*)$/.exec(spec || 'div');
    var tag = (m && m[1]) || 'div';
    var node = document.createElement(tag);
    if (m && m[2]) {
      m[2].split(/(?=[.#])/).forEach(function (t) {
        if (t[0] === '.') node.classList.add(t.slice(1));
        else if (t[0] === '#') node.id = t.slice(1);
      });
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    append(node, children);
    return node;
  }

  function append(parent, child) {
    if (child === null || child === undefined || child === false) return parent;
    if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return parent; }
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    return parent;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }

  function on(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    return function off() { target.removeEventListener(type, handler, opts); };
  }

  /* ---- Utilities -------------------------------------------------------- */
  function uid(prefix) {
    var rand = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + Date.now().toString(36) + rand;
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 200);
    };
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** Promise with timeout — returns {timedOut:true} instead of rejecting. */
  function withTimeout(promise, ms) {
    var timer;
    return Promise.race([
      promise.then(function (v) { clearTimeout(timer); return { value: v }; },
                   function (e) { clearTimeout(timer); return { error: e }; }),
      new Promise(function (resolve) { timer = setTimeout(function () { resolve({ timedOut: true }); }, ms); })
    ]);
  }

  /* ---- Formatting (ar-IQ, Gregorian, latin digits for scanning) --------- */
  var DATE_FMT = new Intl.DateTimeFormat('ar-IQ-u-nu-latn-ca-gregory', { day: '2-digit', month: 'short', year: 'numeric' });
  var TIME_FMT = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false });
  var SHORT_FMT = new Intl.DateTimeFormat('ar-IQ-u-nu-latn-ca-gregory', { day: '2-digit', month: 'short' });

  var fmt = {
    date: function (ts) { return ts ? DATE_FMT.format(new Date(ts)) : '—'; },
    time: function (ts) { return ts ? TIME_FMT.format(new Date(ts)) : '—'; },
    dateShort: function (ts) { return ts ? SHORT_FMT.format(new Date(ts)) : '—'; },
    dateTime: function (ts) { return ts ? fmt.date(ts) + ' · ' + fmt.time(ts) : '—'; },
    duration: function (ms) {
      if (!ms || ms < 0) return '—';
      var s = Math.round(ms / 1000);
      var m = Math.floor(s / 60);
      var r = s % 60;
      return m + ':' + String(r).padStart(2, '0');
    },
    pct: function (v) { return Math.round(v) + '%'; },
    imei: function (v) { return String(v || '').replace(/\D/g, '').replace(/(.{2})(.{6})(.{6})(.*)/, '$1-$2-$3-$4').replace(/-+$/, ''); }
  };

  /* ---- Tiny event bus --------------------------------------------------- */
  function bus() {
    var map = {};
    return {
      on: function (type, fn) {
        (map[type] || (map[type] = [])).push(fn);
        return function () { map[type] = map[type].filter(function (f) { return f !== fn; }); };
      },
      emit: function (type, payload) { (map[type] || []).forEach(function (fn) { fn(payload); }); }
    };
  }

  /* ---- Theme ------------------------------------------------------------ */
  var theme = {
    KEY: 'erp.theme',
    get: function () {
      try { return localStorage.getItem(theme.KEY) || 'auto'; } catch (e) { return 'auto'; }
    },
    apply: function (value) {
      var root = document.documentElement;
      root.classList.add('theme-switching');
      if (value === 'auto') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', value);
      try { localStorage.setItem(theme.KEY, value); } catch (e) { /* private mode */ }
      // Force a reflow, then restore transitions on the next frame.
      void root.offsetHeight;
      requestAnimationFrame(function () { root.classList.remove('theme-switching'); });
    },
    toggle: function () {
      var current = theme.get();
      var isDark = current === 'dark' ||
        (current === 'auto' && global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
      theme.apply(isDark ? 'light' : 'dark');
      return theme.get();
    },
    init: function () {
      var v = theme.get();
      if (v !== 'auto') document.documentElement.setAttribute('data-theme', v);
    }
  };

  /* ---- Icons (1.5px stroke, currentColor, outline default) -------------- */
  var ICON_PATHS = {
    scan:        '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
    keyboard:    '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/>',
    list:        '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    check:       '<path d="M5 12.5 10 17.5 19 7"/>',
    x:           '<path d="M6 6l12 12M18 6 6 18"/>',
    minus:       '<path d="M5 12h14"/>',
    slash:       '<path d="M5 19 19 5"/><circle cx="12" cy="12" r="9"/>',
    chevron:     '<path d="M9 6l6 6-6 6"/>',
    back:        '<path d="M15 6l-6 6 6 6"/>',
    print:       '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v6H7z"/>',
    history:     '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 5v4h4"/><path d="M12 8v4.5l3 1.8"/>',
    device:      '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 5.5h3"/>',
    display:     '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M9 7h6v10H9z" opacity=".5"/>',
    touch:       '<path d="M9 11V6.5a1.75 1.75 0 1 1 3.5 0V11"/><path d="M12.5 11V9.5a1.5 1.5 0 0 1 3 0V11"/><path d="M15.5 11.5v-1a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L5 15.2a1.6 1.6 0 0 1 2.6-1.9L9 15"/>',
    camera:      '<path d="M4 8.5h3l1.5-2.5h7L17 8.5h3a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 20 18.5H4A1.5 1.5 0 0 1 2.5 17v-7A1.5 1.5 0 0 1 4 8.5Z"/><circle cx="12" cy="13" r="3.4"/>',
    speaker:     '<path d="M5 9.5h3l4.5-3.8v12.6L8 14.5H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"/><path d="M16.5 9.2a4 4 0 0 1 0 5.6M19 6.8a7.5 7.5 0 0 1 0 10.4"/>',
    mic:         '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5"/>',
    battery:     '<rect x="2.5" y="7.5" width="16" height="9" rx="2.5"/><path d="M21 11v2"/><path d="M5.5 10.5h6v3h-6z"/>',
    bolt:        '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    wifi:        '<path d="M2.5 8.8a15 15 0 0 1 19 0M5.8 12.4a10 10 0 0 1 12.4 0M9 15.9a5 5 0 0 1 6 0"/><path d="M12 19.5h.01"/>',
    bluetooth:   '<path d="M8 7.5 16 16l-4 4V4l4 4-8 8.5"/>',
    signal:      '<path d="M4 18v-3M9.3 18v-6M14.7 18v-9M20 18V6"/>',
    nfc:         '<path d="M6 9.5a8 8 0 0 1 0 5M9.5 6.5a13 13 0 0 1 0 11"/><path d="M14 4a19 19 0 0 1 0 16"/><circle cx="4" cy="12" r="1.2"/>',
    gps:         '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v3M12 19.5v3M22.5 12h-3M4.5 12h-3"/>',
    sensor:      '<circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2"/>',
    fingerprint: '<path d="M12 4.5a7.5 7.5 0 0 0-7.5 7.5v2M12 4.5A7.5 7.5 0 0 1 19.5 12v3.5"/><path d="M8 12a4 4 0 0 1 8 0v4M12 12v6.5"/><path d="M5.5 18.5a9 9 0 0 0 1-3"/><path d="M18 19.5a9 9 0 0 0 1-2.5"/>',
    button:      '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M12 9v6M9 12h6"/>',
    vibrate:     '<rect x="8.5" y="4.5" width="7" height="15" rx="2.5"/><path d="M4.5 9v6M2 10.5v3M19.5 9v6M22 10.5v3"/>',
    flash:       '<path d="M13 2.5 6 12h5l-1 9.5L18 11h-5z"/>',
    plug:        '<path d="M9 3v5M15 3v5"/><path d="M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z"/><path d="M12 17v4"/>',
    alert:       '<path d="M12 3.5 21 19.5H3z"/><path d="M12 9.5v4.5M12 17h.01"/>',
    info:        '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
    shield:      '<path d="M12 2.8 20 6v6c0 4.6-3.3 7.9-8 9.2-4.7-1.3-8-4.6-8-9.2V6z"/><path d="m8.8 12 2.3 2.4 4.1-4.6"/>',
    search:      '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    plus:        '<path d="M12 5v14M5 12h14"/>',
    user:        '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    clock:       '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.4 2"/>',
    sun:         '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"/>',
    moon:        '<path d="M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z"/>',
    grid:        '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    doc:         '<path d="M6 2.5h7l5 5v14H6z"/><path d="M13 2.5v5h5"/><path d="M9 13h6M9 17h4"/>',
    save:        '<path d="M4.5 4.5h11l4 4v11h-15z"/><path d="M8 4.5v5h6v-5M8 19.5v-5h8v5"/>',
    play:        '<path d="M7 5.5 19 12 7 18.5z"/>',
    stop:        '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
    trash:       '<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5 7.5 20h9l1-13.5"/>',
    connect:     '<path d="M9.5 14.5 6 18a3.5 3.5 0 0 1-5-5l3.5-3.5"/><path d="M14.5 9.5 18 6a3.5 3.5 0 0 1 5 5l-3.5 3.5"/><path d="M9 15 15 9"/>'
  };

  function icon(name, size, extraClass) {
    var d = ICON_PATHS[name] || ICON_PATHS.info;
    var s = size || 20;
    return '<svg class="ico' + (extraClass ? ' ' + extraClass : '') + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  }

  function iconNode(name, size, extraClass) {
    var wrap = document.createElement('span');
    wrap.className = 'ico-wrap';
    wrap.style.display = 'inline-flex';
    wrap.innerHTML = icon(name, size, extraClass);
    return wrap.firstChild;
  }

  /* ---- Hash router ------------------------------------------------------ */
  function router(routes, opts) {
    var options = opts || {};
    var current = null;

    function parse() {
      var hash = location.hash.replace(/^#\/?/, '');
      var parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
      return parts;
    }

    function resolve() {
      var parts = parse();
      var name = parts[0] || options.fallback || 'home';
      var handler = routes[name] || routes['*'];
      current = { name: name, params: parts.slice(1) };
      if (handler) handler(current.params, current);
    }

    global.addEventListener('hashchange', resolve);
    return {
      start: resolve,
      go: function (path) {
        var next = '#/' + String(path).replace(/^#?\/?/, '');
        if (location.hash === next) resolve(); else location.hash = next;
      },
      current: function () { return current; },
      refresh: resolve
    };
  }

  /* ---- Feature detection ------------------------------------------------ */
  var caps = {
    secure: global.isSecureContext !== false,
    media: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    enumerate: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
    recorder: typeof global.MediaRecorder !== 'undefined',
    audioCtx: !!(global.AudioContext || global.webkitAudioContext),
    battery: typeof navigator.getBattery === 'function',
    vibration: typeof navigator.vibrate === 'function',
    bluetooth: !!navigator.bluetooth,
    nfc: typeof global.NDEFReader !== 'undefined',
    geo: !!navigator.geolocation,
    motion: typeof global.DeviceMotionEvent !== 'undefined',
    orientation: typeof global.DeviceOrientationEvent !== 'undefined',
    barcode: typeof global.BarcodeDetector !== 'undefined',
    webauthn: !!(global.PublicKeyCredential),
    connection: !!(navigator.connection || navigator.mozConnection || navigator.webkitConnection),
    touch: (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in global
  };

  ERP.$ = $;
  ERP.$$ = $$;
  ERP.el = el;
  ERP.append = append;
  ERP.clear = clear;
  ERP.on = on;
  ERP.uid = uid;
  ERP.clamp = clamp;
  ERP.debounce = debounce;
  ERP.sleep = sleep;
  ERP.withTimeout = withTimeout;
  ERP.fmt = fmt;
  ERP.bus = bus;
  ERP.theme = theme;
  ERP.icon = icon;
  ERP.iconNode = iconNode;
  ERP.router = router;
  ERP.caps = caps;

  theme.init();
})(window);
