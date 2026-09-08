/**
 * شاشة تفاصيل التجربة — العدّاد هو البطل البصري،
 * ومنها تُنفَّذ الإجراءات الثلاثة: شراء / إرجاع / تمديد (+ إلغاء للمدير).
 */

import { api } from '../api.js';
import { serverNow } from '../clock.js';
import { bindCountdownHero, countdownHero, factCell, statusBadge } from '../components.js';
import {
  dateTime,
  dayLabel,
  durationHuman,
  esc,
  hours as hoursLabel,
  icon,
  money,
  relative,
  timeOnly,
} from '../format.js';
import { PERM, can, store } from '../state.js';
import { confirmDialog, delegate, emptyState, formData, openModal, showApiError, toast } from '../ui.js';

export const title = 'تفاصيل التجربة';

const AUDIT_TONE = {
  TRIAL_CREATE: 'accent',
  DEVICE_RELEASE: 'accent',
  REMINDER_SENT: 'warn',
  TRIAL_EXPIRE: 'danger',
  TRIAL_RETURN: 'ok',
  TRIAL_PURCHASE: 'ok',
  TRIAL_EXTENSION: 'warn',
  EXTENSION_REQUESTED: 'warn',
  EXTENSION_REJECTED: 'danger',
  TRIAL_CANCEL: 'danger',
  POLICY_OVERRIDE: 'danger',
};
const AUDIT_ICON = {
  TRIAL_CREATE: 'plus',
  DEVICE_RELEASE: 'device',
  REMINDER_SENT: 'bell',
  TRIAL_EXPIRE: 'alert',
  TRIAL_RETURN: 'return',
  TRIAL_PURCHASE: 'bag',
  TRIAL_EXTENSION: 'extend',
  EXTENSION_REQUESTED: 'extend',
  EXTENSION_REJECTED: 'x',
  TRIAL_CANCEL: 'x',
  POLICY_OVERRIDE: 'shield',
};

