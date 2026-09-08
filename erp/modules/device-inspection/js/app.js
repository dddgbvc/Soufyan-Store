/* ==========================================================================
   فحص الجهاز — الإقلاع والتوجيه
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var DI = global.DI;
  var el = ERP.el;

  function buildChrome() {
    var themeBtn = el('button.btn.btn--icon.btn--ghost', {
      type: 'button', 'aria-label': 'تبديل المظهر', html: ERP.icon('moon', 18),
      onclick: function () {
        var next = ERP.theme.toggle();
        themeBtn.innerHTML = ERP.icon(isDark() ? 'sun' : 'moon', 18);
        themeBtn.setAttribute('aria-label', isDark() ? 'المظهر الفاتح' : 'المظهر الداكن');
        return next;
      }
    });

    function isDark() {
      var t = ERP.theme.get();
      return t === 'dark' || (t === 'auto' && global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    themeBtn.innerHTML = ERP.icon(isDark() ? 'sun' : 'moon', 18);

    var bar = el('header.appbar.no-print', {}, [
      el('.appbar__inner', {}, [
        el('a.appbar__brand', { href: '../../index.html', 'aria-label': 'العودة إلى لوحة ERP' }, [
          el('.appbar__mark', { html: ERP.icon('shield', 20) }),
          el('div', {}, [
            el('.appbar__title', { text: 'فحص الجهاز' }),
            el('.appbar__sub.mono', { text: 'Device Inspection · Soufyan ERP' })
          ])
        ]),
        el('.grow'),
        el('button.btn.btn--ghost.btn--sm', {
          type: 'button', html: ERP.icon('history', 15) + '<span>السجل</span>',
          onclick: function () { DI.app.router.go('history'); }
        }),
        themeBtn
      ])
    ]);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function boot() {
    // بذور البيانات المشتركة (تعمل مرة واحدة فقط)
    ERP.inventory.seed();
    ERP.customers.seed();
    ERP.staff.seed();
    DI.engine.seedHistory();

    buildChrome();

    var router = ERP.router({
      home: function () { DI.views.home(); },
      device: function (params) { DI.views.device(params[0]); },
      inspect: function (params) { DI.views.inspect(params[0]); },
      result: function (params) { DI.views.result(params[0]); },
      report: function (params) { DI.views.report(params[0]); },
      history: function (params) { DI.views.history(params[0] || null); },
      '*': function () { DI.views.home(); }
    }, { fallback: 'home' });

    DI.app = { router: router };
    router.start();

    if (!ERP.caps.secure) {
      ERP.ui.toast('بعض الفحوصات (كاميرا/مايك/موقع) تحتاج https أو localhost', 'bad', 5200);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
