/* ============================================================
   providers/communication.js — طبقة الاتصال (Communication Layer)

   منطق العمل لا يعرف "واتساب" إطلاقًا؛ يعرف فقط أنه أرسل رسالة.
   أي مزوّد جديد (SMS, Telegram, Email…) يُسجَّل هنا بنفس العقد:

     {
       id, name, channel, icon,
       available() -> boolean,
       send({ to, text, meta }) -> Promise<{ ok, ref, mode, error }>
     }
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { store, util: U } = ERP;

  const registry = new Map();

  const comm = {
    /** تسجيل مزوّد اتصال */
    register(provider) {
      if (!provider || !provider.id || typeof provider.send !== 'function') {
        throw new Error('مزوّد اتصال غير صالح: يجب أن يحتوي id و send()');
      }
      registry.set(provider.id, Object.assign({
        name: provider.id,
        channel: 'generic',
        icon: 'send',
        available: () => true,
      }, provider));
      return provider.id;
    },

    unregister(id) { registry.delete(id); },
    list() { return Array.from(registry.values()); },
    get(id) { return registry.get(id) || null; },

    /** المزوّد الافتراضي حسب الإعدادات، مع تراجع آمن */
    default() {
      const wanted = store.settings().defaultProvider;
      return comm.get(wanted) || comm.list().find((p) => p.available()) || comm.list()[0] || null;
    },

    setDefault(id) {
      if (!registry.has(id)) throw new Error('مزوّد غير مسجّل: ' + id);
      store.update((s) => { s.settings.defaultProvider = id; });
    },

    /** إرسال خام عبر مزوّد محدد */
    async send({ to, text, providerId, meta = {} }) {
      const provider = (providerId && comm.get(providerId)) || comm.default();
      if (!provider) return { ok: false, error: 'لا يوجد مزوّد اتصال مسجّل' };
      if (!provider.available()) return { ok: false, error: `المزوّد ${provider.name} غير متاح حاليًا` };
      try {
        const res = await provider.send({ to, text, meta });
        return Object.assign({ ok: true, providerId: provider.id }, res);
      } catch (err) {
        return { ok: false, providerId: provider.id, error: err.message || String(err) };
      }
    },
  };

  /* ============================================================
     messaging — واجهة عالية المستوى تربط القوالب بالطلبات
     تبقى خارج منطق العمل: تُستدعى من الواجهة، وتبثّ حدثًا فقط.
     ============================================================ */
  const messaging = {
    /**
     * إرسال رسالة تخص طلبًا مسبقًا.
     * @param {object} opts {preOrderId, templateId, providerId, text}
     */
    async sendForPreOrder({ preOrderId, templateId, providerId, text }) {
      const order = store.preOrder(preOrderId);
      if (!order) return { ok: false, error: 'الطلب غير موجود' };

      const customer = store.customer(order.customerId);
      if (!customer || !U.isValidPhone(customer.phone)) {
        const res = { ok: false, error: 'رقم هاتف العميل غير صالح' };
        ERP.events.log('MESSAGE_FAILED', { preOrderId, reason: res.error });
        return res;
      }

      let body = text;
      let usedTemplate = null;
      if (body === undefined || body === null) {
        usedTemplate = ERP.templates.get(templateId || store.settings().defaultTemplateId);
        if (!usedTemplate) return { ok: false, error: 'القالب غير موجود' };
        body = ERP.templates.render(usedTemplate.body, ERP.templates.varsFromPreOrder(order)).text;
      }

      const provider = (providerId && comm.get(providerId)) || comm.default();
      const result = await comm.send({
        to: customer.phone,
        text: body,
        providerId: provider ? provider.id : null,
        meta: { preOrderId, customerId: customer.id, code: order.code },
      });

      const record = {
        id: U.uid('msg'),
        preOrderId,
        customerId: customer.id,
        providerId: result.providerId || (provider && provider.id) || null,
        channel: provider ? provider.channel : 'generic',
        to: customer.phone,
        text: body,
        templateId: usedTemplate ? usedTemplate.id : null,
        status: result.ok ? 'SENT' : 'FAILED',
        ref: result.ref || null,
        error: result.error || null,
        at: U.nowISO(),
      };
      store.update((s) => {
        s.outbox.unshift(record);
        if (s.outbox.length > 300) s.outbox.length = 300;
      });

      if (result.ok) {
        ERP.events.log('MESSAGE_SENT', {
          preOrderId, code: order.code, customerId: customer.id,
          channel: record.channel, providerId: record.providerId,
          templateId: record.templateId, ref: record.ref, messageId: record.id,
        });
      } else {
        ERP.events.log('MESSAGE_FAILED', { preOrderId, reason: result.error });
      }
      return Object.assign({}, result, { message: record });
    },

    outbox(preOrderId) {
      const all = store.state.outbox;
      return preOrderId ? all.filter((m) => m.preOrderId === preOrderId) : all;
    },
  };

  ERP.comm = comm;
  ERP.messaging = messaging;
})(window);
