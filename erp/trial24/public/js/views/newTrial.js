/**
 * شاشة إنشاء تجربة
 * Flow: العميل ← الجهاز ← IMEI/Serial ← العربون ← الشروط ← التأكيد
 *
 * لا تصوير للجهاز في أي خطوة. التحقق يتم بمطابقة IMEI/Serial المُدخل
 * مع بيانات الجهاز المسجّلة، ولقطة حالته تُؤخذ من سجل النظام نفسه.
 */

import { api } from '../api.js';
import { serverNow } from '../clock.js';
import { customerPick, devicePick } from '../components.js';
import { dateTime, durationHuman, esc, hours as hoursLabel, icon, money } from '../format.js';
import { PERM, can, store } from '../state.js';
import { delegate, formData, openModal, showApiError, toast } from '../ui.js';

const STEPS = [
  { key: 'customer', label: 'العميل' },
  { key: 'device', label: 'الجهاز' },
  { key: 'imei', label: 'IMEI / Serial' },
  { key: 'deposit', label: 'العربون' },
  { key: 'terms', label: 'الشروط' },
  { key: 'confirm', label: 'التأكيد' },
];

export const title = 'تجربة جديدة';

export async function render(root, ctx) {
  if (!can(PERM.CREATE)) {
    root.innerHTML = `<div class="card">${lockedCard()}</div>`;
    return;
  }

  const [customers, devices] = await Promise.all([api.customers(), api.devices()]);
  const settings = store.settings;

  const draft = {
    step: 0,
    customerId: null,
    deviceId: null,
    imei: '',
    deposit: settings.minDepositIQD,
    depositMethod: 'cash',
    durationHours: settings.defaultDurationHours,
    idDocumentType: '',
    idDocumentNumber: '',
    notes: '',
    termsAccepted: false,
    customerFilter: '',
    deviceFilter: '',
    submitting: false,
  };

  const customer = () => customers.find((c) => c.id === draft.customerId) || null;
  const device = () => devices.find((d) => d.id === draft.deviceId) || null;

  root.innerHTML = `
    <div class="wizard">
      <div class="card wizard__panel">
        <div class="stepper" id="stepper"></div>
        <div class="divider"></div>
        <div id="stepBody"></div>
        <div class="wizard__foot">
          <button class="btn" id="backBtn">${icon('arrow-back')}<span>السابق</span></button>
          <button class="btn btn--primary push" id="nextBtn">
            <span id="nextLabel">التالي</span>${icon('arrow')}
          </button>
        </div>
      </div>

      <aside class="wizard__aside stack">
        <div class="card">
          <div class="card__head"><div class="card__title">ملخّص التجربة</div></div>
          <div class="summary" id="summary"></div>
        </div>
        <div class="glass glass--liquid">
          <div class="glass__body stack stack--sm">
            <div class="row row--tight" style="color:var(--text-2)">
              ${icon('lock', 'icon--sm')}<span style="font-size:var(--fs-xs);font-weight:600">قواعد يفرضها الخادم</span>
            </div>
            <ul class="stack stack--sm" style="font-size:var(--fs-2xs);color:var(--text-3);line-height:1.7">
              <li>• وقت البدء والانتهاء يُحسبان من ساعة الخادم عند التأكيد.</li>
              <li>• الجهاز يُقفل فور التأكيد فلا يُباع ولا يُحجز لغير هذا العميل.</li>
              <li>• IMEI/Serial يجب أن يطابق بيانات الجهاز في النظام.</li>
              <li>• لا يُسمح بتجربتين مفتوحتين للعميل نفسه.</li>
            </ul>
          </div>
        </div>
      </aside>
    </div>`;

  const stepperEl = root.querySelector('#stepper');
  const bodyEl = root.querySelector('#stepBody');
  const summaryEl = root.querySelector('#summary');
  const backBtn = root.querySelector('#backBtn');
  const nextBtn = root.querySelector('#nextBtn');
  const nextLabel = root.querySelector('#nextLabel');

  function paintStepper() {
    stepperEl.innerHTML = STEPS.map((s, i) => {
      const state = i < draft.step ? 'done' : i === draft.step ? 'current' : 'todo';
      return `${i ? '<span class="step__line"></span>' : ''}
        <div class="step" data-state="${state}">
          <span class="step__num">${state === 'done' ? '✓' : i + 1}</span>
          <span>${esc(s.label)}</span>
        </div>`;
    }).join('');
  }

  function paintSummary() {
    const c = customer();
    const d = device();
    const start = serverNow();
    const end = start + draft.durationHours * 3600000;
    summaryEl.innerHTML = `
      ${sumRow('العميل', c ? esc(c.name) : '—')}
      ${sumRow('الجهاز', d ? `${esc(d.brand)} ${esc(d.model)}` : '—')}
      ${sumRow('IMEI', draft.imei ? `<span class="num">${esc(draft.imei)}</span>` : '—')}
      ${sumRow('المدة', hoursLabel(draft.durationHours))}
      ${sumRow('العربون', `<span class="num">${money(draft.deposit)}</span>`)}
      ${sumRow('نهاية متوقعة', `<span style="font-size:var(--fs-2xs)">${dateTime(end)}</span>`)}
      ${d ? sumRow('سعر الجهاز', `<span class="num">${money(d.price)}</span>`) : ''}`;
  }

  function paint() {
    paintStepper();
    paintSummary();
    bodyEl.innerHTML = renderStep();
    backBtn.disabled = draft.step === 0;
    const last = draft.step === STEPS.length - 1;
    nextLabel.textContent = last ? 'تأكيد وإخراج الجهاز' : 'التالي';
    nextBtn.classList.toggle('btn--ok', last);
    nextBtn.querySelector('.icon')?.remove();
    if (!last) nextBtn.insertAdjacentHTML('beforeend', icon('arrow'));
    else nextBtn.insertAdjacentHTML('beforeend', icon('check'));
    wireStep();
  }

  function renderStep() {
    switch (STEPS[draft.step].key) {
      case 'customer':
        return stepCustomer();
      case 'device':
        return stepDevice();
      case 'imei':
        return stepImei();
      case 'deposit':
        return stepDeposit();
      case 'terms':
        return stepTerms();
      default:
        return stepConfirm();
    }
  }

  // ——— الخطوات ———

  function stepCustomer() {
    const filtered = customers.filter((c) =>
      !draft.customerFilter ||
      `${c.name} ${c.phone} ${c.city || ''}`.toLowerCase().includes(draft.customerFilter.toLowerCase())
    );
    return `
      <div class="wizard__step">
        <div>
          <h3>اختر العميل</h3>
          <p class="section__hint">العميل الموقوف أو صاحب تجربة مفتوحة لا يمكن اختياره.</p>
        </div>
        <div class="row">
          <div class="search">${icon('search')}
            <input class="input" id="customerSearch" type="search" placeholder="بحث بالاسم أو الرقم" value="${esc(draft.customerFilter)}">
          </div>
          <button class="btn btn--sm" id="addCustomer">${icon('plus', 'icon--sm')}<span>عميل جديد</span></button>
        </div>
        <div class="pick-list">
          ${filtered.length
            ? filtered.map((c) => customerPick(c, { selected: c.id === draft.customerId })).join('')
            : '<p class="section__hint">لا يوجد عميل مطابق.</p>'}
        </div>
      </div>`;
  }

  function stepDevice() {
    const available = devices.filter(
      (d) =>
        (d.status === 'available' || d.id === draft.deviceId) &&
        (!draft.deviceFilter ||
          `${d.brand} ${d.model} ${d.imei} ${d.color}`.toLowerCase().includes(draft.deviceFilter.toLowerCase()))
    );
    const busy = devices.filter((d) => d.status !== 'available').length;
    return `
      <div class="wizard__step">
        <div>
          <h3>اختر الجهاز</h3>
          <p class="section__hint">تُعرض الأجهزة المتاحة فقط — ${busy} جهازًا خارج المتاح حاليًا.</p>
        </div>
        <div class="search">${icon('search')}
          <input class="input" id="deviceSearch" type="search" placeholder="بحث بالموديل أو IMEI" value="${esc(draft.deviceFilter)}">
        </div>
        <div class="pick-list">
          ${available.length
            ? available.map((d) => devicePick(d, { selected: d.id === draft.deviceId })).join('')
            : '<p class="section__hint">لا يوجد جهاز متاح مطابق للبحث.</p>'}
        </div>
      </div>`;
  }

  function stepImei() {
    const d = device();
    if (!d) return '<p class="section__hint">اختر الجهاز أولًا.</p>';
    const masked = `•••• •••• ${String(d.imei).slice(-4)}`;
    return `
      <div class="wizard__step">
        <div>
          <h3>تحقّق من IMEI / الرقم التسلسلي</h3>
          <p class="section__hint">
            اقرأ الرقم من الجهاز نفسه (*#06#) وأدخله. يجب أن يطابق المسجّل في النظام —
            هذا هو التحقق المعتمد، ولا يُطلب أي تصوير للجهاز.
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="imeiInput">IMEI أو الرقم التسلسلي <span class="req">*</span></label>
          <input class="input input--mono" id="imeiInput" inputmode="numeric" autocomplete="off"
                 placeholder="${esc(masked)}" value="${esc(draft.imei)}" data-autofocus>
          <span class="field__hint">المسجّل في النظام ينتهي بـ ${esc(String(d.imei).slice(-4))}</span>
          <span class="field__error" id="imeiError"></span>
        </div>

        <div class="card" style="background:var(--surface-3)">
          <div class="card__head" style="margin-bottom:var(--sp-3);padding-bottom:var(--sp-3)">
            <div class="card__title">حالة الجهاز المسجّلة — تُجمَّد كلقطة تسليم</div>
          </div>
          <div class="kv">
            ${kv('الموديل', `${esc(d.brand)} ${esc(d.model)}`)}
            ${kv('اللون / التخزين', `${esc(d.color)} · ${esc(d.storage)}`)}
            ${kv('صحة البطارية', `<span class="num">${d.batteryHealth}%</span>`)}
            ${kv('الدرجة الظاهرية', esc(d.cosmeticGrade))}
            ${kv('الحالة', esc(d.condition))}
            ${kv('الملحقات', esc((d.accessories || []).join('، ') || '—'))}
            ${d.conditionNotes ? kv('ملاحظات', esc(d.conditionNotes)) : ''}
          </div>
        </div>
      </div>`;
  }

  function stepDeposit() {
    const s = store.settings;
    return `
      <div class="wizard__step">
        <div>
          <h3>العربون وبيانات الضمان</h3>
          <p class="section__hint">
            ${s.depositRequired ? `الحد الأدنى ${money(s.minDepositIQD)}.` : 'العربون اختياري حسب الإعدادات.'}
            يُعاد كاملًا عند الإرجاع السليم، ويُحتسب من السعر عند الشراء.
          </p>
        </div>

        <div class="grid grid--2">
          <div class="field">
            <label class="field__label" for="depositInput">قيمة العربون ${s.depositRequired ? '<span class="req">*</span>' : ''}</label>
            <input class="input input--mono" id="depositInput" type="number" min="0" step="5000" value="${draft.deposit}" data-autofocus>
            <span class="field__hint">${money(draft.deposit)}</span>
          </div>
          <div class="field">
            <label class="field__label" for="depositMethod">طريقة الاستلام</label>
            <select class="select" id="depositMethod">
              <option value="cash" ${draft.depositMethod === 'cash' ? 'selected' : ''}>نقدًا</option>
              <option value="card" ${draft.depositMethod === 'card' ? 'selected' : ''}>بطاقة</option>
              <option value="transfer" ${draft.depositMethod === 'transfer' ? 'selected' : ''}>تحويل</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="idType">نوع الوثيقة</label>
            <select class="select" id="idType">
              <option value="">— بدون —</option>
              <option value="بطاقة موحدة" ${draft.idDocumentType === 'بطاقة موحدة' ? 'selected' : ''}>بطاقة موحدة</option>
              <option value="جواز سفر" ${draft.idDocumentType === 'جواز سفر' ? 'selected' : ''}>جواز سفر</option>
              <option value="هوية أحوال" ${draft.idDocumentType === 'هوية أحوال' ? 'selected' : ''}>هوية أحوال</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="idNumber">رقم الوثيقة</label>
            <input class="input input--mono" id="idNumber" value="${esc(draft.idDocumentNumber)}" placeholder="اختياري">
          </div>
          <div class="field">
            <label class="field__label" for="durationInput">مدة التجربة (ساعة)</label>
            <input class="input input--mono" id="durationInput" type="number" min="1" max="${s.maxTotalDurationHours}" value="${draft.durationHours}">
            <span class="field__hint">الافتراضي ${s.defaultDurationHours} ساعة — الأقصى ${s.maxTotalDurationHours}</span>
          </div>
          <div class="field">
            <label class="field__label" for="notesInput">ملاحظات</label>
            <input class="input" id="notesInput" value="${esc(draft.notes)}" placeholder="اختياري">
          </div>
        </div>
        <div data-error-slot></div>
      </div>`;
  }

  function stepTerms() {
    const s = store.settings;
    return `
      <div class="wizard__step">
        <div>
          <h3>شروط التجربة</h3>
          <p class="section__hint">النسخة ${esc(s.termsVersion)} — تُحفظ نسخة الشروط داخل سجل التجربة.</p>
        </div>
        <ul class="terms">
          ${s.termsText.map((t) => `<li>${esc(t)}</li>`).join('')}
        </ul>
        <label class="check ${draft.termsAccepted ? 'check--on' : ''}" id="termsCheck">
          <input type="checkbox" id="termsInput" ${draft.termsAccepted ? 'checked' : ''}>
          <span>
            <span class="check__text">أقرّ العميل بالشروط أعلاه وتم توضيحها له شفهيًا.</span>
            <span class="check__sub">يُسجَّل الإقرار باسم الموظف ${esc(store.user.name)} وبوقت الخادم.</span>
          </span>
        </label>
      </div>`;
  }

  function stepConfirm() {
    const c = customer();
    const d = device();
    const start = serverNow();
    const end = start + draft.durationHours * 3600000;
    return `
      <div class="wizard__step">
        <div>
          <h3>مراجعة أخيرة قبل إخراج الجهاز</h3>
          <p class="section__hint">عند التأكيد: يُقفل الجهاز، ويبدأ العدّاد من ساعة الخادم، ويصل إشعار للمدير.</p>
        </div>

        <div class="grid grid--2">
          <div class="card" style="background:var(--surface-3)">
            <div class="card__head" style="margin-bottom:var(--sp-3);padding-bottom:var(--sp-3)"><div class="card__title">العميل</div></div>
            <div class="kv">
              ${kv('الاسم', esc(c.name))}
              ${kv('الهاتف', `<span class="num">${esc(c.phone)}</span>`)}
              ${kv('المدينة', esc(c.city || '—'))}
              ${kv('الوثيقة', `${esc(draft.idDocumentType || c.idType || '—')} ${esc(draft.idDocumentNumber || c.idNumber || '')}`)}
            </div>
          </div>
          <div class="card" style="background:var(--surface-3)">
            <div class="card__head" style="margin-bottom:var(--sp-3);padding-bottom:var(--sp-3)"><div class="card__title">الجهاز</div></div>
            <div class="kv">
              ${kv('الموديل', `${esc(d.brand)} ${esc(d.model)}`)}
              ${kv('IMEI', `<span class="num">${esc(d.imei)}</span>`)}
              ${kv('السعر', `<span class="num">${money(d.price)}</span>`)}
              ${kv('البطارية', `<span class="num">${d.batteryHealth}%</span>`)}
            </div>
          </div>
        </div>

        <div class="glass">
          <div class="glass__body kv">
            ${kv('بداية التجربة', `<span class="num">${dateTime(start)}</span>`)}
            ${kv('نهاية التجربة', `<span class="num">${dateTime(end)}</span>`)}
            ${kv('المدة', durationHuman(end - start))}
            ${kv('العربون', `<span class="num">${money(draft.deposit)}</span>`)}
            ${kv('الموظف المسؤول', esc(store.user.name))}
          </div>
        </div>
        <div data-error-slot></div>
      </div>`;
  }

  // ——— ربط أحداث كل خطوة ———

  function wireStep() {
    const key = STEPS[draft.step].key;

    if (key === 'customer') {
      const search = bodyEl.querySelector('#customerSearch');
      search?.addEventListener('input', () => {
        draft.customerFilter = search.value;
        const pos = search.selectionStart;
        paint();
        const el = bodyEl.querySelector('#customerSearch');
        el.focus();
        el.setSelectionRange(pos, pos);
      });
      bodyEl.querySelector('#addCustomer')?.addEventListener('click', () => openNewCustomer());
    }

    if (key === 'device') {
      const search = bodyEl.querySelector('#deviceSearch');
      search?.addEventListener('input', () => {
        draft.deviceFilter = search.value;
        const pos = search.selectionStart;
        paint();
        const el = bodyEl.querySelector('#deviceSearch');
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    }

    if (key === 'imei') {
      const input = bodyEl.querySelector('#imeiInput');
      input?.addEventListener('input', () => {
        draft.imei = input.value.trim();
        bodyEl.querySelector('#imeiError').textContent = '';
      });
    }

    if (key === 'deposit') {
      const dep = bodyEl.querySelector('#depositInput');
      dep?.addEventListener('input', () => {
        draft.deposit = Number(dep.value) || 0;
        dep.parentElement.querySelector('.field__hint').textContent = money(draft.deposit);
        paintSummary();
      });
      bodyEl.querySelector('#depositMethod')?.addEventListener('change', (e) => (draft.depositMethod = e.target.value));
      bodyEl.querySelector('#idType')?.addEventListener('change', (e) => (draft.idDocumentType = e.target.value));
      bodyEl.querySelector('#idNumber')?.addEventListener('input', (e) => (draft.idDocumentNumber = e.target.value));
      bodyEl.querySelector('#notesInput')?.addEventListener('input', (e) => (draft.notes = e.target.value));
      bodyEl.querySelector('#durationInput')?.addEventListener('input', (e) => {
        draft.durationHours = Number(e.target.value) || store.settings.defaultDurationHours;
        paintSummary();
      });
    }

    if (key === 'terms') {
      const box = bodyEl.querySelector('#termsInput');
      box?.addEventListener('change', () => {
        draft.termsAccepted = box.checked;
        bodyEl.querySelector('#termsCheck').classList.toggle('check--on', box.checked);
      });
    }
  }

  delegate(bodyEl, '[data-pick-customer]', 'click', (_e, el) => {
    draft.customerId = el.dataset.pickCustomer;
    paint();
    setTimeout(() => goNext(), 140);
  });
  delegate(bodyEl, '[data-pick-device]', 'click', (_e, el) => {
    draft.deviceId = el.dataset.pickDevice;
    draft.imei = '';
    paint();
    setTimeout(() => goNext(), 140);
  });

  // ——— التنقّل ———

  function validateStep() {
    const key = STEPS[draft.step].key;
    if (key === 'customer' && !draft.customerId) return 'اختر العميل أولًا.';
    if (key === 'device' && !draft.deviceId) return 'اختر الجهاز أولًا.';
    if (key === 'imei') {
      const d = device();
      const normalized = draft.imei.replace(/[\s\-_.]/g, '');
      if (!normalized) return 'أدخل رقم IMEI أو الرقم التسلسلي.';
      const matches =
        normalized === String(d.imei) || normalized.toUpperCase() === String(d.serial).toUpperCase();
      if (!matches) {
        const err = bodyEl.querySelector('#imeiError');
        if (err) err.textContent = 'الرقم لا يطابق بيانات الجهاز المسجّلة في النظام.';
        return 'رقم IMEI/Serial لا يطابق الجهاز المحدد.';
      }
    }
    if (key === 'deposit') {
      const s = store.settings;
      if (s.depositRequired && draft.deposit < s.minDepositIQD) {
        return `الحد الأدنى للعربون ${money(s.minDepositIQD)}.`;
      }
      if (draft.durationHours < 1 || draft.durationHours > s.maxTotalDurationHours) {
        return `المدة يجب أن تكون بين ساعة و${s.maxTotalDurationHours} ساعة.`;
      }
    }
    if (key === 'terms' && !draft.termsAccepted) return 'يجب إقرار العميل بالشروط.';
    return null;
  }

  function goNext() {
    const error = validateStep();
    if (error) {
      toast(error, 'warn');
      return;
    }
    if (draft.step === STEPS.length - 1) return submit();
    draft.step += 1;
    paint();
  }

  backBtn.addEventListener('click', () => {
    if (draft.step === 0) return;
    draft.step -= 1;
    paint();
  });
  nextBtn.addEventListener('click', goNext);

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
      e.preventDefault();
      goNext();
    }
  });

  async function submit() {
    if (draft.submitting) return;
    draft.submitting = true;
    nextBtn.disabled = true;
    nextLabel.textContent = 'جارٍ التأكيد…';
    try {
      const trial = await api.createTrial({
        customerId: draft.customerId,
        deviceId: draft.deviceId,
        imei: draft.imei,
        deposit: draft.deposit,
        depositMethod: draft.depositMethod,
        durationHours: draft.durationHours,
        idDocumentType: draft.idDocumentType,
        idDocumentNumber: draft.idDocumentNumber,
        notes: draft.notes,
        termsAccepted: draft.termsAccepted,
      });
      toast(`بدأت التجربة ${trial.code} — أُرسل إشعار للمدير.`, 'ok', 5000);
      ctx.refreshShell();
      location.hash = `#/trial/${trial.id}`;
    } catch (err) {
      showApiError(err, bodyEl);
      draft.submitting = false;
      nextBtn.disabled = false;
      nextLabel.textContent = 'تأكيد وإخراج الجهاز';
    }
  }

  function openNewCustomer() {
    openModal({
      title: 'عميل جديد',
      sub: 'يُسجَّل في قاعدة العملاء ويصبح متاحًا فورًا',
      icon: 'users',
      body: `
        <div class="grid grid--2">
          <div class="field">
            <label class="field__label" for="ncName">الاسم <span class="req">*</span></label>
            <input class="input" id="ncName" name="name" data-autofocus required>
          </div>
          <div class="field">
            <label class="field__label" for="ncPhone">الهاتف <span class="req">*</span></label>
            <input class="input input--mono" id="ncPhone" name="phone" inputmode="tel" placeholder="07XXXXXXXXX" required>
          </div>
          <div class="field">
            <label class="field__label" for="ncCity">المدينة</label>
            <input class="input" id="ncCity" name="city" value="سامراء">
          </div>
          <div class="field">
            <label class="field__label" for="ncId">رقم الوثيقة</label>
            <input class="input input--mono" id="ncId" name="idNumber">
          </div>
        </div>
        <div data-error-slot></div>`,
      actions: [
        { label: 'إلغاء', value: null },
        { label: 'حفظ العميل', value: 'save', primary: true },
      ],
      onSubmit: async (form, close) => {
        try {
          const created = await api.createCustomer(formData(form));
          customers.unshift({ ...created, openTrialId: null, trialsCount: 0 });
          draft.customerId = created.id;
          draft.customerFilter = '';
          toast(`أُضيف العميل ${created.name}.`, 'ok');
          close('saved');
          paint();
        } catch (err) {
          showApiError(err, form);
        }
      },
    });
  }

  paint();
}

const sumRow = (k, v) => `
  <div class="summary__row"><span class="summary__k">${esc(k)}</span><span class="summary__v">${v}</span></div>`;

const kv = (k, v) => `<div class="kv__row"><span class="kv__k">${esc(k)}</span><span class="kv__v">${v}</span></div>`;

const lockedCard = () => `
  <div class="empty">
    <div class="empty__icon">${icon('lock', 'icon--lg')}</div>
    <div class="empty__title">لا تملك صلاحية إنشاء تجربة</div>
    <div style="font-size:var(--fs-xs)">تواصل مع المدير لمنحك صلاحية trial.create.</div>
  </div>`;
