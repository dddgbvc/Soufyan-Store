/* ============================================================
   providers/mock.js — مزوّدان بديلان يثبتان قابلية الاستبدال

   1) copy : ينسخ الرسالة إلى الحافظة (مفيد لأي قناة يدوية)
   2) log  : يسجّل الرسالة فقط — للتجربة والاختبار دون إزعاج
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const U = ERP.util;

  ERP.comm.register({
    id: 'copy',
    name: 'نسخ النص',
    channel: 'manual',
    icon: 'edit',
    kind: 'manual',
    description: 'ينسخ الرسالة جاهزة إلى الحافظة لإرسالها بأي وسيلة.',
    available() { return true; },
    async send({ to, text }) {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove();
        }
      } catch (err) {
        throw new Error('تعذّر النسخ إلى الحافظة');
      }
      return { ref: 'copy:' + Date.now().toString(36), mode: 'clipboard', to };
    },
  });

  ERP.comm.register({
    id: 'log',
    name: 'سجل فقط (اختبار)',
    channel: 'debug',
    icon: 'activity',
    kind: 'noop',
    description: 'لا يرسل شيئًا — يسجّل الرسالة في السجل فقط.',
    available() { return true; },
    async send({ to, text, meta }) {
      console.info('[comm:log]', { to, text, meta, at: U.nowISO() });
      return { ref: 'log:' + Date.now().toString(36), mode: 'noop' };
    },
  });
})(window);