export async function render(root, ctx, params) {
  const data = await api.trial(params.id);
  const { trial, device, customer, sale, audit, extensionRequests, canManage } = data;
  const now = serverNow();
  const pending = extensionRequests.find((r) => r.status === 'pending');

  root.innerHTML = `
    <div class="row" style="margin-bottom:var(--sp-4)">
      <button class="btn btn--ghost btn--sm" data-back>${icon('arrow-back', 'icon--sm')}<span>رجوع</span></button>
      <div class="row row--tight">
        <h2 class="num">${esc(trial.code)}</h2>
        ${statusBadge(trial)}
        ${trial.extensionsUsed ? `<span class="badge badge--warn">${trial.extensionsUsed} تمديد</span>` : ''}
        ${trial.saleId ? `<span class="badge badge--violet">${esc(trial.saleId)}</span>` : ''}
      </div>
    </div>

    ${pending ? pendingBanner(pending) : ''}

    <div class="detail">
      <div class="stack">
        <!-- العدّاد -->
        <section class="detail__hero glass glass--liquid">
          <div class="detail__hero-top">
            <div>
              <div class="card__title">${esc(trial.deviceName)}</div>
              <div class="card__sub num">IMEI ${esc(trial.imei)}</div>
            </div>
            <div class="push row row--tight">
              <span class="badge badge--muted">${esc(customer.name)}</span>
            </div>
          </div>

          <div class="detail__hero-body">${countdownHero(trial)}</div>

          <div class="detail__facts">
            ${factCell('البداية', `<span class="num">${timeOnly(trial.startAt)}</span> · ${esc(dayLabel(trial.startAt, now))}`)}
            ${factCell('النهاية', `<span class="num">${timeOnly(trial.endAt)}</span> · ${esc(dayLabel(trial.endAt, now))}`)}
            ${factCell('المدة الأساسية', hoursLabel(trial.baseDurationHours))}
            ${factCell('العربون', `<span class="num">${money(trial.deposit)}</span>`)}
            ${factCell('الموظف', esc(trial.employeeName))}
          </div>

          ${trial.isOpen ? actionsBar(canManage, pending) : closedBar(trial, sale)}
        </section>

        <!-- الخط الزمني -->
        <section class="card">
          <div class="card__head">
            <div class="card__title">${icon('history')} مسار التجربة</div>
            <span class="card__sub push">${audit.length === 1 ? 'حدث واحد مسجّل' : audit.length === 2 ? 'حدثان مسجّلان' : `${audit.length} أحداث مسجّلة`}</span>
          </div>
          <div class="timeline">
            ${audit
              .slice()
              .sort((a, b) => a.at - b.at)
              .map((a) => timelineItem(a, now))
              .join('')}
          </div>
        </section>
      </div>

      <!-- العمود الجانبي -->
      <aside class="stack">
        <section class="card">
          <div class="card__head"><div class="card__title">العميل</div></div>
          <div class="kv">
            ${kv('الاسم', esc(customer.name))}
            ${kv('الهاتف', `<span class="num">${esc(customer.phone)}</span>`)}
            ${kv('المدينة', esc(customer.city || '—'))}
            ${kv('الوثيقة', `${esc(trial.idDocument?.type || customer.idType || '—')} <span class="num">${esc(trial.idDocument?.number || customer.idNumber || '')}</span>`)}
          </div>
          ${customer.phone ? `<a class="btn btn--sm btn--block" style="margin-top:var(--sp-3)" target="_blank" rel="noopener"
              href="https://wa.me/964${esc(String(customer.phone).replace(/\D/g, '').replace(/^0/, ''))}">
              ${icon('wa', 'icon--sm')}<span>مراسلة عبر واتساب</span></a>` : ''}
        </section>

        <section class="card">
          <div class="card__head"><div class="card__title">لقطة حالة الجهاز عند التسليم</div></div>
          <p class="card__sub" style="margin-bottom:var(--sp-3)">
            مأخوذة من سجل النظام وقت الإخراج — تُقارَن بها الحالة عند الإرجاع. لا تُستخدم أي صور.
          </p>
          <div class="kv">
            ${kv('اللون / التخزين', `${esc(trial.deviceSnapshot.color)} · ${esc(trial.deviceSnapshot.storage)}`)}
            ${kv('صحة البطارية', `<span class="num">${trial.deviceSnapshot.batteryHealth}%</span>`)}
            ${kv('الدرجة الظاهرية', esc(trial.deviceSnapshot.cosmeticGrade))}
            ${kv('الملحقات', esc((trial.deviceSnapshot.accessories || []).join('، ') || '—'))}
            ${kv('وقت اللقطة', `<span style="font-size:var(--fs-2xs)">${dateTime(trial.deviceSnapshot.takenAt)}</span>`)}
          </div>
          <button class="btn btn--sm btn--block" style="margin-top:var(--sp-3)" data-device="${esc(device.id)}">
            ${icon('device', 'icon--sm')}<span>سجل الجهاز الكامل</span>
          </button>
        </section>

        ${trial.extensions.length ? extensionsCard(trial) : ''}
        ${trial.returnCheck ? returnCard(trial) : ''}
        ${sale ? saleCard(sale) : ''}

        <section class="glass">
          <div class="glass__body">
            <div class="row row--tight" style="margin-bottom:var(--sp-2)">
              ${icon('clock', 'icon--sm')}<span style="font-size:var(--fs-xs);font-weight:600">مرجع الوقت</span>
            </div>
            <p style="font-size:var(--fs-2xs);color:var(--text-3);line-height:1.7">
              بداية التجربة ونهايتها مخزّنتان على الخادم. تحديث الصفحة أو فتحها من جهاز آخر
              أو تغيير ساعة الجهاز لا يُعيد ضبط العدّاد.
            </p>
          </div>
        </section>
      </aside>
    </div>`;

  // العدّاد الحيّ
  const unbind = bindCountdownHero(root, trial, {
    onExpire: () => {
      toast('انتهت مدة هذه التجربة — يجري تحديث الحالة من الخادم.', 'warn');
      setTimeout(() => ctx.reload(), 1500);
    },
  });
  ctx.onLeave(unbind);

  // ——— الإجراءات ———
  root.querySelector('[data-back]')?.addEventListener('click', () => history.back());
  delegate(root, '[data-device]', 'click', (_e, el) => {
    location.hash = `#/device/${el.dataset.device}`;
  });

  delegate(root, '[data-action="purchase"]', 'click', () => openPurchase(trial, device, ctx));
  delegate(root, '[data-action="return"]', 'click', () => openReturn(trial, device, ctx));
  delegate(root, '[data-action="extend"]', 'click', () => openExtend(trial, ctx));
  delegate(root, '[data-action="cancel"]', 'click', () => openCancel(trial, ctx));
  delegate(root, '[data-approve]', 'click', (_e, el) => decideExtension(el.dataset.approve, true, ctx));
  delegate(root, '[data-reject]', 'click', (_e, el) => decideExtension(el.dataset.reject, false, ctx));
}

