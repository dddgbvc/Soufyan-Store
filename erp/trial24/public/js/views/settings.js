/**
 * شاشة الإعدادات — سياسة التجربة (مدير فقط).
 * كل تعديل يُحفظ على الخادم ويُسجَّل في التدقيق.
 */

import { api } from '../api.js';
import { esc, hours as hoursLabel, icon, money } from '../format.js';
import { PERM, can, store } from '../state.js';
import { emptyState, showApiError, toast } from '../ui.js';

export const title = 'الإعدادات';

export async function render(root, ctx) {
  if (!can(PERM.SETTINGS)) {
    root.innerHTML = emptyState('lock', 'الإعدادات متاحة للمدير فقط', 'صلاحية settings.manage مطلوبة.');
    return;
  }

  const s = await api.settings();

  root.innerHTML = `
    <form id="settingsForm">
      <section class="section">
        <div class="section__head">
          <div class="section__title">سياسة تجربة الجهاز</div>
          <div class="section__hint">تنطبق على التجارب الجديدة فورًا — التجارب الجارية تحتفظ بمدتها المتفق عليها.</div>
          <button type="submit" class="btn btn--primary push">${icon('check')}<span>حفظ الإعدادات</span></button>
        </div>

        <div class="settings-grid">
          <div class="card">
            <div class="card__head"><div class="card__title">${icon('clock')} المدة</div></div>
            ${numberRow('defaultDurationHours', 'المدة الافتراضية', 'مدة التجربة عند الإنشاء (ساعة)', s.defaultDurationHours, 1, 168)}
            ${numberRow('maxTotalDurationHours', 'أقصى مدة كلية', 'شاملة كل التمديدات (ساعة)', s.maxTotalDurationHours, 1, 720)}
            ${numberRow('defaultExtensionHours', 'التمديد الافتراضي', 'القيمة المقترحة في نافذة التمديد', s.defaultExtensionHours, 1, 168)}
          </div>

          <div class="card">
            <div class="card__head"><div class="card__title">${icon('extend')} التمديد</div></div>
            ${numberRow('maxExtensions', 'أقصى عدد تمديدات', 'لكل تجربة', s.maxExtensions, 0, 10)}
            ${numberRow('maxExtensionHours', 'أقصى تمديد للمرة الواحدة', 'بالساعات', s.maxExtensionHours, 1, 168)}
            ${switchRow('requireManagerApprovalForExtension', 'موافقة المدير للتمديد', 'طلب الموظف يُرفع للمدير بدل التنفيذ المباشر', s.requireManagerApprovalForExtension)}
          </div>

          <div class="card">
            <div class="card__head"><div class="card__title">${icon('bell')} التنبيهات والعتبات</div></div>
            ${numberRow('reminderBeforeMinutes', 'تذكير العميل قبل', 'بالدقائق قبل انتهاء المدة', s.reminderBeforeMinutes, 5, 1440)}
            ${numberRow('endingSoonMinutes', 'عتبة «تقترب من النهاية»', 'بالدقائق', s.endingSoonMinutes, 10, 2880)}
            ${numberRow('criticalMinutes', 'عتبة «حرِجة»', 'بالدقائق — يجب أن تكون أصغر من السابقة', s.criticalMinutes, 5, 1440)}
          </div>

          <div class="card">
            <div class="card__head"><div class="card__title">${icon('money')} العربون والبيع</div></div>
            ${switchRow('depositRequired', 'العربون إلزامي', 'يمنع إنشاء تجربة بلا عربون', s.depositRequired)}
            ${numberRow('minDepositIQD', 'الحد الأدنى للعربون', money(s.minDepositIQD), s.minDepositIQD, 0, 100000000, 5000)}
            ${numberRow('defaultWarrantyMonths', 'الضمان الافتراضي', 'بالأشهر عند تحويل التجربة إلى بيع', s.defaultWarrantyMonths, 0, 60)}
            ${numberRow('analyticsMinSample', 'أقل عيّنة للتحليلات', 'عدد القرارات المطلوب لحساب تحويل الجهاز', s.analyticsMinSample, 1, 50)}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="card">
          <div class="card__head">
            <div class="card__title">${icon('shield')} نص الشروط</div>
            <span class="card__sub push">النسخة الحالية ${esc(s.termsVersion)} — أي تعديل يرفع رقم النسخة</span>
          </div>
          <div class="field">
            <label class="field__label" for="termsText">بند في كل سطر</label>
            <textarea class="textarea" id="termsText" name="termsText" style="min-height:180px">${esc(s.termsText.join('\n'))}</textarea>
            <span class="field__hint">تُعرض على الموظف في خطوة الشروط وتُحفظ نسختها داخل كل تجربة.</span>
          </div>
        </div>
      </section>

      <div data-error-slot></div>

      <section class="section">
        <div class="glass">
          <div class="glass__body">
            <div class="row row--tight" style="margin-bottom:var(--sp-2)">${icon('users', 'icon--sm')}
              <span style="font-size:var(--fs-sm);font-weight:650">الأدوار والصلاحيات</span>
            </div>
            <div class="grid grid--2">
              ${roleCard('موظف', ['إنشاء تجربة', 'إرجاع جهاز', 'إتمام البيع'])}
              ${roleCard('مدير', ['كل صلاحيات الموظف', 'تمديد التجربة', 'إلغاء التجربة', 'تجاوز السياسة', 'التحليلات والتدقيق', 'الإعدادات'])}
            </div>
            <p style="font-size:var(--fs-2xs);color:var(--text-3);margin-top:var(--sp-3)">
              الصلاحيات مطبَّقة على الخادم في كل نقطة نهاية — إخفاء الأزرار في الواجهة راحة بصرية فقط.
            </p>
          </div>
        </div>
      </section>
    </form>`;

  const form = root.querySelector('#settingsForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') payload[el.name] = el.checked;
      else if (el.type === 'number') payload[el.name] = Number(el.value);
      else if (el.name === 'termsText') payload.termsText = el.value.split('\n').map((x) => x.trim()).filter(Boolean);
    }
    try {
      const updated = await api.saveSettings(payload);
      store.settings = updated;
      toast('حُفظت الإعدادات وسُجّلت في التدقيق.', 'ok');
      ctx.refreshShell();
    } catch (err) {
      showApiError(err, form);
    }
  });
}

function numberRow(name, label, hint, value, min, max, step = 1) {
  return `
    <div class="setting-row">
      <div class="setting-row__text">
        <span class="setting-row__title">${esc(label)}</span>
        <span class="setting-row__hint">${esc(hint)}</span>
      </div>
      <div class="setting-row__control">
        <input class="input input--mono" type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}">
      </div>
    </div>`;
}

function switchRow(name, label, hint, checked) {
  return `
    <div class="setting-row">
      <div class="setting-row__text">
        <span class="setting-row__title">${esc(label)}</span>
        <span class="setting-row__hint">${esc(hint)}</span>
      </div>
      <label class="switch setting-row__control setting-row__control--auto">
        <input type="checkbox" name="${name}" ${checked ? 'checked' : ''}>
        <span class="switch__track"></span>
      </label>
    </div>`;
}

function roleCard(role, perms) {
  return `
    <div class="card" style="background:var(--surface-3)">
      <div class="card__head" style="padding-bottom:var(--sp-3);margin-bottom:var(--sp-3)">
        <div class="card__title">${esc(role)}</div>
      </div>
      <div class="pill-list">
        ${perms.map((p) => `<span class="badge badge--muted">${esc(p)}</span>`).join('')}
      </div>
    </div>`;
}
