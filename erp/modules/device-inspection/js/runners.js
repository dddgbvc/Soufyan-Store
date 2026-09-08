/* ==========================================================================
   فحص الجهاز — المشغّلات التفاعلية (Interactive Test Runners)
   كل مشغّل يستخدم واجهات المتصفح الحقيقية، ويعيد دالة تنظيف.
   العقد: run(ctx) → cleanup()
     ctx.mount        عنصر التركيب
     ctx.test         تعريف الاختبار
     ctx.options      خيارات الاختبار
     ctx.device/caps  الجهاز وقدراته
     ctx.setResult(status, {metrics, notes, reason, auto})
     ctx.setMetrics(obj)
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var DI = global.DI;
  var S = DI.catalog.STATUS;
  var el = ERP.el;

  var registry = {};
  function register(name, fn) { registry[name] = fn; }

  /* ---- عناصر مساعدة ------------------------------------------------------ */
  function actions(children) { return el('.runner__actions', {}, children); }

  function button(label, opts) {
    var o = opts || {};
    return el('button.btn' + (o.variant ? '.btn--' + o.variant : '.btn--ghost') + (o.sm ? '.btn--sm' : ''), {
      type: 'button', onclick: o.onClick, disabled: o.disabled || null,
      html: (o.icon ? ERP.icon(o.icon, o.sm ? 15 : 17) : '') + '<span>' + label + '</span>'
    });
  }

  function stat(label, initial) {
    var value = el('.stat__v.mono', { text: initial === undefined ? '—' : String(initial) });
    var node = el('.stat', {}, [el('.stat__k', { text: label }), value]);
    return { node: node, set: function (v) { value.textContent = v === null || v === undefined ? '—' : String(v); }, el: value };
  }

  function statsRow(list) { return el('.runner__stats', {}, list.map(function (s) { return s.node; })); }

  function note(text, tone) {
    return el('.runner__note' + (tone ? '.runner__note--' + tone : ''), {
      html: ERP.icon(tone === 'bad' ? 'alert' : 'info', 15) + '<span>' + text + '</span>'
    });
  }

  function meter(labelText) {
    var fill = el('.meter__fill');
    var node = el('.meter', {}, [el('.meter__label', { text: labelText }), el('.meter__track', {}, [fill])]);
    return {
      node: node,
      set: function (pct, tone) {
        fill.style.width = ERP.clamp(pct, 0, 100) + '%';
        fill.dataset.tone = tone || '';
      }
    };
  }

  function unsupported(ctx, reason) {
    ctx.setResult(S.NOT_SUPPORTED, { reason: reason, auto: true });
    ctx.mount.appendChild(note(reason, 'mute'));
    ctx.mount.appendChild(note('يمكنك تجاوز هذه النتيجة يدويًا من الأزرار بالأسفل إذا فحصت الميزة على الجهاز نفسه.', 'mute'));
    return function () {};
  }

  function mediaBlocked(ctx, err) {
    var map = {
      NotAllowedError: 'تم رفض إذن الوصول — اسمح للمتصفح باستخدام الجهاز ثم أعد المحاولة.',
      NotFoundError: 'لم يُعثر على جهاز إدخال مناسب.',
      NotReadableError: 'الجهاز مشغول من تطبيق آخر — أغلقه ثم أعد المحاولة.',
      OverconstrainedError: 'الإعدادات المطلوبة غير متاحة على هذا الجهاز.',
      SecurityError: 'الوصول محجوب — افتح النظام عبر https أو localhost.'
    };
    return map[err && err.name] || ('تعذّر التشغيل: ' + ((err && err.message) || 'خطأ غير معروف'));
  }

  /* =========================================================================
     1) الشاشة — الألوان والبكسل الميت
     ========================================================================= */
  function fullscreenPanels(ctx, panels, opts) {
    var options = opts || {};
    var index = 0;
    var overlay = el('.fs-panel', { tabindex: '-1', role: 'dialog', 'aria-label': options.label || 'فحص الشاشة' });
    var surface = el('.fs-panel__surface');
    var hud = el('.fs-panel__hud.glass', {}, [
      el('span.fs-panel__step'),
      el('span.micro', { text: 'المس الشاشة للانتقال · Esc للخروج' })
    ]);
    var stepLabel = hud.querySelector('.fs-panel__step');
    overlay.appendChild(surface);
    overlay.appendChild(hud);

    function paint() {
      var p = panels[index];
      surface.style.background = p.css;
      stepLabel.textContent = (index + 1) + '/' + panels.length + ' · ' + p.ar;
      hud.classList.remove('is-fade');
      void hud.offsetWidth;
      hud.classList.add('is-fade');
    }

    function next() {
      index++;
      if (index >= panels.length) { close(true); return; }
      paint();
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); next(); }
    }

    function close(completed) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      if (completed) options.onComplete(index);
    }

    overlay.addEventListener('click', next);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    if (overlay.requestFullscreen) overlay.requestFullscreen().catch(function () {});
    overlay.focus();
    paint();

    return close;
  }

  register('displayColors', function (ctx) {
    var panels = [
      { ar: 'أحمر',  css: '#FF0000' },
      { ar: 'أخضر',  css: '#00FF00' },
      { ar: 'أزرق',  css: '#0000FF' },
      { ar: 'أبيض',  css: '#FFFFFF' },
      { ar: 'أسود',  css: '#000000' },
      { ar: 'رمادي', css: '#808080' }
    ];
    var closer = null;
    var seen = stat('الشاشات المعروضة', '0/' + panels.length);

    ctx.mount.appendChild(note('تُعرض ألوان صافية بملء الشاشة. راقب: نقاط ميتة (سوداء)، نقاط عالقة (ملوّنة)، بقع، أو تفاوت لون.'));
    ctx.mount.appendChild(statsRow([seen]));
    ctx.mount.appendChild(actions([
      button('ابدأ عرض الألوان', {
        variant: 'primary', icon: 'display',
        onClick: function () {
          closer = fullscreenPanels(ctx, panels, {
            label: 'فحص ألوان الشاشة',
            onComplete: function (count) {
              seen.set(panels.length + '/' + panels.length);
              ctx.setMetrics({ panels: panels.length });
              ctx.ask('هل الشاشة نظيفة من النقاط الميتة والبقع؟');
            }
          });
        }
      })
    ]));

    return function () { if (closer) closer(false); };
  });

  register('displayGradient', function (ctx) {
    var panels = [
      { ar: 'تدرّج رمادي', css: 'linear-gradient(90deg,#000,#fff)' },
      { ar: 'درجات', css: 'repeating-linear-gradient(90deg,#000 0 11.1%,#222 0 22.2%,#444 0 33.3%,#666 0 44.4%,#888 0 55.5%,#aaa 0 66.6%,#ccc 0 77.7%,#eee 0 88.8%,#fff 0 100%)' },
      { ar: 'أبيض خافت', css: '#F2F2F2' },
      { ar: 'رمادي داكن', css: '#101010' }
    ];
    var closer = null;
    ctx.mount.appendChild(note('ابحث عن تسرّب الإضاءة من الحواف، أو ظلال ثابتة (Burn-in)، أو تفاوت في درجة البياض.'));
    ctx.mount.appendChild(actions([
      button('ابدأ فحص التدرّج', {
        variant: 'primary', icon: 'display',
        onClick: function () {
          closer = fullscreenPanels(ctx, panels, {
            label: 'فحص تجانس الإضاءة',
            onComplete: function () {
              ctx.setMetrics({ panels: panels.length });
              ctx.ask('هل الإضاءة متجانسة بدون تسرّب أو احتراق؟');
            }
          });
        }
      })
    ]));
    return function () { if (closer) closer(false); };
  });

  /* =========================================================================
     2) اللمس
     ========================================================================= */
  register('touchGrid', function (ctx) {
    var COLS = 10, ROWS = 16;
    var canvas = el('canvas.touch-canvas', { 'aria-label': 'منطقة فحص اللمس' });
    var wrap = el('.touch-wrap', {}, [canvas]);
    var covered = new Uint8Array(COLS * ROWS);
    var count = 0;
    var pct = stat('التغطية', '0%');
    var missed = stat('مربعات ناقصة', String(COLS * ROWS));
    var passedOnce = false;
    var ctx2d = canvas.getContext('2d');
    var cellW = 0, cellH = 0, dpr = Math.min(global.devicePixelRatio || 1, 2);

    function resize() {
      var rect = wrap.getBoundingClientRect();
      var w = Math.max(240, rect.width);
      var h = Math.min(Math.round(w * 1.5), Math.round(global.innerHeight * 0.52));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      cellW = canvas.width / COLS;
      cellH = canvas.height / ROWS;
      draw();
    }

    function draw() {
      var styles = getComputedStyle(document.documentElement);
      var brand = styles.getPropertyValue('--brand-500').trim() || '#5B6EFF';
      var line = styles.getPropertyValue('--border').trim() || 'rgba(0,0,0,.1)';
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var x = c * cellW, y = r * cellH;
          if (covered[r * COLS + c]) {
            ctx2d.fillStyle = brand;
            ctx2d.globalAlpha = 0.85;
            ctx2d.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
            ctx2d.globalAlpha = 1;
          }
          ctx2d.strokeStyle = line;
          ctx2d.lineWidth = 1;
          ctx2d.strokeRect(x + .5, y + .5, cellW - 1, cellH - 1);
        }
      }
    }

    function mark(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      var x = (clientX - rect.left) / rect.width * COLS;
      var y = (clientY - rect.top) / rect.height * ROWS;
      var c = Math.floor(ERP.clamp(x, 0, COLS - 0.001));
      var r = Math.floor(ERP.clamp(y, 0, ROWS - 0.001));
      var i = r * COLS + c;
      if (covered[i]) return;
      covered[i] = 1; count++;
      draw();
      update();
    }

    function update() {
      var total = COLS * ROWS;
      var p = Math.round((count / total) * 100);
      pct.set(p + '%');
      missed.set(String(total - count));
      if (p >= 99 && !passedOnce) {
        passedOnce = true;
        ctx.setResult(S.PASSED, { metrics: { coverage: p, cells: total }, auto: true });
        ERP.ui.toast('اللمس يعمل على كامل الشاشة', 'ok');
      } else if (!passedOnce) {
        ctx.setMetrics({ coverage: p, cells: total });
      }
    }

    var drawing = {};
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing[e.pointerId] = true;
      mark(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing[e.pointerId]) return;
      e.preventDefault();
      // نقاط وسيطة للحركة السريعة
      var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      events.forEach(function (ev) { mark(ev.clientX, ev.clientY); });
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
      canvas.addEventListener(type, function (e) { delete drawing[e.pointerId]; });
    });

    ctx.mount.appendChild(note('مرّر إصبعك (أو الماوس) على كامل المساحة حتى تمتلئ جميع المربعات — أي مربع لا يمتلئ يعني منطقة لمس ميتة.'));
    ctx.mount.appendChild(wrap);
    ctx.mount.appendChild(statsRow([pct, missed]));
    ctx.mount.appendChild(actions([
      button('إعادة الضبط', {
        icon: 'history', sm: true,
        onClick: function () { covered = new Uint8Array(COLS * ROWS); count = 0; passedOnce = false; draw(); update(); }
      })
    ]));

    var onResize = ERP.debounce(resize, 150);
    global.addEventListener('resize', onResize);
    requestAnimationFrame(resize);

    return function () { global.removeEventListener('resize', onResize); };
  });

  register('touchMulti', function (ctx) {
    if (!ERP.caps.touch) {
      return unsupported(ctx, 'هذه الشاشة لا تدعم اللمس المتعدّد (يُفحص على الجهاز نفسه).');
    }
    var maxPoints = navigator.maxTouchPoints || 0;
    var area = el('.multi-touch', { 'aria-label': 'منطقة اللمس المتعدّد' });
    var live = stat('أصابع الآن', '0');
    var best = stat('أعلى عدد', '0');
    var supported = stat('يدعمه الجهاز', maxPoints || '—');
    var active = {};
    var record = 0;

    function render() {
      ERP.clear(area);
      Object.keys(active).forEach(function (id) {
        var p = active[id];
        var rect = area.getBoundingClientRect();
        area.appendChild(el('.multi-touch__dot', {
          style: { insetInlineStart: (p.x - rect.left) + 'px', insetBlockStart: (p.y - rect.top) + 'px' }
        }));
      });
      var n = Object.keys(active).length;
      live.set(String(n));
      if (n > record) {
        record = n;
        best.set(String(record));
        ctx.setMetrics({ maxSimultaneous: record, deviceMax: maxPoints });
        if (record >= 2) {
          ctx.setResult(S.PASSED, { metrics: { maxSimultaneous: record, deviceMax: maxPoints }, auto: true });
        }
      }
    }

    area.addEventListener('pointerdown', function (e) { active[e.pointerId] = { x: e.clientX, y: e.clientY }; render(); });
    area.addEventListener('pointermove', function (e) { if (active[e.pointerId]) { active[e.pointerId] = { x: e.clientX, y: e.clientY }; render(); } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      area.addEventListener(t, function (e) { delete active[e.pointerId]; render(); });
    });

    ctx.mount.appendChild(note('ضع إصبعين أو أكثر داخل المساحة في نفس الوقت.'));
    ctx.mount.appendChild(area);
    ctx.mount.appendChild(statsRow([live, best, supported]));
    return function () {};
  });

  /* =========================================================================
     3) الكاميرات + الفلاش
     ========================================================================= */
  function analyzeFrame(video) {
    var w = 160, h = Math.max(1, Math.round(160 * (video.videoHeight / (video.videoWidth || 1))) || 120);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, 0, 0, w, h);
    var data = g.getImageData(0, 0, w, h).data;
    var gray = new Float32Array(w * h);
    var sum = 0;
    for (var i = 0, p = 0; i < data.length; i += 4, p++) {
      var v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[p] = v; sum += v;
    }
    var mean = sum / (w * h);
    // تباين لابلاس — مؤشر وضوح الصورة (كلما زاد كان التركيز أفضل)
    var lapSum = 0, lapSq = 0, n = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var idx = y * w + x;
        var lap = -4 * gray[idx] + gray[idx - 1] + gray[idx + 1] + gray[idx - w] + gray[idx + w];
        lapSum += lap; lapSq += lap * lap; n++;
      }
    }
    var lapMean = lapSum / n;
    var variance = lapSq / n - lapMean * lapMean;
    return {
      brightness: Math.round(mean),
      sharpness: Math.round(variance),
      width: video.videoWidth,
      height: video.videoHeight
    };
  }

  register('cameraTest', function (ctx) {
    if (!ERP.caps.media) return unsupported(ctx, 'المتصفح لا يدعم الوصول إلى الكاميرا.');
    if (!ERP.caps.secure) return unsupported(ctx, 'الوصول للكاميرا يتطلب اتصالًا آمنًا (https أو localhost).');

    var facing = (ctx.options && ctx.options.facing) || 'environment';
    var stream = null, shots = 0;
    var video = el('video.cam__video', { autoplay: '', playsinline: '', muted: '', 'aria-label': 'معاينة الكاميرا' });
    video.muted = true;
    var shot = el('img.cam__shot', { alt: 'الصورة الملتقطة', hidden: true });
    var stageArea = el('.cam', {}, [video, shot]);

    var res = stat('الدقة');
    var bright = stat('الإضاءة');
    var sharp = stat('الوضوح');
    var lenses = stat('عدسات مرئية');

    var startBtn, shotBtn, stopBtn;

    function stop() {
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      video.srcObject = null;
      if (startBtn) startBtn.disabled = false;
      if (shotBtn) shotBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = true;
    }

    function start() {
      startBtn.disabled = true;
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 } }, audio: false
      }).then(function (s) {
        stream = s;
        video.srcObject = s;
        shot.hidden = true;
        video.hidden = false;
        shotBtn.disabled = false;
        stopBtn.disabled = false;
        var track = s.getVideoTracks()[0];
        var settings = track ? track.getSettings() : {};
        res.set((settings.width || '?') + '×' + (settings.height || '?'));
        if (ERP.caps.enumerate) {
          navigator.mediaDevices.enumerateDevices().then(function (list) {
            lenses.set(String(list.filter(function (d) { return d.kind === 'videoinput'; }).length));
          }).catch(function () {});
        }
      }).catch(function (err) {
        startBtn.disabled = false;
        ctx.mount.appendChild(note(mediaBlocked(ctx, err), 'bad'));
      });
    }

    function capture() {
      if (!stream) return;
      var metrics = analyzeFrame(video);
      var c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      shot.src = c.toDataURL('image/jpeg', 0.7);
      shot.hidden = false;
      video.hidden = true;
      shots++;
      res.set(metrics.width + '×' + metrics.height);
      bright.set(metrics.brightness + '/255');
      sharp.set(String(metrics.sharpness));
      ctx.setMetrics({ shots: shots, brightness: metrics.brightness, sharpness: metrics.sharpness, resolution: metrics.width + 'x' + metrics.height, facing: facing });

      var verdict = metrics.sharpness < 12 ? 'الصورة تبدو غير واضحة (تركيز ضعيف أو عدسة متسخة).'
        : metrics.brightness < 25 ? 'الصورة معتمة جدًا — تأكد من عدم حجب العدسة.'
        : metrics.brightness > 240 ? 'الصورة محترقة الإضاءة — قد يكون هناك تسريب ضوء.'
        : 'قياسات الصورة ضمن المدى الطبيعي.';
      ctx.mount.appendChild(note(verdict, metrics.sharpness < 12 || metrics.brightness < 25 ? 'bad' : null));
      setTimeout(function () {
        video.hidden = false; shot.hidden = true;
      }, 2500);
      ctx.ask('هل الصورة واضحة وبألوان صحيحة وبدون بقع؟');
    }

    startBtn = button('تشغيل الكاميرا', { variant: 'primary', icon: 'camera', onClick: start });
    shotBtn = button('التقاط وتحليل', { icon: 'grid', onClick: capture, disabled: true });
    stopBtn = button('إيقاف', { icon: 'stop', onClick: stop, disabled: true });

    ctx.mount.appendChild(note(facing === 'user'
      ? 'شغّل الكاميرا الأمامية، تحقّق من المعاينة ثم التقط صورة لقياس الوضوح والإضاءة.'
      : 'شغّل الكاميرا الخلفية، حرّك الجهاز للتأكد من التركيز، ثم التقط صورة لقياس الوضوح والإضاءة.'));
    ctx.mount.appendChild(stageArea);
    ctx.mount.appendChild(statsRow([res, bright, sharp, lenses]));
    ctx.mount.appendChild(actions([startBtn, shotBtn, stopBtn]));

    return stop;
  });

  register('torchTest', function (ctx) {
    if (!ERP.caps.media) return unsupported(ctx, 'المتصفح لا يدعم الوصول إلى الكاميرا/الفلاش.');
    var stream = null, track = null, on = false;
    var state = stat('الفلاش', 'مطفأ');
    var toggleBtn;

    function stop() {
      if (track && on) { try { track.applyConstraints({ advanced: [{ torch: false }] }); } catch (e) {} }
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null; track = null; on = false;
    }

    function start() {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        .then(function (s) {
          stream = s;
          track = s.getVideoTracks()[0];
          var caps = track.getCapabilities ? track.getCapabilities() : {};
          if (!caps || !('torch' in caps)) {
            stop();
            ctx.mount.appendChild(note('المتصفح لا يتحكم بالفلاش على هذا الجهاز — شغّل الفلاش من تطبيق الكاميرا وسجّل النتيجة يدويًا.', 'mute'));
            toggleBtn.disabled = true;
            return;
          }
          toggleBtn.disabled = false;
          toggleBtn.querySelector('span').textContent = 'تشغيل الفلاش';
        })
        .catch(function (err) { ctx.mount.appendChild(note(mediaBlocked(ctx, err), 'bad')); });
    }

    function toggle() {
      if (!track) return;
      on = !on;
      track.applyConstraints({ advanced: [{ torch: on }] }).then(function () {
        state.set(on ? 'مضاء' : 'مطفأ');
        toggleBtn.querySelector('span').textContent = on ? 'إطفاء الفلاش' : 'تشغيل الفلاش';
        ctx.setMetrics({ torchToggled: true });
        if (on) ctx.ask('هل أضاء الفلاش بقوة طبيعية؟');
      }).catch(function () {
        ctx.mount.appendChild(note('تعذّر التحكم بالفلاش — سجّل النتيجة يدويًا.', 'bad'));
      });
    }

    toggleBtn = button('تشغيل الفلاش', { variant: 'primary', icon: 'flash', onClick: toggle, disabled: true });

    ctx.mount.appendChild(note('يفتح النظام الكاميرا الخلفية للتحكم بالفلاش مباشرة. بعض المتصفحات لا تسمح بذلك — عندها افحصه يدويًا.'));
    ctx.mount.appendChild(statsRow([state]));
    ctx.mount.appendChild(actions([button('تهيئة الكاميرا', { icon: 'camera', onClick: start }), toggleBtn]));

    return stop;
  });

  /* =========================================================================
     4) الصوت — السمّاعات
     ========================================================================= */
  function audioContext() {
    var Ctor = global.AudioContext || global.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  }

  register('speakerTone', function (ctx) {
    if (!ERP.caps.audioCtx) return unsupported(ctx, 'المتصفح لا يدعم توليد الصوت (Web Audio).');
    var actx = null, osc = null, gain = null;
    var freq = stat('التردد', '—');
    var playing = false;
    var playBtn, sweepBtn;

    function ensure() {
      if (!actx) actx = audioContext();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }

    function stopTone() {
      if (osc) { try { osc.stop(); } catch (e) {} osc.disconnect(); osc = null; }
      if (gain) { gain.disconnect(); gain = null; }
      playing = false;
      freq.set('—');
      if (playBtn) playBtn.querySelector('span').textContent = 'تشغيل نغمة 1kHz';
    }

    function tone(hz) {
      var a = ensure();
      stopTone();
      gain = a.createGain();
      gain.gain.value = 0.0001;
      gain.connect(a.destination);
      osc = a.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;
      osc.connect(gain);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.22, a.currentTime + 0.08);
      playing = true;
      freq.set(hz + ' Hz');
      playBtn.querySelector('span').textContent = 'إيقاف النغمة';
      ctx.setMetrics({ tonePlayed: true });
    }

    function sweep() {
      var a = ensure();
      stopTone();
      gain = a.createGain();
      gain.gain.value = 0.0001;
      gain.connect(a.destination);
      osc = a.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, a.currentTime);
      osc.frequency.exponentialRampToValueAtTime(8000, a.currentTime + 5);
      osc.connect(gain);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.2, a.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, a.currentTime + 4.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 5);
      playing = true;
      var t0 = Date.now();
      var timer = setInterval(function () {
        var t = (Date.now() - t0) / 1000;
        if (t >= 5) { clearInterval(timer); stopTone(); ctx.ask('هل سمعت المسح الترددي كاملًا وبدون خشخشة؟'); return; }
        freq.set(Math.round(200 * Math.pow(40, t / 5)) + ' Hz');
      }, 120);
      ctx.setMetrics({ sweepPlayed: true });
    }

    playBtn = button('تشغيل نغمة 1kHz', { variant: 'primary', icon: 'speaker', onClick: function () { playing ? stopTone() : tone(1000); } });
    sweepBtn = button('مسح ترددي 200Hz→8kHz', { icon: 'play', onClick: sweep });

    ctx.mount.appendChild(note('ارفع صوت الجهاز للأعلى. استمع لأي خشخشة أو انقطاع أو صوت مكتوم.'));
    ctx.mount.appendChild(statsRow([freq]));
    ctx.mount.appendChild(actions([playBtn, sweepBtn]));

    return function () { stopTone(); if (actx) actx.close().catch(function () {}); };
  });

  register('speakerChannels', function (ctx) {
    if (!ERP.caps.audioCtx) return unsupported(ctx, 'المتصفح لا يدعم توليد الصوت (Web Audio).');
    var actx = null, osc = null, gain = null, panner = null;
    var marks = { left: null, right: null };
    var leftBtn, rightBtn, leftOk, rightOk;

    function play(side) {
      if (!actx) actx = audioContext();
      if (actx.state === 'suspended') actx.resume();
      stop();
      gain = actx.createGain(); gain.gain.value = 0.0001;
      panner = actx.createStereoPanner ? actx.createStereoPanner() : null;
      osc = actx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = side === 'left' ? 660 : 990;
      if (panner) { panner.pan.value = side === 'left' ? -1 : 1; osc.connect(panner); panner.connect(gain); }
      else osc.connect(gain);
      gain.connect(actx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.22, actx.currentTime + 0.05);
      setTimeout(stop, 2200);
    }

    function stop() {
      if (osc) { try { osc.stop(); } catch (e) {} osc.disconnect(); osc = null; }
      if (panner) { panner.disconnect(); panner = null; }
      if (gain) { gain.disconnect(); gain = null; }
    }

    function mark(side, ok) {
      marks[side] = ok;
      (side === 'left' ? leftOk : rightOk).textContent = ok ? 'يعمل ✓' : 'لا يعمل ✕';
      (side === 'left' ? leftOk : rightOk).dataset.tone = ok ? 'ok' : 'bad';
      if (marks.left !== null && marks.right !== null) {
        var both = marks.left && marks.right;
        ctx.setResult(both ? S.PASSED : S.FAILED, {
          metrics: { left: marks.left, right: marks.right },
          notes: both ? '' : 'قناة ' + (!marks.left ? 'يسار' : 'يمين') + ' لا تعمل.',
          auto: true
        });
      }
    }

    leftOk = el('span.badge', { text: 'لم يُفحص' });
    rightOk = el('span.badge', { text: 'لم يُفحص' });
    leftBtn = button('تشغيل القناة اليسرى', { icon: 'speaker', onClick: function () { play('left'); } });
    rightBtn = button('تشغيل القناة اليمنى', { icon: 'speaker', onClick: function () { play('right'); } });

    ctx.mount.appendChild(note('شغّل كل قناة على حدة وحدّد إن كانت تعمل — يُفضّل بدون سمّاعات خارجية.'));
    ctx.mount.appendChild(el('.runner__grid', {}, [
      el('.runner__cell', {}, [leftBtn, el('.row.wrap', {}, [
        leftOk,
        button('تعمل', { sm: true, onClick: function () { mark('left', true); } }),
        button('لا تعمل', { sm: true, onClick: function () { mark('left', false); } })
      ])]),
      el('.runner__cell', {}, [rightBtn, el('.row.wrap', {}, [
        rightOk,
        button('تعمل', { sm: true, onClick: function () { mark('right', true); } }),
        button('لا تعمل', { sm: true, onClick: function () { mark('right', false); } })
      ])])
    ]));

    return function () { stop(); if (actx) actx.close().catch(function () {}); };
  });

  /* =========================================================================
     5) المايكروفون — تسجيل حقيقي مع مؤشر مستوى
     ========================================================================= */
  register('micRecord', function (ctx) {
    if (!ERP.caps.media) return unsupported(ctx, 'المتصفح لا يدعم الوصول إلى المايكروفون.');
    if (!ERP.caps.secure) return unsupported(ctx, 'الوصول للمايك يتطلب اتصالًا آمنًا (https أو localhost).');

    var stream = null, actx = null, analyser = null, recorder = null, raf = null, chunks = [], url = null;
    var peakDb = -100, sumDb = 0, samples = 0, recording = false;
    var level = meter('مستوى الإدخال');
    var peak = stat('أعلى مستوى', '—');
    var avg = stat('المتوسط', '—');
    var dur = stat('المدة', '0.0s');
    var player = el('audio.runner__audio', { controls: '', hidden: true });
    var recBtn;

    function dbFromRms(rms) { return 20 * Math.log10(Math.max(rms, 1e-8)); }

    function loop() {
      if (!analyser) return;
      var buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      var rms = Math.sqrt(sum / buf.length);
      var db = dbFromRms(rms);
      if (recording) {
        if (db > peakDb) peakDb = db;
        sumDb += db; samples++;
      }
      // -60dB..0dB → 0..100
      var pct = ERP.clamp(((db + 60) / 60) * 100, 0, 100);
      level.set(pct, db > -12 ? 'warn' : db > -40 ? 'ok' : '');
      raf = requestAnimationFrame(loop);
    }

    function start() {
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then(function (s) {
          stream = s;
          actx = audioContext();
          var src = actx.createMediaStreamSource(s);
          analyser = actx.createAnalyser();
          analyser.fftSize = 2048;
          src.connect(analyser);
          loop();

          if (ERP.caps.recorder) {
            chunks = [];
            try {
              recorder = new MediaRecorder(s);
              recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
              recorder.onstop = finish;
              recorder.start();
            } catch (e) { recorder = null; }
          }
          recording = true;
          peakDb = -100; sumDb = 0; samples = 0;
          recBtn.querySelector('span').textContent = 'إيقاف التسجيل';
          recBtn.classList.add('is-recording');
          var t0 = Date.now();
          var timer = setInterval(function () {
            if (!recording) { clearInterval(timer); return; }
            dur.set(((Date.now() - t0) / 1000).toFixed(1) + 's');
            if ((Date.now() - t0) > 12000) stopRecording();
          }, 100);
        })
        .catch(function (err) { ctx.mount.appendChild(note(mediaBlocked(ctx, err), 'bad')); });
    }

    function stopRecording() {
      recording = false;
      recBtn.querySelector('span').textContent = 'إعادة التسجيل';
      recBtn.classList.remove('is-recording');
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else finish();
    }

    function finish() {
      var avgDb = samples ? sumDb / samples : -100;
      peak.set(peakDb.toFixed(1) + ' dB');
      avg.set(avgDb.toFixed(1) + ' dB');
      var metrics = { peakDb: Number(peakDb.toFixed(1)), avgDb: Number(avgDb.toFixed(1)) };

      if (chunks.length) {
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(new Blob(chunks, { type: chunks[0].type || 'audio/webm' }));
        player.src = url;
        player.hidden = false;
      }

      if (peakDb < -55) {
        ctx.setResult(S.FAILED, { metrics: metrics, notes: 'لم تُلتقط أي إشارة صوتية (' + peakDb.toFixed(1) + ' dB) — المايك لا يستجيب.', auto: true });
        ctx.mount.appendChild(note('لم يُسجَّل صوت يُذكر. تأكد من الإذن ومن عدم انسداد فتحة المايك قبل اعتماد النتيجة.', 'bad'));
      } else {
        ctx.setMetrics(metrics);
        ctx.ask('استمع للتسجيل: هل الصوت واضح وبدون تشويش؟');
      }
      cleanupStream();
    }

    function cleanupStream() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      if (actx) { actx.close().catch(function () {}); actx = null; }
      analyser = null;
      level.set(0);
    }

    recBtn = button('بدء التسجيل', {
      variant: 'primary', icon: 'mic',
      onClick: function () { recording ? stopRecording() : start(); }
    });

    ctx.mount.appendChild(note('تحدّث بصوت طبيعي على بُعد ٣٠ سم. راقب المؤشر أثناء التسجيل ثم استمع للتسجيل بعد إيقافه.'));
    ctx.mount.appendChild(level.node);
    ctx.mount.appendChild(statsRow([peak, avg, dur]));
    ctx.mount.appendChild(player);
    ctx.mount.appendChild(actions([recBtn]));

    return function () {
      recording = false;
      if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch (e) {} }
      cleanupStream();
      if (url) URL.revokeObjectURL(url);
    };
  });

  /* =========================================================================
     6-7) البطارية والشحن
     ========================================================================= */
  register('batteryStatus', function (ctx) {
    if (!ERP.caps.battery) {
      return unsupported(ctx, 'المتصفح لا يوفّر حالة البطارية (شائع في iOS/Safari) — اقرأ النسبة من الجهاز وسجّلها يدويًا.');
    }
    var lvl = stat('نسبة الشحن', '—');
    var chg = stat('الحالة', '—');
    var till = stat('حتى الامتلاء', '—');
    var empty = stat('حتى النفاد', '—');
    var battery = null;
    var handlers = [];

    function fmtTime(sec) {
      if (!isFinite(sec) || sec <= 0) return '—';
      var m = Math.round(sec / 60);
      return m >= 60 ? Math.floor(m / 60) + 'س ' + (m % 60) + 'د' : m + ' دقيقة';
    }

    function render() {
      if (!battery) return;
      var pct = Math.round(battery.level * 100);
      lvl.set(pct + '%');
      chg.set(battery.charging ? 'قيد الشحن' : 'يعمل على البطارية');
      till.set(battery.charging ? fmtTime(battery.chargingTime) : '—');
      empty.set(!battery.charging ? fmtTime(battery.dischargingTime) : '—');
      ctx.setResult(S.PASSED, {
        metrics: { level: pct, charging: battery.charging },
        auto: true
      });
    }

    navigator.getBattery().then(function (b) {
      battery = b;
      ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach(function (evt) {
        b.addEventListener(evt, render);
        handlers.push([evt, render]);
      });
      render();
    }).catch(function () {
      ctx.setResult(S.NOT_SUPPORTED, { reason: 'تعذّر قراءة حالة البطارية', auto: true });
    });

    ctx.mount.appendChild(note('قراءة حيّة من نظام الجهاز. القيم تتحدّث تلقائيًا عند تغيّر الشحن.'));
    ctx.mount.appendChild(statsRow([lvl, chg, till, empty]));

    return function () {
      if (battery) handlers.forEach(function (h) { battery.removeEventListener(h[0], h[1]); });
    };
  });

  register('batteryHealth', function (ctx) {
    var health = el('input.input', { type: 'number', min: '0', max: '100', step: '1', placeholder: 'مثال: 92', inputmode: 'numeric' });
    var cycles = el('input.input', { type: 'number', min: '0', step: '1', placeholder: 'مثال: 320', inputmode: 'numeric' });
    var verdict = el('.runner__verdict');
    var prev = ctx.result && ctx.result.metrics;
    if (prev) { if (prev.healthPct != null) health.value = prev.healthPct; if (prev.cycles != null) cycles.value = prev.cycles; }

    function evaluate() {
      var h = Number(health.value);
      var c = cycles.value === '' ? null : Number(cycles.value);
      if (!health.value || isNaN(h)) { verdict.textContent = ''; verdict.dataset.tone = ''; return; }
      h = ERP.clamp(h, 0, 100);
      var metrics = { healthPct: h, cycles: c };
      var pass = h >= 80;
      var text = pass
        ? (h >= 90 ? 'ممتازة — البطارية بحالة جيدة جدًا.' : 'مقبولة — ضمن الحد الطبيعي (٨٠٪ فأكثر).')
        : (h >= 70 ? 'منخفضة — يُنصح بالاستبدال قريبًا.' : 'ضعيفة جدًا — تحتاج استبدالًا فوريًا.');
      verdict.textContent = text;
      verdict.dataset.tone = pass ? 'ok' : 'bad';
      ctx.setResult(pass ? S.PASSED : S.FAILED, {
        metrics: metrics,
        notes: pass ? (ctx.result && ctx.result.notes) || '' : 'صحة البطارية ' + h + '%' + (c ? ' · دورات الشحن ' + c : '') + ' — ' + text,
        auto: true
      });
    }

    health.addEventListener('input', ERP.debounce(evaluate, 250));
    cycles.addEventListener('input', ERP.debounce(evaluate, 250));

    ctx.mount.appendChild(note('iPhone: الإعدادات ← البطارية ← صحة البطارية. Android: تطبيق فحص البطارية أو كود المصنّع. الحد المعتمد للقبول ٨٠٪.'));
    ctx.mount.appendChild(el('.runner__grid', {}, [
      el('.field', {}, [el('label', { text: 'صحة البطارية (%)' }), health]),
      el('.field', {}, [el('label', { text: 'دورات الشحن (اختياري)' }), cycles])
    ]));
    ctx.mount.appendChild(verdict);
    if (prev) evaluate();
    return function () {};
  });

  register('chargingDetect', function (ctx) {
    var wireless = !!(ctx.options && ctx.options.wireless);
    if (!ERP.caps.battery) {
      return unsupported(ctx, 'المتصفح لا يكشف حالة الشحن (شائع في iOS) — وصّل الشاحن وتحقق يدويًا.');
    }
    var state = stat('الحالة', '—');
    var lvl = stat('نسبة الشحن', '—');
    var timerStat = stat('المتبقي للكشف', '—');
    var battery = null, countdown = null, startLevel = null, watching = false;
    var startBtn;

    function render() {
      if (!battery) return;
      state.set(battery.charging ? 'يشحن ✓' : 'غير موصول');
      lvl.set(Math.round(battery.level * 100) + '%');
    }

    function onChange() {
      render();
      if (!watching || !battery.charging) return;
      watching = false;
      clearInterval(countdown);
      timerStat.set('اكتُشف');
      ctx.setResult(S.PASSED, {
        metrics: {
          detected: true, wireless: wireless,
          levelAtStart: startLevel, levelNow: Math.round(battery.level * 100)
        },
        auto: true
      });
      ERP.ui.toast(wireless ? 'تم كشف الشحن اللاسلكي' : 'تم كشف الشحن السلكي', 'ok');
      if (wireless) ctx.mount.appendChild(note('المتصفح لا يميّز نوع الشحن — تأكد أن الجهاز على قاعدة لاسلكية وليس كيبلًا.', 'mute'));
    }

    function watch() {
      if (!battery) return;
      if (battery.charging) { startBtn.disabled = true; onChangeImmediate(); return; }
      watching = true;
      startLevel = Math.round(battery.level * 100);
      var left = 45;
      timerStat.set(left + 'ث');
      countdown = setInterval(function () {
        left--;
        timerStat.set(left + 'ث');
        if (left <= 0) {
          clearInterval(countdown);
          watching = false;
          timerStat.set('انتهى الوقت');
          ctx.mount.appendChild(note('لم يُكتشف شحن خلال ٤٥ ثانية. جرّب كيبلًا آخر قبل اعتماد الفشل.', 'bad'));
          ctx.ask('هل بدأ الجهاز بالشحن فعليًا؟');
        }
      }, 1000);
    }

    function onChangeImmediate() {
      ctx.setResult(S.PASSED, { metrics: { detected: true, alreadyCharging: true, wireless: wireless }, auto: true });
      timerStat.set('يشحن مسبقًا');
    }

    navigator.getBattery().then(function (b) {
      battery = b;
      b.addEventListener('chargingchange', onChange);
      b.addEventListener('levelchange', render);
      render();
    }).catch(function () { ctx.setResult(S.NOT_SUPPORTED, { reason: 'تعذّر قراءة حالة الشحن', auto: true }); });

    startBtn = button(wireless ? 'ابدأ مراقبة الشحن اللاسلكي' : 'ابدأ مراقبة الشحن', { variant: 'primary', icon: 'bolt', onClick: watch });

    ctx.mount.appendChild(note(wireless
      ? 'اضغط ابدأ ثم ضع الجهاز على قاعدة الشحن اللاسلكي خلال ٤٥ ثانية.'
      : 'اضغط ابدأ ثم وصّل كيبل الشحن خلال ٤٥ ثانية — سيُكتشف التغيّر تلقائيًا.'));
    ctx.mount.appendChild(statsRow([state, lvl, timerStat]));
    ctx.mount.appendChild(actions([startBtn]));

    return function () {
      clearInterval(countdown);
      if (battery) { battery.removeEventListener('chargingchange', onChange); battery.removeEventListener('levelchange', render); }
    };
  });

  /* =========================================================================
     8/10) الشبكة — واي فاي وبيانات
     ========================================================================= */
  register('networkTest', function (ctx) {
    var expectCellular = ctx.options && ctx.options.expect === 'cellular';
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var online = stat('الاتصال', navigator.onLine ? 'متصل' : 'غير متصل');
    var type = stat('النوع', conn ? (conn.type || conn.effectiveType || '—') : 'غير متاح');
    var speed = stat('السرعة التقديرية', conn && conn.downlink ? conn.downlink + ' Mb/s' : '—');
    var rtt = stat('زمن الاستجابة', '—');
    var running = false;

    function refresh() {
      online.set(navigator.onLine ? 'متصل' : 'غير متصل');
      if (conn) {
        type.set(conn.type || conn.effectiveType || '—');
        speed.set(conn.downlink ? conn.downlink + ' Mb/s' : '—');
      }
    }

    function probe() {
      if (running) return;
      running = true;
      var samples = [];
      var target = location.href.split('#')[0];
      var i = 0;
      function once() {
        if (i >= 3) return done();
        var t0 = performance.now();
        fetch(target + (target.indexOf('?') >= 0 ? '&' : '?') + '_p=' + Date.now(), { cache: 'no-store', method: 'GET' })
          .then(function () { samples.push(performance.now() - t0); })
          .catch(function () { /* file:// أو حجب — نتجاهل العيّنة */ })
          .then(function () { i++; once(); });
      }
      function done() {
        running = false;
        if (samples.length) {
          var avg = samples.reduce(function (a, b) { return a + b; }, 0) / samples.length;
          rtt.set(Math.round(avg) + ' ms');
          var metrics = {
            online: navigator.onLine, rttMs: Math.round(avg),
            type: conn ? (conn.type || conn.effectiveType) : null,
            downlink: conn ? conn.downlink : null
          };
          var ok = navigator.onLine && avg < 2500;
          if (expectCellular && conn && conn.type && conn.type !== 'cellular') {
            ctx.setMetrics(metrics);
            ctx.mount.appendChild(note('نوع الاتصال الحالي "' + conn.type + '" وليس شبكة خلوية — أطفئ الواي فاي ثم أعد القياس.', 'bad'));
            return;
          }
          ctx.setResult(ok ? S.PASSED : S.FAILED, { metrics: metrics, auto: true });
        } else {
          rtt.set('غير متاح');
          ctx.setMetrics({ online: navigator.onLine, rttMs: null, note: 'تعذّر القياس (تشغيل محلي بدون خادم)' });
          ctx.mount.appendChild(note('تعذّر قياس زمن الاستجابة — النظام مفتوح من ملف محلي. اعتمد على حالة الاتصال وسجّل النتيجة يدويًا.', 'mute'));
        }
      }
      rtt.set('يقيس…');
      once();
    }

    var offOnline = ERP.on(global, 'online', refresh);
    var offOffline = ERP.on(global, 'offline', refresh);
    var offChange = conn && conn.addEventListener ? ERP.on(conn, 'change', refresh) : function () {};

    ctx.mount.appendChild(note(expectCellular
      ? 'أطفئ الواي فاي وشغّل بيانات الشبكة، ثم اضغط قياس.'
      : 'تأكد أن الجهاز متصل بشبكة واي فاي، ثم اضغط قياس.'));
    ctx.mount.appendChild(statsRow([online, type, speed, rtt]));
    ctx.mount.appendChild(actions([button('قياس الاتصال', { variant: 'primary', icon: 'wifi', onClick: probe })]));

    return function () { offOnline(); offOffline(); offChange(); };
  });

  /* =========================================================================
     9) البلوتوث
     ========================================================================= */
  register('bluetoothTest', function (ctx) {
    if (!ERP.caps.bluetooth) {
      return unsupported(ctx, 'المتصفح لا يدعم Web Bluetooth — افحص الاقتران من إعدادات الجهاز وسجّل النتيجة يدويًا.');
    }
    var radio = stat('مذياع البلوتوث', 'يفحص…');
    var found = stat('آخر جهاز', '—');

    if (navigator.bluetooth.getAvailability) {
      navigator.bluetooth.getAvailability().then(function (available) {
        radio.set(available ? 'متاح ✓' : 'غير متاح');
        ctx.setMetrics({ radioAvailable: available });
        if (!available) {
          ctx.setResult(S.FAILED, { metrics: { radioAvailable: false }, notes: 'مذياع البلوتوث غير متاح على الجهاز.', auto: true });
        }
      }).catch(function () { radio.set('غير معروف'); });
    } else radio.set('غير معروف');

    function scan() {
      navigator.bluetooth.requestDevice({ acceptAllDevices: true })
        .then(function (device) {
          found.set(device.name || device.id || 'جهاز بلا اسم');
          ctx.setResult(S.PASSED, { metrics: { radioAvailable: true, scanned: true, device: device.name || null }, auto: true });
          ERP.ui.toast('تم العثور على جهاز بلوتوث', 'ok');
        })
        .catch(function (err) {
          if (err && err.name === 'NotFoundError') {
            ctx.mount.appendChild(note('أُغلقت نافذة البحث بدون اختيار — أعد المحاولة أو سجّل النتيجة يدويًا.', 'mute'));
          } else {
            ctx.mount.appendChild(note('تعذّر البحث: ' + ((err && err.message) || 'خطأ غير معروف'), 'bad'));
          }
        });
    }

    ctx.mount.appendChild(note('يفتح المتصفح نافذة بحث عن أجهزة قريبة — اختر أي جهاز ظاهر لإثبات عمل البلوتوث.'));
    ctx.mount.appendChild(statsRow([radio, found]));
    ctx.mount.appendChild(actions([button('ابحث عن أجهزة قريبة', { variant: 'primary', icon: 'bluetooth', onClick: scan })]));
    return function () {};
  });

  /* =========================================================================
     11) NFC
     ========================================================================= */
  register('nfcTest', function (ctx) {
    if (!ERP.caps.nfc) {
      return unsupported(ctx, 'المتصفح لا يدعم Web NFC (متاح غالبًا على Chrome/Android) — افحص NFC من إعدادات الجهاز.');
    }
    var state = stat('الحالة', 'جاهز');
    var reader = null, abort = null, timer = null;

    function scan() {
      try {
        reader = new global.NDEFReader();
        abort = new AbortController();
        state.set('بانتظار البطاقة…');
        reader.scan({ signal: abort.signal }).then(function () {
          reader.onreading = function (event) {
            state.set('تمت القراءة ✓');
            clearTimeout(timer);
            ctx.setResult(S.PASSED, {
              metrics: { serialNumber: event.serialNumber || null, records: (event.message && event.message.records.length) || 0 },
              auto: true
            });
            ERP.ui.toast('قُرئت بطاقة NFC', 'ok');
            if (abort) abort.abort();
          };
          reader.onreadingerror = function () {
            state.set('خطأ قراءة');
            ctx.mount.appendChild(note('تعذّرت قراءة البطاقة — جرّب بطاقة أخرى.', 'bad'));
          };
          timer = setTimeout(function () {
            if (abort) abort.abort();
            state.set('انتهى الوقت');
            ctx.mount.appendChild(note('لم تُقرأ أي بطاقة خلال ٣٠ ثانية.', 'bad'));
            ctx.ask('هل جرّبت بطاقة تعمل على جهاز آخر؟');
          }, 30000);
        }).catch(function (err) {
          state.set('محجوب');
          ctx.mount.appendChild(note('تعذّر تشغيل NFC: ' + ((err && err.message) || '') + ' — قد يحتاج إذنًا أو تفعيلًا من الإعدادات.', 'bad'));
        });
      } catch (e) {
        ctx.setResult(S.NOT_SUPPORTED, { reason: 'NFC غير مدعوم في هذا المتصفح', auto: true });
      }
    }

    ctx.mount.appendChild(note('اضغط بدء ثم قرّب بطاقة NFC (بطاقة دفع أو ملصق) من ظهر الجهاز.'));
    ctx.mount.appendChild(statsRow([state]));
    ctx.mount.appendChild(actions([button('ابدأ قراءة NFC', { variant: 'primary', icon: 'nfc', onClick: scan })]));

    return function () { clearTimeout(timer); if (abort) try { abort.abort(); } catch (e) {} };
  });

  /* =========================================================================
     12) GPS
     ========================================================================= */
  register('gpsTest', function (ctx) {
    if (!ERP.caps.geo) return unsupported(ctx, 'المتصفح لا يدعم تحديد الموقع.');
    var acc = stat('الدقة', '—');
    var ttf = stat('زمن الالتقاط', '—');
    var coords = stat('الإحداثيات', '—');
    var watchId = null;

    function locate() {
      var t0 = performance.now();
      acc.set('يبحث…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var dt = Math.round(performance.now() - t0);
        var a = Math.round(pos.coords.accuracy);
        acc.set(a + ' م');
        ttf.set((dt / 1000).toFixed(1) + 'ث');
        coords.set(pos.coords.latitude.toFixed(2) + ', ' + pos.coords.longitude.toFixed(2));
        var metrics = { accuracyM: a, timeToFixMs: dt, lat: Number(pos.coords.latitude.toFixed(2)), lon: Number(pos.coords.longitude.toFixed(2)) };
        if (a <= 100) {
          ctx.setResult(S.PASSED, { metrics: metrics, auto: true });
          ERP.ui.toast('تم التقاط الموقع بدقة ' + a + ' متر', 'ok');
        } else {
          ctx.setMetrics(metrics);
          ctx.mount.appendChild(note('الدقة ' + a + ' متر — ضعيفة نسبيًا. جرّب في الخارج بعيدًا عن الجدران قبل اعتماد النتيجة.', 'bad'));
        }
      }, function (err) {
        var map = { 1: 'رُفض إذن الموقع.', 2: 'تعذّر تحديد الموقع (لا إشارة).', 3: 'انتهت المهلة قبل التقاط الإشارة.' };
        acc.set('فشل');
        ctx.mount.appendChild(note(map[err.code] || 'خطأ في تحديد الموقع', 'bad'));
        if (err.code === 2 || err.code === 3) {
          ctx.setResult(S.FAILED, { notes: map[err.code], auto: true });
        }
      }, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
    }

    ctx.mount.appendChild(note('يُفضّل الفحص قرب نافذة أو خارج المبنى. لا تُحفظ الإحداثيات كاملة — فقط تقريب للتقرير.'));
    ctx.mount.appendChild(statsRow([acc, ttf, coords]));
    ctx.mount.appendChild(actions([button('التقط الموقع', { variant: 'primary', icon: 'gps', onClick: locate })]));

    return function () { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  });

  /* =========================================================================
     13) الحساسات
     ========================================================================= */
  function requestMotionPermission() {
    var DME = global.DeviceMotionEvent, DOE = global.DeviceOrientationEvent;
    var reqs = [];
    if (DME && typeof DME.requestPermission === 'function') reqs.push(DME.requestPermission());
    if (DOE && typeof DOE.requestPermission === 'function') reqs.push(DOE.requestPermission());
    if (!reqs.length) return Promise.resolve('granted');
    return Promise.all(reqs).then(function (res) {
      return res.every(function (r) { return r === 'granted'; }) ? 'granted' : 'denied';
    });
  }

  register('motionTest', function (ctx) {
    if (!ERP.caps.motion) return unsupported(ctx, 'المتصفح لا يوفّر قراءات حسّاس الحركة (يُفحص على الجهاز نفسه).');
    var axes = { x: { min: Infinity, max: -Infinity }, y: { min: Infinity, max: -Infinity }, z: { min: Infinity, max: -Infinity } };
    var sx = stat('X', '—'), sy = stat('Y', '—'), sz = stat('Z', '—');
    var mx = meter('مدى X'), my = meter('مدى Y'), mz = meter('مدى Z');
    var listening = false, passed = false, got = false;

    function onMotion(e) {
      var a = e.accelerationIncludingGravity || e.acceleration;
      if (!a || a.x === null) return;
      got = true;
      ['x', 'y', 'z'].forEach(function (k) {
        var v = a[k] || 0;
        axes[k].min = Math.min(axes[k].min, v);
        axes[k].max = Math.max(axes[k].max, v);
      });
      sx.set((a.x || 0).toFixed(2)); sy.set((a.y || 0).toFixed(2)); sz.set((a.z || 0).toFixed(2));
      var rx = axes.x.max - axes.x.min, ry = axes.y.max - axes.y.min, rz = axes.z.max - axes.z.min;
      mx.set((rx / 6) * 100, rx > 3 ? 'ok' : ''); my.set((ry / 6) * 100, ry > 3 ? 'ok' : ''); mz.set((rz / 6) * 100, rz > 3 ? 'ok' : '');
      if (!passed && rx > 3 && ry > 3 && rz > 3) {
        passed = true;
        ctx.setResult(S.PASSED, { metrics: { rangeX: +rx.toFixed(2), rangeY: +ry.toFixed(2), rangeZ: +rz.toFixed(2) }, auto: true });
        ERP.ui.toast('حسّاس التسارع يستجيب على المحاور الثلاثة', 'ok');
      }
    }

    function start() {
      requestMotionPermission().then(function (state) {
        if (state !== 'granted') { ctx.mount.appendChild(note('رُفض إذن الحساسات — فعّله من إعدادات المتصفح.', 'bad')); return; }
        if (listening) return;
        listening = true;
        global.addEventListener('devicemotion', onMotion);
        setTimeout(function () {
          if (!got) ctx.mount.appendChild(note('لم تصل أي قراءة من الحسّاس خلال ٥ ثوانٍ — قد لا يكون متاحًا على هذا الجهاز/المتصفح.', 'bad'));
        }, 5000);
      });
    }

    ctx.mount.appendChild(note('اضغط بدء ثم حرّك الجهاز يمينًا/يسارًا، أمامًا/خلفًا، وأعلى/أسفل حتى تمتلئ المؤشرات الثلاثة.'));
    ctx.mount.appendChild(statsRow([sx, sy, sz]));
    ctx.mount.appendChild(el('.stack', {}, [mx.node, my.node, mz.node]));
    ctx.mount.appendChild(actions([button('بدء القراءة', { variant: 'primary', icon: 'sensor', onClick: start })]));

    return function () { if (listening) global.removeEventListener('devicemotion', onMotion); };
  });

  register('orientationTest', function (ctx) {
    if (!ERP.caps.orientation) return unsupported(ctx, 'المتصفح لا يوفّر قراءات الاتجاه (يُفحص على الجهاز نفسه).');
    var beta = { min: Infinity, max: -Infinity }, gamma = { min: Infinity, max: -Infinity };
    var sb = stat('الميل الأمامي β', '—'), sg = stat('الميل الجانبي γ', '—');
    var bubble = el('.tilt'), dot = el('.tilt__dot');
    bubble.appendChild(dot);
    var listening = false, passed = false;

    function onOrient(e) {
      if (e.beta === null && e.gamma === null) return;
      var b = e.beta || 0, g = e.gamma || 0;
      sb.set(b.toFixed(1) + '°'); sg.set(g.toFixed(1) + '°');
      beta.min = Math.min(beta.min, b); beta.max = Math.max(beta.max, b);
      gamma.min = Math.min(gamma.min, g); gamma.max = Math.max(gamma.max, g);
      dot.style.transform = 'translate(' + ERP.clamp(g, -45, 45) + 'px,' + ERP.clamp(b - 45, -45, 45) + 'px)';
      if (!passed && (beta.max - beta.min) > 25 && (gamma.max - gamma.min) > 25) {
        passed = true;
        ctx.setResult(S.PASSED, { metrics: { betaRange: +(beta.max - beta.min).toFixed(1), gammaRange: +(gamma.max - gamma.min).toFixed(1) }, auto: true });
        ERP.ui.toast('الجيروسكوب يستجيب', 'ok');
      }
    }

    function start() {
      requestMotionPermission().then(function (state) {
        if (state !== 'granted') { ctx.mount.appendChild(note('رُفض إذن الحساسات.', 'bad')); return; }
        if (listening) return;
        listening = true;
        global.addEventListener('deviceorientation', onOrient);
      });
    }

    ctx.mount.appendChild(note('أمِل الجهاز للأمام والخلف ثم يمينًا ويسارًا — يجب أن تتحرّك النقطة بسلاسة.'));
    ctx.mount.appendChild(bubble);
    ctx.mount.appendChild(statsRow([sb, sg]));
    ctx.mount.appendChild(actions([button('بدء القراءة', { variant: 'primary', icon: 'sensor', onClick: start })]));

    return function () { if (listening) global.removeEventListener('deviceorientation', onOrient); };
  });

  register('compassTest', function (ctx) {
    if (!ERP.caps.orientation) return unsupported(ctx, 'المتصفح لا يوفّر قراءة البوصلة.');
    var sectors = new Array(8).fill(0);
    var heading = stat('الاتجاه', '—');
    var covered = stat('القطاعات', '0/8');
    var listening = false, passed = false;

    function onOrient(e) {
      var h = e.webkitCompassHeading;
      if (h === undefined || h === null) {
        if (e.absolute && e.alpha !== null) h = 360 - e.alpha;
        else if (e.alpha !== null) h = 360 - e.alpha;
      }
      if (h === undefined || h === null || isNaN(h)) return;
      heading.set(Math.round(h) + '°');
      sectors[Math.floor((h % 360) / 45)] = 1;
      var n = sectors.reduce(function (a, b) { return a + b; }, 0);
      covered.set(n + '/8');
      if (!passed && n >= 7) {
        passed = true;
        ctx.setResult(S.PASSED, { metrics: { sectors: n }, auto: true });
        ERP.ui.toast('البوصلة تغطي كل الاتجاهات', 'ok');
      }
    }

    function start() {
      requestMotionPermission().then(function (state) {
        if (state !== 'granted') { ctx.mount.appendChild(note('رُفض إذن الحساسات.', 'bad')); return; }
        if (listening) return;
        listening = true;
        global.addEventListener('deviceorientationabsolute', onOrient);
        global.addEventListener('deviceorientation', onOrient);
        setTimeout(function () {
          if (heading.el.textContent === '—') {
            ctx.setResult(S.NOT_SUPPORTED, { reason: 'لا توجد قراءة بوصلة في هذا المتصفح', auto: true });
            ctx.mount.appendChild(note('لم تصل قراءة بوصلة — افحصها من تطبيق البوصلة على الجهاز.', 'mute'));
          }
        }, 5000);
      });
    }

    ctx.mount.appendChild(note('أدر الجهاز أفقيًا دورة كاملة ببطء حتى تُغطّى ٨ اتجاهات.'));
    ctx.mount.appendChild(statsRow([heading, covered]));
    ctx.mount.appendChild(actions([button('بدء القراءة', { variant: 'primary', icon: 'gps', onClick: start })]));

    return function () {
      if (listening) {
        global.removeEventListener('deviceorientationabsolute', onOrient);
        global.removeEventListener('deviceorientation', onOrient);
      }
    };
  });

  /* =========================================================================
     14) البصمة / الوجه
     ========================================================================= */
  register('biometricTest', function (ctx) {
    var platform = stat('مستشعر النظام', 'يفحص…');
    var kind = ctx.test.id === 'bio.face' ? 'التعرّف على الوجه' : 'بصمة الإصبع';

    if (ERP.caps.webauthn && global.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      global.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(function (available) {
          platform.set(available ? 'مفعّل ومتاح ✓' : 'غير مفعّل');
          ctx.setMetrics({ platformAuthenticator: available });
          if (!available) {
            ctx.mount.appendChild(note('نظام التشغيل لا يبلّغ عن مستشعر تحقق مفعّل — قد يكون غير مسجَّل أصلًا. سجّل بصمة/وجهًا جديدًا على الجهاز ثم أعد الفحص.', 'mute'));
          }
        })
        .catch(function () { platform.set('غير معروف'); });
    } else {
      platform.set('غير متاح للمتصفح');
    }

    ctx.mount.appendChild(note('على الجهاز: احذف بصمة/وجهًا قديمًا، سجّل ' + kind + ' جديدًا، ثم اقفل الشاشة وافتحها مرّتين.'));
    ctx.mount.appendChild(statsRow([platform]));
    ctx.mount.appendChild(actions([
      button('نجح فتح القفل مرّتين', {
        variant: 'primary', icon: 'check',
        onClick: function () { ctx.setResult(S.PASSED, { metrics: { unlocks: 2 } }); }
      }),
      button('فشل التسجيل أو الفتح', {
        icon: 'x',
        onClick: function () { ctx.setResult(S.FAILED, { notes: kind + ' لا يعمل بشكل موثوق.' }); }
      })
    ]));
    return function () {};
  });

  /* =========================================================================
     15) الأزرار
     ========================================================================= */
  register('buttonsTest', function (ctx) {
    var caps = ctx.caps || {};
    var isApple = (ctx.device && /apple|iphone|ipad/i.test(ctx.device.brand + ' ' + ctx.device.model));
    var list = [
      { id: 'power', ar: 'زر التشغيل / الجانبي' },
      { id: 'volUp', ar: 'رفع الصوت' },
      { id: 'volDown', ar: 'خفض الصوت' }
    ];
    if (isApple) list.push({ id: 'mute', ar: 'مفتاح الصامت / زر الإجراء' });
    if (caps.formFactor === 'tablet') list.push({ id: 'home', ar: 'زر الرئيسية (إن وُجد)' });

    var state = {};
    var rows = el('.runner__grid');

    function evaluate() {
      var keys = Object.keys(state);
      if (keys.length < list.length) return;
      var failed = list.filter(function (b) { return state[b.id] === false; });
      ctx.setResult(failed.length ? S.FAILED : S.PASSED, {
        metrics: state,
        notes: failed.length ? 'أزرار لا تعمل: ' + failed.map(function (b) { return b.ar; }).join('، ') : '',
        auto: true
      });
    }

    list.forEach(function (b) {
      var badge = el('span.badge', { text: 'لم يُفحص' });
      function set(ok) {
        state[b.id] = ok;
        badge.textContent = ok ? 'يعمل ✓' : 'لا يعمل ✕';
        badge.className = 'badge ' + (ok ? 'badge--ok' : 'badge--bad');
        evaluate();
      }
      rows.appendChild(el('.runner__cell', {}, [
        el('.row-between', {}, [el('strong', { text: b.ar }), badge]),
        el('.row.wrap', {}, [
          button('يعمل', { sm: true, icon: 'check', onClick: function () { set(true); } }),
          button('لا يعمل', { sm: true, icon: 'x', onClick: function () { set(false); } })
        ])
      ]));
    });

    // بعض الأجهزة تُطلق أحداث مفاتيح للصوت — نلتقطها كتأكيد إضافي
    function onKey(e) {
      var map = { AudioVolumeUp: 'volUp', VolumeUp: 'volUp', AudioVolumeDown: 'volDown', VolumeDown: 'volDown' };
      var id = map[e.key];
      if (!id) return;
      e.preventDefault();
      ERP.ui.toast('اكتُشف ضغط: ' + (id === 'volUp' ? 'رفع الصوت' : 'خفض الصوت'), 'ok');
    }
    var off = ERP.on(global, 'keydown', onKey);

    ctx.mount.appendChild(note('اضغط كل زر على الجهاز نفسه وتأكد من استجابته (اهتزاز/تغيّر صوت/إطفاء شاشة)، ثم سجّل النتيجة هنا.'));
    ctx.mount.appendChild(rows);
    return off;
  });

  /* =========================================================================
     16) الهزّاز
     ========================================================================= */
  register('vibrationTest', function (ctx) {
    if (!ERP.caps.vibration) {
      return unsupported(ctx, 'المتصفح لا يدعم واجهة الاهتزاز (شائع في iOS/سطح المكتب) — جرّبه من الجهاز مباشرة.');
    }
    ctx.mount.appendChild(note('شغّل النمط واشعر بالاهتزاز — انتبه لصوت طقطقة أو اهتزاز ضعيف جدًا.'));
    ctx.mount.appendChild(actions([
      button('نبضة قصيرة', { icon: 'vibrate', onClick: function () { navigator.vibrate(150); ctx.setMetrics({ pulsed: true }); } }),
      button('نمط متدرّج', {
        variant: 'primary', icon: 'vibrate',
        onClick: function () {
          navigator.vibrate([120, 90, 220, 90, 400]);
          ctx.setMetrics({ patternPlayed: true });
          setTimeout(function () { ctx.ask('هل شعرت بالاهتزاز بقوة طبيعية؟'); }, 1100);
        }
      })
    ]));
    return function () { if (navigator.vibrate) navigator.vibrate(0); };
  });

  DI.runners = {
    registry: registry,
    register: register,
    has: function (name) { return !!registry[name]; },
    run: function (name, ctx) {
      var fn = registry[name];
      if (!fn) return function () {};
      try { return fn(ctx) || function () {}; }
      catch (e) {
        console.error('[runner] ' + name, e);
        ctx.mount.appendChild(note('تعذّر تشغيل الاختبار التفاعلي: ' + e.message, 'bad'));
        return function () {};
      }
    }
  };
})(window);