// ——————————————————————— القطع ———————————————————————

const kv = (k, v) => `<div class="kv__row"><span class="kv__k">${esc(k)}</span><span class="kv__v">${v}</span></div>`;

function actionsBar(canManage, pending) {
  return `
    <div class="actions-bar">
      ${canManage.purchase ? `<button class="btn btn--primary" data-action="purchase">${icon('bag')}<span>شراء الجهاز</span></button>` : ''}
      ${canManage.return ? `<button class="btn btn--ok" data-action="return">${icon('return')}<span>إرجاع الجهاز</span></button>` : ''}
      ${!pending ? `<button class="btn btn--warn" data-action="extend">${icon('extend')}<span>${can(PERM.EXTEND) ? 'تمديد التجربة' : 'طلب تمديد'}</span></button>` : ''}
      ${canManage.cancel ? `<button class="btn btn--danger push" data-action="cancel">${icon('x')}<span>إلغاء</span></button>` : ''}
    </div>`;
}

function closedBar(trial, sale) {
  const text = {
    returned: 'أُرجع الجهاز إلى المخزون وأُغلقت التجربة.',
    purchased: `تحوّلت التجربة إلى بيع${sale ? ` — الفاتورة ${sale.id}` : ''}.`,
    cancelled: `أُلغيت التجربة${trial.cancelReason ? ` — ${trial.cancelReason}` : ''}.`,
  }[trial.status];
  return `
    <div class="actions-bar" style="color:var(--text-2);font-size:var(--fs-xs)">
      ${icon('check')}<span>${esc(text || 'التجربة مغلقة.')}</span>
      <span class="push num" style="color:var(--text-3)">${dateTime(trial.closedAt)}</span>
    </div>`;
}

function pendingBanner(request) {
  const isManager = can(PERM.EXTEND);
  return `
    <div class="glass glass--liquid" style="margin-bottom:var(--sp-4);border-color:var(--warn)">
      <div class="glass__body row">
        <span class="metric__icon" style="--tone:var(--warn);--tone-soft:var(--warn-soft)">${icon('extend')}</span>
        <div style="min-width:0">
          <div style="font-weight:650;font-size:var(--fs-sm)">طلب تمديد ${esc(request.hours)} ساعة بانتظار موافقة المدير</div>
          <div style="font-size:var(--fs-2xs);color:var(--text-3)">
            من ${esc(request.requestedByName)} · ${esc(request.reason)}
          </div>
        </div>
        ${isManager
          ? `<div class="row row--tight push">
              <button class="btn btn--ok btn--sm" data-approve="${esc(request.id)}">${icon('check', 'icon--sm')}<span>اعتماد</span></button>
              <button class="btn btn--danger btn--sm" data-reject="${esc(request.id)}">${icon('x', 'icon--sm')}<span>رفض</span></button>
            </div>`
          : '<span class="badge badge--warn push">بانتظار المدير</span>'}
      </div>
    </div>`;
}

function timelineItem(a, now) {
  const tone = AUDIT_TONE[a.action] || '';
  const iconName = AUDIT_ICON[a.action] || 'info';
  const statusChange =
    a.oldStatus || a.newStatus
      ? `<span class="audit-row__status">${esc(a.oldStatus || '—')} <span class="audit-row__arrow">←</span> ${esc(a.newStatus || '—')}</span>`
      : '';
  return `
    <div class="tl-item">
      <span class="tl-dot ${tone ? `tl-dot--${tone}` : ''}">${icon(iconName, 'icon--sm')}</span>
      <div class="tl-body">
        <div class="tl-title">${esc(a.actionLabel)}</div>
        <div class="tl-meta">
          ${esc(a.actorName)} · ${esc(dateTime(a.at))} · ${esc(relative(a.at, now))}
          ${statusChange}
        </div>
        ${a.reason ? `<div class="tl-note">${esc(a.reason)}</div>` : ''}
        ${metaNote(a)}
      </div>
    </div>`;
}

