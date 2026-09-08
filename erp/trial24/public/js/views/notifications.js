/**
 * درج الإشعارات — أحداث النظام موجّهة للمستخدم الحالي،
 * ورسائل العملاء الجاهزة للإرسال عبر واتساب (قناة المتجر الفعلية).
 */

import { api } from '../api.js';
import { serverNow } from '../clock.js';
import { dateTime, esc, icon, relative } from '../format.js';
import { setUnread } from '../state.js';
import { delegate, emptyState, openDrawer, toast } from '../ui.js';

const SEVERITY_TONE = { info: 'accent', success: 'ok', warning: 'warn', critical: 'danger' };
const EVENT_ICON = {
  TRIAL_STARTED: 'plus',
  TRIAL_ENDING_SOON: 'clock',
  TRIAL_EXPIRED: 'alert',
  TRIAL_RETURNED: 'return',
  TRIAL_PURCHASED: 'bag',
  TRIAL_EXTENDED: 'extend',
  TRIAL_EXTENSION_REQUESTED: 'extend',
  TRIAL_CANCELLED: 'x',
};

export async function openNotifications(ctx) {
  let data;
  try {
    data = await api.notifications({ limit: 60 });
  } catch (err) {
    toast(err.message, 'danger');
    return;
  }

  const now = serverNow();
  const handle = openDrawer({
    title: `الإشعارات${data.unread ? ` (${data.unread} غير مقروء)` : ''}`,
    body: data.items.length
      ? `<div class="stack stack--sm" style="margin:calc(var(--sp-5) * -1)">${data.items.map((n) => noteItem(n, now)).join('')}</div>`
      : emptyState('bell', 'لا توجد إشعارات بعد', 'ستصلك هنا أحداث بدء التجارب والتذكيرات والانتهاء.'),
    footer: data.unread
      ? `<button class="btn btn--block" data-read-all>${icon('check')}<span>تعليم الكل كمقروء</span></button>`
      : '',
  });

  const root = handle.node;

  root.querySelector('[data-read-all]')?.addEventListener('click', async () => {
    await api.readAllNotifications();
    setUnread(0);
    ctx.refreshShell();
    handle.close();
    toast('عُلّمت كل الإشعارات كمقروءة.', 'ok');
  });

  delegate(root, '[data-note-trial]', 'click', (_e, el) => {
    handle.close();
    location.hash = `#/trial/${el.dataset.noteTrial}`;
  });

  delegate(root, '[data-note-read]', 'click', async (_e, el) => {
    const id = el.dataset.noteRead;
    await api.readNotification(id);
    el.closest('.note').dataset.unread = 'false';
    el.remove();
    ctx.refreshShell();
  });

  delegate(root, '[data-wa-sent]', 'click', async (_e, el) => {
    try {
      await api.markCustomerSent(el.dataset.waSent);
      el.classList.add('btn--ok');
      el.innerHTML = `${icon('check', 'icon--sm')}<span>سُجِّل الإرسال</span>`;
      el.disabled = true;
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}

function noteItem(n, now) {
  const tone = SEVERITY_TONE[n.severity] || 'muted';
  const wa = n.customerChannel;
  return `
    <article class="note" data-unread="${!n.read}">
      <div class="note__head">
        <span class="badge badge--${tone}">${icon(EVENT_ICON[n.event] || 'info', 'icon--sm')}${esc(n.eventLabel)}</span>
        <span class="note__time" title="${esc(dateTime(n.at))}">${esc(relative(n.at, now))}</span>
      </div>
      <div class="note__title">${esc(n.title)}</div>
      <div class="note__body">${esc(n.body)}</div>
      <div class="note__actions">
        ${n.trialId ? `<button class="btn btn--sm" data-note-trial="${esc(n.trialId)}">${icon('arrow', 'icon--sm')}<span>فتح التجربة</span></button>` : ''}
        ${wa?.whatsappUrl
          ? `<a class="btn btn--sm" href="${esc(wa.whatsappUrl)}" target="_blank" rel="noopener">${icon('wa', 'icon--sm')}<span>رسالة العميل</span></a>
             ${wa.sentAt
               ? `<span class="badge badge--ok">أُرسلت ${esc(relative(wa.sentAt, now))}</span>`
               : `<button class="btn btn--sm" data-wa-sent="${esc(n.id)}">${icon('check', 'icon--sm')}<span>تسجيل الإرسال</span></button>`}`
          : ''}
        ${!n.read ? `<button class="btn btn--sm btn--ghost push" data-note-read="${esc(n.id)}">تعليم كمقروء</button>` : ''}
      </div>
    </article>`;
}
