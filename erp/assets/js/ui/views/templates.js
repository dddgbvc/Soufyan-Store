/* ============================================================
   ui/views/templates.js — قوالب الرسائل ومزوّدو الاتصال
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, dom, icon, ui, util: U, store, templates } = ERP;
  ERP.views = ERP.views || {};

  const vs = { selectedId: null, draft: null };

  function selected() {
    const list = templates.list();
    if (!vs.selectedId || !templates.get(vs.selectedId)) vs.selectedId = list[0] && list[0].id;
    return templates.get(vs.selectedId);
  }

  /* ---------------- قائمة القوالب ---------------- */
  function listCard() {
    const list = templates.list();
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'section-title grow' }, 'القوالب'),
        h('button', {
          class: 'btn btn-sm',
          onclick: () => {
            const t = templates.create({ name: 'قالب جديد', body: 'مرحبًا {customer_name}،\n' });
            vs.selectedId = t.id; vs.draft = null;
            ERP.app.rerender();
          },
        }, icon('plus', 14), 'جديد'),
      ),
      h('div', { class: 'card-body col gap-2' },
        ...list.map((t) => h('button', {
          class: 'stock-row', 'aria-pressed': String(t.id === vs.selectedId),
          style: { width: '100%', textAlign: 'start' },
          onclick: () => { vs.selectedId = t.id; vs.draft = null; ERP.app.rerender(); },
        },
          h('div', { class: 'avatar avatar-sm' }, icon(t.channel === 'whatsapp' ? 'whatsapp' : 'message', 14)),
          h('div', { class: 'cell-stack grow' },
            h('span', { class: 'fw-6 fs-13' }, t.name),
            h('span', { class: 'cell-sub truncate' }, t.description || t.body.split('\n')[0]),
          ),
          t.system ? h('span', { class: 'chip chip-plain fs-11' }, 'أساسي') : null,
        )),
      ),
    );
  }

  /* ---------------- المحرر ---------------- */
  function editorCard() {
    const t = selected();
    if (!t) return h('div', { class: 'card card-pad' }, ui.emptyState({ title: 'لا توجد قوالب', icon: 'message' }));

    const draft = vs.draft || { name: t.name, body: t.body, description: t.description || '' };
    const preview = h('div', { class: 'wa-bubble' });

    const bodyArea = h('textarea', {
      class: 'textarea', style: { minHeight: '190px', fontFamily: 'var(--font-ui)' },
      spellcheck: 'false',
      oninput: (e) => { draft.body = e.target.value; vs.draft = draft; paintPreview(); },
    }, draft.body);

    const nameInput = h('input', {
      class: 'input', value: draft.name,
      oninput: (e) => { draft.name = e.target.value; vs.draft = draft; },
    });

    function paintPreview() {
      const r = templates.render(draft.body, templates.sampleVars());
      dom.clear(preview);
      preview.appendChild(document.createTextNode(r.text));
      if (r.unknown.length) {
        preview.appendChild(h('div', { class: 'miss mt-2 fs-11' }, 'متغيرات غير معروفة: ' + r.unknown.join('، ')));
      }
    }
    paintPreview();

    function insertVar(key) {
      const pos = bodyArea.selectionStart || bodyArea.value.length;
      const token = '{' + key + '}';
      bodyArea.value = bodyArea.value.slice(0, pos) + token + bodyArea.value.slice(pos);
      draft.body = bodyArea.value; vs.draft = draft;
      bodyArea.focus();
      bodyArea.setSelectionRange(pos + token.length, pos + token.length);
      paintPreview();
    }

    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'section-title grow' }, 'تحرير القالب'),
        t.system ? null : h('button', {
          class: 'btn btn-sm btn-danger',
          onclick: async () => {
            const ok = await ui.confirm({ title: 'حذف القالب؟', body: t.name, confirmLabel: 'حذف', tone: 'danger' });
            if (ok) { templates.remove(t.id); vs.selectedId = null; vs.draft = null; ERP.app.rerender(); }
          },
        }, icon('trash', 14), 'حذف'),
      ),
      h('div', { class: 'card-body col gap-4' },
        ui.field('اسم القالب', nameInput),
        ui.field('نص الرسالة', bodyArea, { hint: 'استخدم المتغيرات بين قوسين — تُستبدل تلقائيًا عند الإرسال.' }),
        h('div', null,
          h('div', { class: 'd-section-title' }, 'المتغيرات المتاحة — انقر للإدراج'),
          h('div', { class: 'row wrap gap-2' },
            ...templates.VARIABLES.map((v) => h('button', {
              type: 'button', class: 'var-pill', title: v.label,
              onclick: () => insertVar(v.key),
            }, '{' + v.key + '}')),
          ),
        ),
        h('div', null,
          h('div', { class: 'd-section-title' }, 'معاينة'),
          h('div', { class: 'wa-preview' }, preview),
        ),
        h('div', { class: 'row gap-2' },
          h('button', {
            class: 'btn btn-primary',
            onclick: () => {
              templates.save(t.id, { name: draft.name, body: draft.body });
              vs.draft = null;
              ERP.events.log('TEMPLATE_UPDATED', { templateId: t.id, name: draft.name });
              ui.toast({ title: 'حُفظ القالب', tone: 'ok' });
              ERP.app.rerender();
            },
          }, icon('check', 16), 'حفظ القالب'),
          h('button', {
            class: 'btn btn-quiet',
            onclick: () => { vs.draft = null; ERP.app.rerender(); },
          }, 'تراجع'),
          h('span', { class: 'grow' }),
          h('button', {
            class: 'btn btn-quiet',
            onclick: () => {
              store.update((s) => { s.settings.defaultTemplateId = t.id; });
              ui.toast({ title: 'أصبح القالب الافتراضي', tone: 'ok' });
              ERP.app.rerender();
            },
            disabled: store.settings().defaultTemplateId === t.id,
          }, icon('check', 15),
            store.settings().defaultTemplateId === t.id ? 'القالب الافتراضي' : 'اجعله الافتراضي'),
        ),
      ),
    );
  }

  /* ---------------- مزوّدو الاتصال ---------------- */
  function providersCard() {
    const current = store.settings().defaultProvider;
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', null,
          h('div', { class: 'section-title' }, 'مزوّدو الاتصال'),
          h('div', { class: 'fs-12 t-3' }, 'قناة الإرسال مستقلة عن منطق الطلبات — يمكن استبدالها لاحقًا.'),
        ),
        icon('send', 20),
      ),
      h('div', { class: 'card-body col gap-2' },
        ...ERP.comm.list().map((p) => h('button', {
          class: 'stock-row', 'aria-pressed': String(p.id === current),
          style: { width: '100%', textAlign: 'start' },
          onclick: () => { ERP.comm.setDefault(p.id); ui.toast({ title: 'تم تغيير القناة الافتراضية', body: p.name, tone: 'ok' }); ERP.app.rerender(); },
        },
          h('span', { class: 'box' }, p.id === current ? icon('check', 12) : null),
          h('div', { class: 'cell-stack grow' },
            h('span', { class: 'fw-6 fs-13' }, p.name),
            h('span', { class: 'cell-sub' }, p.description || p.channel),
          ),
          h('span', { class: 'chip chip-plain fs-11' }, p.channel),
        )),
      ),
    );
  }

  /* ---------------- سجل الرسائل ---------------- */
  function outboxCard() {
    const msgs = ERP.messaging.outbox().slice(0, 8);
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'section-title grow' }, 'آخر الرسائل'),
        h('span', { class: 'chip chip-plain num' }, ERP.messaging.outbox().length),
      ),
      h('div', { class: 'card-body col gap-2' },
        msgs.length ? dom.frag(...msgs.map((m) => {
          const c = store.customer(m.customerId);
          return h('button', {
            class: 'mini-card col gap-1', style: { width: '100%', textAlign: 'start' },
            onclick: () => m.preOrderId && ERP.views.detail.open(m.preOrderId),
          },
            h('div', { class: 'row-between' },
              h('span', { class: 'fw-6 fs-12' }, c ? c.name : m.to),
              h('span', { class: 'cell-sub' }, U.relTime(m.at)),
            ),
            h('span', { class: 'fs-12 t-2 clamp-2' }, m.text),
            m.status === 'FAILED' ? h('span', { class: 'err-text' }, m.error) : null,
          );
        })) : h('div', { class: 'fs-13 t-3' }, 'لم تُرسل رسائل بعد.'),
      ),
    );
  }

  function render() {
    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', { class: 'page-title' }, 'قوالب الرسائل'),
          h('p', { class: 'page-sub' }, 'عدّل نصوص الإشعارات وأضف متغيّراتك — دون لمس منطق الطلبات.'),
        ),
      ),
      h('div', { class: 'tpl-grid' },
        editorCard(),
        h('div', { class: 'col gap-4' },
          listCard(),
          providersCard(),
          outboxCard(),
        ),
      ),
    );
  }

  ERP.views.templates = { render };
})(window);