function metaNote(a) {
  const m = a.meta || {};
  const bits = [];
  if (a.action === 'TRIAL_EXTENSION') bits.push(`+${m.hours} ساعة — النهاية الجديدة ${dateTime(m.newEndAt)}`);
  if (a.action === 'TRIAL_PURCHASE') bits.push(`${m.saleId} · ${money(m.salePrice)}`);
  if (a.action === 'TRIAL_RETURN' && m.conditionIssue) bits.push('سُجِّلت ملاحظة على حالة الجهاز عند الاستلام');
  if (a.action === 'TRIAL_RETURN' && m.lateBy > 0) bits.push(`تأخّر ${durationHuman(m.lateBy)} عن الموعد`);
  if (a.action === 'REMINDER_SENT') bits.push('أُرسل تذكير للعميل والموظفين');
  return bits.length ? `<div class="tl-note">${esc(bits.join(' · '))}</div>` : '';
}

function extensionsCard(trial) {
  return `
    <section class="card">
      <div class="card__head"><div class="card__title">التمديدات (${trial.extensions.length})</div></div>
      <div class="stack stack--sm">
        ${trial.extensions
          .map(
            (e, i) => `
          <div style="padding:var(--sp-3);background:var(--surface-3);border-radius:var(--r-md)">
            <div class="row row--tight" style="font-size:var(--fs-xs);font-weight:600">
              <span>التمديد ${i + 1}</span>
              <span class="badge badge--warn">+${e.hours} ساعة</span>
              ${e.override ? '<span class="badge badge--danger">تجاوز سياسة</span>' : ''}
            </div>
            <div style="font-size:var(--fs-2xs);color:var(--text-3);margin-top:4px">
              ${esc(e.byName)} · ${esc(dateTime(e.at))}<br>${esc(e.reason)}
            </div>
          </div>`
          )
          .join('')}
      </div>
    </section>`;
}

function returnCard(trial) {
  const r = trial.returnCheck;
  const labels = {
    powersOn: 'يعمل ويُقلع',
    imeiVerified: 'IMEI مطابق',
    accessoriesComplete: 'الملحقات كاملة',
    noNewDamage: 'لا ضرر جديد',
    functionalOk: 'الوظائف سليمة',
  };
  return `
    <section class="card">
      <div class="card__head"><div class="card__title">فحص الاستلام</div></div>
      <div class="pill-list" style="margin-bottom:var(--sp-3)">
        ${Object.entries(labels)
          .map(([k, label]) => `<span class="badge badge--${r.checks[k] ? 'ok' : 'danger'}">${r.checks[k] ? '✓' : '✕'} ${esc(label)}</span>`)
          .join('')}
      </div>
      <div class="kv">
        ${kv('المستلم', esc(r.byName))}
        ${kv('وقت الاستلام', `<span style="font-size:var(--fs-2xs)">${dateTime(r.at)}</span>`)}
        ${r.lateBy > 0 ? kv('التأخير', durationHuman(r.lateBy)) : ''}
        ${kv('العربون المُعاد', `<span class="num">${money(trial.depositRefunded)}</span>`)}
        ${trial.depositDeduction ? kv('استقطاع', `<span class="num">${money(trial.depositDeduction)}</span>`) : ''}
      </div>
      ${r.issueNotes ? `<div class="tl-note" style="margin-top:var(--sp-3)">${esc(r.issueNotes)}</div>` : ''}
    </section>`;
}

