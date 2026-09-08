/* ==========================================================================
   Soufyan ERP — Shared UI primitives
   Toast · Modal · Confirm · Picker · Ring · Count-up
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var el = ERP.el, $ = ERP.$, clear = ERP.clear;

  /* ---- Toast ------------------------------------------------------------- */
  function toaster() {
    var node = $('.toaster');
    if (!node) {
      node = el('.toaster', { role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(node);
    }
    return node;
  }

  function toast(message, kind, ms) {
    var node = el('.toast' + (kind ? '.toast--' + kind : ''), {}, [
      kind === 'ok' ? ERP.iconNode('check', 16) : kind === 'bad' ? ERP.iconNode('alert', 16) : null,
      el('span', { text: message })
    ]);
    toaster().appendChild(node);
    var life = ms || 2600;
    setTimeout(function () {
      node.classList.add('toast--out');
      setTimeout(function () { node.remove(); }, 220);
    }, life);
    return node;
  }

  /* ---- Modal ------------------------------------------------------------- */
  var openModals = [];

  function modal(opts) {
    var options = opts || {};
    var scrim = el('.scrim', { 'aria-hidden': 'true' });
    var titleId = ERP.uid('mt');

    var body = el('.modal__body.stack');
    ERP.append(body, options.body || null);

    var foot = options.actions ? el('.row.wrap', { style: { justifyContent: 'flex-end', marginTop: '20px' } }, options.actions) : null;

    var box = el('.modal', {
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1'
    }, [
      el('.modal__head', {}, [
        el('h3', { id: titleId, text: options.title || '' }),
        el('button.btn.btn--icon.btn--quiet', {
          type: 'button', 'aria-label': 'إغلاق', html: ERP.icon('x', 18), onclick: function () { close(); }
        })
      ]),
      body,
      foot
    ]);

    var lastFocus = document.activeElement;

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var focusables = box.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      box.remove();
      scrim.remove();
      openModals = openModals.filter(function (m) { return m !== handle; });
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      if (options.onClose) options.onClose(result);
    }

    scrim.addEventListener('click', function () { if (options.dismissible !== false) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(scrim);
    document.body.appendChild(box);

    var autofocus = box.querySelector('[data-autofocus]') || box;
    setTimeout(function () { autofocus.focus(); }, 40);

    var handle = { close: close, node: box, body: body };
    openModals.push(handle);
    return handle;
  }

  function confirm(opts) {
    var options = opts || {};
    return new Promise(function (resolve) {
      var handle = modal({
        title: options.title || 'تأكيد',
        body: el('p.sub', { text: options.message || '' }),
        onClose: function (r) { resolve(r === true); },
        actions: [
          el('button.btn.btn--ghost', {
            type: 'button', text: options.cancelText || 'إلغاء',
            onclick: function () { handle.close(false); }
          }),
          el('button.btn' + (options.danger ? '.btn--danger' : '.btn--primary'), {
            type: 'button', text: options.confirmText || 'تأكيد', 'data-autofocus': '',
            onclick: function () { handle.close(true); }
          })
        ]
      });
    });
  }

  /**
   * قائمة اختيار قابلة للبحث.
   * items: [{ id, title, sub, meta, badge, disabled }]
   */
  function picker(opts) {
    var options = opts || {};
    var listNode = el('.picker__list.stack');
    var input = el('input.input', {
      type: 'search', placeholder: options.searchPlaceholder || 'ابحث…',
      'data-autofocus': '', 'aria-label': options.searchPlaceholder || 'بحث'
    });

    function render(term) {
      clear(listNode);
      var items = typeof options.items === 'function' ? options.items(term) : options.items;
      if (!items.length) {
        listNode.appendChild(el('.empty', {}, [
          el('.empty__icon', { html: ERP.icon('search', 22) }),
          el('p.sub', { text: options.emptyText || 'لا توجد نتائج' })
        ]));
        return;
      }
      items.slice(0, 60).forEach(function (item) {
        listNode.appendChild(el('button.picker__row', {
          type: 'button', disabled: item.disabled || null,
          onclick: function () { handle.close(); options.onPick(item); }
        }, [
          el('.grow', {}, [
            el('.picker__title', { text: item.title }),
            item.sub ? el('.picker__sub.mono', { text: item.sub }) : null
          ]),
          item.badge ? el('span.badge' + (item.badgeKind ? '.badge--' + item.badgeKind : ''), { text: item.badge }) : null,
          item.meta ? el('span.micro', { text: item.meta }) : null
        ]));
      });
    }

    input.addEventListener('input', ERP.debounce(function () { render(input.value); }, 120));

    var handle = modal({
      title: options.title || 'اختيار',
      body: [el('.stack', {}, [input, listNode]), options.footer || null],
      onClose: options.onClose
    });
    render('');
    return handle;
  }

  /* ---- Progress ring ------------------------------------------------------ */
  /**
   * حلقة تقدّم SVG. تُرجع { node, set(pct, tone) }
   */
  function ring(size, stroke) {
    var s = size || 72;
    var w = stroke || 7;
    var r = (s - w) / 2;
    var c = 2 * Math.PI * r;

    var track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    var value = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    [track, value].forEach(function (node) {
      node.setAttribute('cx', s / 2); node.setAttribute('cy', s / 2); node.setAttribute('r', r);
      node.setAttribute('stroke-width', w); node.setAttribute('fill', 'none');
    });
    track.setAttribute('class', 'ring__track');
    value.setAttribute('class', 'ring__value');
    value.setAttribute('stroke-dasharray', c);
    value.setAttribute('stroke-dashoffset', c);

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ring');
    svg.setAttribute('width', s); svg.setAttribute('height', s);
    svg.setAttribute('viewBox', '0 0 ' + s + ' ' + s);
    svg.setAttribute('aria-hidden', 'true');
    svg.appendChild(track); svg.appendChild(value);

    return {
      node: svg,
      set: function (pct, tone) {
        var p = ERP.clamp(Number(pct) || 0, 0, 100);
        value.setAttribute('stroke-dashoffset', String(c - (c * p) / 100));
        value.setAttribute('class', 'ring__value' + (tone ? ' ring__value--' + tone : ''));
      }
    };
  }

  /* ---- Count-up (spring-ish, respects reduced motion) --------------------- */
  function countUp(node, to, opts) {
    var options = opts || {};
    var from = Number(options.from || 0);
    var target = Number(to) || 0;
    var suffix = options.suffix || '';
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { node.textContent = Math.round(target) + suffix; return; }

    var duration = options.duration || 900;
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var t = ERP.clamp((ts - start) / duration, 0, 1);
      // ease-out quint — يقترب بسرعة ثم يستقر
      var eased = 1 - Math.pow(1 - t, 5);
      node.textContent = Math.round(from + (target - from) * eased) + suffix;
      if (t < 1) requestAnimationFrame(frame);
      else if (options.onDone) options.onDone();
    }
    requestAnimationFrame(frame);
  }

  /* ---- Print -------------------------------------------------------------- */
  function print() {
    // انتظر إطارين حتى تستقر الرسوم قبل فتح نافذة الطباعة
    requestAnimationFrame(function () { requestAnimationFrame(function () { global.print(); }); });
  }

  ERP.ui = {
    toast: toast,
    modal: modal,
    confirm: confirm,
    picker: picker,
    ring: ring,
    countUp: countUp,
    print: print
  };
})(window);
