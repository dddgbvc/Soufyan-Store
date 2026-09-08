/* ============================================================
   providers/whatsapp.js — مزوّد واتساب (Click-to-Chat)

   يعتمد على رابط wa.me الرسمي — لا يحتاج أي مفاتيح أو خادم.
   لاستبداله لاحقًا بـ WhatsApp Cloud API: يكفي كتابة مزوّد
   جديد بنفس العقد وتسجيله، دون لمس منطق العمل.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const U = ERP.util;

  const whatsappProvider = {
    id: 'whatsapp',
    name: 'WhatsApp',
    channel: 'whatsapp',
    icon: 'whatsapp',
    kind: 'click-to-chat',
    description: 'يفتح محادثة واتساب جاهزة بالنص. لا يتطلب خادمًا أو مفتاح API.',

    available() { return typeof window !== 'undefined'; },

    /**
     * @param {{to:string, text:string, meta:object}} msg
     * @returns {{ok:boolean, ref:string, mode:string, url:string}}
     */
    async send({ to, text, meta }) {
      const phone = U.phoneIntl(to);
      if (!U.isValidPhone(phone)) throw new Error('رقم واتساب غير صالح');

      const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        // المتصفح منع النافذة — نعيد الرابط ليعرضه الموظف يدويًا
        const err = new Error('منع المتصفح فتح النافذة. افتح الرابط يدويًا.');
        err.url = url;
        throw err;
      }
      return {
        ref: 'wa:' + phone + ':' + Date.now().toString(36),
        mode: 'click-to-chat',
        url,
        dispatchedAt: U.nowISO(),
        context: meta || null,
      };
    },

    /** رابط جاهز بدون إرسال — للنسخ أو للزر المباشر */
    buildLink(to, text) {
      return `https://wa.me/${U.phoneIntl(to)}?text=${encodeURIComponent(text || '')}`;
    },
  };

  ERP.comm.register(whatsappProvider);
  ERP.whatsappProvider = whatsappProvider;
})(window);