function saleCard(sale) {
  return `
    <section class="card" style="border-color:var(--violet)">
      <div class="card__head"><div class="card__title">${icon('bag')} فاتورة البيع</div></div>
      <div class="kv">
        ${kv('رقم الفاتورة', `<span class="num">${esc(sale.id)}</span>`)}
        ${kv('التجربة المرتبطة', `<span class="num">${esc(sale.trialCode)}</span>`)}
        ${kv('السعر', `<span class="num">${money(sale.salePrice)}</span>`)}
        ${sale.discount ? kv('الخصم', `<span class="num">${money(sale.discount)}</span>`) : ''}
        ${kv('العربون المُحتسب', `<span class="num">${money(sale.depositApplied)}</span>`)}
        ${kv('المتبقي', `<span class="num">${money(sale.balanceDue)}</span>`)}
        ${kv('البائع', esc(sale.employeeName))}
        ${kv('التاريخ', `<span style="font-size:var(--fs-2xs)">${dateTime(sale.soldAt)}</span>`)}
      </div>
    </section>`;
}

// ——————————————————————— النوافذ ———————————————————————

function imeiField(device, id = 'imeiConfirm') {
  return `
    <div class="field">
      <label class="field__label" for="${id}">تأكيد IMEI/Serial <span class="req">*</span></label>
      <input class="input input--mono" id="${id}" name="imei" data-autofocus autocomplete="off"
             placeholder="ينتهي بـ ${esc(String(device.imei).slice(-4))}">
      <span class="field__hint">يُطابَق مع بيانات الجهاز في النظام — بديل إثبات التصوير.</span>
    </div>`;
}

function openPurchase(trial, device, ctx) {
  const price = device.price;
  openModal({
    title: 'تحويل التجربة إلى بيع',
    sub: `${trial.code} — ${trial.deviceName}`,
    icon: 'bag',
    wide: true,
    body: `
      ${imeiField(device)}
      <div class="grid grid--2">
        <div class="field">
          <label class="field__label" for="salePrice">سعر البيع</label>
          <input class="input input--mono" id="salePrice" name="salePrice" type="number" value="${price}" min="1">
        </div>
        <div class="field">
          <label class="field__label" for="discount">الخصم</label>
          <input class="input input--mono" id="discount" name="discount" type="number" value="0" min="0">
        </div>
        <div class="field">
          <label class="field__label" for="paidNow">المدفوع الآن (عدا العربون)</label>
          <input class="input input--mono" id="paidNow" name="paidNow" type="number" value="${Math.max(0, price - trial.deposit)}" min="0">
        </div>
        <div class="field">
          <label class="field__label" for="paymentMethod">طريقة الدفع</label>
          <select class="select" id="paymentMethod" name="paymentMethod">
            <option value="cash">نقدًا</option>
            <option value="card">بطاقة</option>
            <option value="installment">أقساط</option>
          </select>
        </div>
      </div>
      <label class="check">
        <input type="checkbox" name="applyDeposit" checked>
        <span>
          <span class="check__text">احتساب العربون ${money(trial.deposit)} من قيمة الفاتورة</span>
          <span class="check__sub">يُخصم من المبلغ المطلوب ويُقفل سجل العربون.</span>
        </span>
      </label>
      <div class="field">
        <label class="field__label" for="warranty">الضمان (أشهر)</label>
        <input class="input input--mono" id="warranty" name="warrantyMonths" type="number" value="${store.settings.defaultWarrantyMonths}" min="0">
      </div>
      <div data-error-slot></div>`,
    actions: [
      { label: 'إلغاء', value: null },
      { label: 'تأكيد البيع', value: 'buy', primary: true },
    ],
    onSubmit: async (form, close) => {
      try {
        const payload = formData(form);
        const res = await api.purchaseTrial(trial.id, payload);
        close('done');
        toast(`تم البيع — الفاتورة ${res.sale.id}`, 'ok', 5000);
        ctx.refreshShell();
        ctx.reload();
      } catch (err) {
        showApiError(err, form);
      }
    },
  });
}

function openReturn(trial, device, ctx) {
  const snap = trial.deviceSnapshot;
  openModal({
    title: 'استلام الجهاز وإغلاق التجربة',
    sub: `${trial.code} — ${trial.deviceName}`,
    icon: 'return',
    tone: 'var(--ok)',
    toneSoft: 'var(--ok-soft)',
    wide: true,
    body: `
      ${imeiField(device)}
      <div>
        <div class="field__label" style="margin-bottom:var(--sp-2)">فحص الحالة مقارنة بلقطة التسليم</div>
        <p class="field__hint" style="margin-bottom:var(--sp-3)">
          المرجع: بطارية ${snap.batteryHealth}% · درجة ${esc(snap.cosmeticGrade)} · ملحقات: ${esc((snap.accessories || []).join('، ') || '—')}
        </p>
        <div class="stack stack--sm">
          ${checkRow('powersOn', 'الجهاز يعمل ويُقلع بشكل طبيعي')}
          ${checkRow('functionalOk', 'الوظائف الأساسية سليمة (شاشة، كاميرا، صوت، شحن)')}
          ${checkRow('accessoriesComplete', 'الملحقات مُعادة كاملة')}
          ${checkRow('noNewDamage', 'لا يوجد ضرر جديد مقارنة بحالة التسليم')}
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="issueNotes">ملاحظات الفرق عن حالة التسليم</label>
        <textarea class="textarea" id="issueNotes" name="issueNotes" placeholder="تُطلب إلزاميًا عند وجود أي فحص غير مطابق"></textarea>
      </div>
      <div class="grid grid--2">
        <div class="field">
          <label class="field__label" for="deduction">استقطاع من العربون</label>
          <input class="input input--mono" id="deduction" name="depositDeduction" type="number" value="0" min="0" max="${trial.deposit}">
          <span class="field__hint">العربون ${money(trial.deposit)} — يُعاد الباقي للعميل.</span>
        </div>
        <label class="check" style="align-self:end">
          <input type="checkbox" name="sendToMaintenance">
          <span><span class="check__text">تحويل الجهاز إلى الصيانة بدل المخزون</span></span>
        </label>
      </div>
      <div data-error-slot></div>`,
    actions: [
      { label: 'إلغاء', value: null },
      { label: 'تأكيد الاستلام', value: 'return', primary: true },
    ],
    onSubmit: async (form, close) => {
      try {
        await api.returnTrial(trial.id, formData(form));
        close('done');
        toast('تم استلام الجهاز وإعادته للمخزون.', 'ok');
        ctx.refreshShell();
        ctx.reload();
      } catch (err) {
        showApiError(err, form);
      }
    },
  });
}

function checkRow(name, label) {
  return `
    <label class="check check--on">
      <input type="checkbox" name="${name}" checked>
      <span class="check__text">${esc(label)}</span>
    </label>`;
}

function openExtend(trial, ctx) {
  const s = store.settings;
  const isManager = can(PERM.EXTEND);
  const canOverride = can(PERM.OVERRIDE);
  const left = trial.extensionsLeft;

  openModal({
    title: isManager ? 'تمديد التجربة' : 'طلب تمديد',
    sub: `${trial.code} — التمديدات المستخدمة ${trial.extensionsUsed} من ${s.maxExtensions}`,
    icon: 'extend',
    tone: 'var(--warn)',
    toneSoft: 'var(--warn-soft)',
    body: `
      ${!isManager && s.requireManagerApprovalForExtension
        ? `<div class="badge badge--warn" style="white-space:normal;padding:8px 12px;line-height:1.6">
             ${icon('info', 'icon--sm')}<span>سياسة المتجر تشترط موافقة المدير — سيُرفع طلبك ويصله إشعار فوري.</span>
           </div>`
        : ''}
      <div class="field">
        <label class="field__label" for="extHours">مدة التمديد (ساعة) <span class="req">*</span></label>
        <input class="input input--mono" id="extHours" name="hours" type="number" data-autofocus
               value="${s.defaultExtensionHours}" min="1" max="${s.maxExtensionHours}">
        <span class="field__hint">
          الأقصى للمرة الواحدة ${s.maxExtensionHours} ساعة · المدة الكلية لا تتجاوز ${s.maxTotalDurationHours} ساعة
          ${left > 0 ? ` · متبقٍ ${left} تمديد` : ' · لم يتبقَ تمديد ضمن السياسة'}
        </span>
      </div>
      <div class="field">
        <label class="field__label" for="extReason">سبب التمديد <span class="req">*</span></label>
        <textarea class="textarea" id="extReason" name="reason" required placeholder="مثال: العميل يريد تجربة البطارية ليوم عمل كامل"></textarea>
      </div>
      ${canOverride
        ? `<label class="check">
             <input type="checkbox" name="override" id="overrideBox">
             <span>
               <span class="check__text">تجاوز حدود السياسة (صلاحية مدير)</span>
               <span class="check__sub">يُسجَّل في التدقيق باسمك مع السبب.</span>
             </span>
           </label>
           <div class="field" id="overrideReasonField" hidden>
             <label class="field__label" for="overrideReason">سبب التجاوز <span class="req">*</span></label>
             <input class="input" id="overrideReason" name="overrideReason">
           </div>`
        : ''}
      <div data-error-slot></div>`,
    actions: [
      { label: 'إلغاء', value: null },
      { label: isManager ? 'تمديد الآن' : 'إرسال الطلب', value: 'extend', primary: true },
    ],
    onSubmit: async (form, close) => {
      try {
        const res = await api.extendTrial(trial.id, formData(form));
        close('done');
        if (res.status === 'pending_approval') {
          toast('أُرسل طلب التمديد إلى المدير.', 'info', 5000);
        } else {
          toast('تم التمديد وتحديث موعد النهاية.', 'ok');
        }
        ctx.refreshShell();
        ctx.reload();
      } catch (err) {
        showApiError(err, form);
      }
    },
  });

  const box = document.querySelector('#overrideBox');
  box?.addEventListener('change', () => {
    document.querySelector('#overrideReasonField').hidden = !box.checked;
  });
}

function openCancel(trial, ctx) {
  openModal({
    title: 'إلغاء التجربة',
    sub: `${trial.code} — إجراء إداري يُسجَّل في التدقيق`,
    icon: 'alert',
    tone: 'var(--danger)',
    toneSoft: 'var(--danger-soft)',
    body: `
      <div class="field">
        <label class="field__label" for="cancelReason">سبب الإلغاء <span class="req">*</span></label>
        <textarea class="textarea" id="cancelReason" name="reason" data-autofocus required></textarea>
      </div>
      <label class="check check--on">
        <input type="checkbox" name="deviceReturned" checked>
        <span><span class="check__text">الجهاز عاد إلى المتجر (يُعاد للمخزون)</span></span>
      </label>
      <label class="check check--on">
        <input type="checkbox" name="refundDeposit" checked>
        <span><span class="check__text">إعادة العربون ${money(trial.deposit)} للعميل</span></span>
      </label>
      <div data-error-slot></div>`,
    actions: [
      { label: 'تراجع', value: null },
      { label: 'تأكيد الإلغاء', value: 'cancel', danger: true },
    ],
    onSubmit: async (form, close) => {
      try {
        await api.cancelTrial(trial.id, formData(form));
        close('done');
        toast('أُلغيت التجربة.', 'warn');
        ctx.refreshShell();
        ctx.reload();
      } catch (err) {
        showApiError(err, form);
      }
    },
  });
}

async function decideExtension(requestId, approve, ctx) {
  if (approve) {
    const ok = await confirmDialog({
      title: 'اعتماد التمديد',
      message: 'سيُمدَّد موعد انتهاء التجربة فورًا ويصل إشعار للعميل والموظفين.',
      confirmLabel: 'اعتماد',
    });
    if (!ok) return;
    try {
      await api.approveExtension(requestId, {});
      toast('اعتُمد التمديد.', 'ok');
      ctx.refreshShell();
      ctx.reload();
    } catch (err) {
      showApiError(err);
    }
    return;
  }

  openModal({
    title: 'رفض طلب التمديد',
    icon: 'x',
    tone: 'var(--danger)',
    toneSoft: 'var(--danger-soft)',
    body: `
      <div class="field">
        <label class="field__label" for="rejectNote">سبب الرفض <span class="req">*</span></label>
        <textarea class="textarea" id="rejectNote" name="note" data-autofocus required></textarea>
      </div>
      <div data-error-slot></div>`,
    actions: [
      { label: 'تراجع', value: null },
      { label: 'رفض الطلب', value: 'reject', danger: true },
    ],
    onSubmit: async (form, close) => {
      try {
        await api.rejectExtension(requestId, formData(form));
        close('done');
        toast('رُفض طلب التمديد.', 'warn');
        ctx.refreshShell();
        ctx.reload();
      } catch (err) {
        showApiError(err, form);
      }
    },
  });
}
