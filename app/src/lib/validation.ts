import type { IdentifierKind } from '../types/auth';

/* ==========================================================================
   التحقق من المدخلات — رسائل عربية دقيقة وواضحة
   ========================================================================== */

/** الأرقام العربية-الهندية والفارسية ⇒ أرقام لاتينية. */
const ARABIC_INDIC = /[٠-٩۰-۹]/g;

/**
 * توحيد الأرقام المدخلة: لوحات المفاتيح العربية تُنتج ٠١٢٣ بدل 0123،
 * فنحوّلها قبل أي تحقق أو إرسال حتى لا يفشل المستخدم بلا سبب مفهوم.
 */
export function normalizeDigits(value: string): string {
  return value.replace(ARABIC_INDIC, (char) => {
    const code = char.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
/** أرقام العراق: 07XXXXXXXXX محليًا أو +9647XXXXXXXXX دوليًا. */
const IRAQ_PHONE_PATTERN = /^(?:\+?964|00964|0)?7[0-9]{9}$/;

/** يستنتج نوع المعرّف أثناء الكتابة لعرض الأيقونة ولوحة المفاتيح المناسبة. */
export function detectIdentifierKind(raw: string): IdentifierKind {
  const value = normalizeDigits(raw).trim();
  if (!value) return 'unknown';
  if (value.includes('@')) return 'email';
  if (/^[+\d\s-]+$/.test(value)) return 'phone';
  return 'unknown';
}

export function isValidEmail(raw: string): boolean {
  return EMAIL_PATTERN.test(raw.trim());
}

export function isValidPhone(raw: string): boolean {
  const value = normalizeDigits(raw).replace(/[\s-]/g, '');
  return IRAQ_PHONE_PATTERN.test(value);
}

/** يخفي جزءًا من المعرّف عند عرضه في شاشة التحقق (name@ ⇒ na••@). */
export function maskIdentifier(raw: string): string {
  const value = normalizeDigits(raw).trim();
  if (!value) return '';

  if (value.includes('@')) {
    const [local, domain = ''] = value.split('@');
    const head = local.slice(0, 2);
    return `${head}${'•'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
  }

  const digits = value.replace(/[\s-]/g, '');
  return `${digits.slice(0, 4)}${'•'.repeat(Math.max(digits.length - 7, 2))}${digits.slice(-3)}`;
}

/* -------------------------- مدققات الحقول -------------------------- */

/** يعيد رسالة خطأ عربية، أو `undefined` عند الصلاحية. */
export type Validator = (value: string) => string | undefined;

export const validateIdentifier: Validator = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return 'أدخل البريد الإلكتروني أو رقم الهاتف.';

  const kind = detectIdentifierKind(trimmed);
  if (kind === 'email' && !isValidEmail(trimmed)) {
    return 'صيغة البريد الإلكتروني غير صحيحة.';
  }
  if (kind === 'phone' && !isValidPhone(trimmed)) {
    return 'رقم الهاتف غير صحيح — استخدم صيغة 07XXXXXXXXX.';
  }
  if (kind === 'unknown') {
    return 'أدخل بريدًا إلكترونيًا صالحًا أو رقم هاتف عراقي.';
  }
  return undefined;
};

export const validateEmail: Validator = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return 'البريد الإلكتروني للعمل مطلوب.';
  if (!isValidEmail(trimmed)) return 'صيغة البريد الإلكتروني غير صحيحة.';
  return undefined;
};

export const validateFullName: Validator = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return 'الاسم الكامل مطلوب.';
  if (trimmed.length < 3) return 'الاسم قصير جدًا.';
  if (!trimmed.includes(' ')) return 'أدخل الاسم الثلاثي أو الثنائي على الأقل.';
  return undefined;
};

export const validateCompanyName: Validator = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return 'اسم المنشأة مطلوب.';
  if (trimmed.length < 2) return 'اسم المنشأة قصير جدًا.';
  return undefined;
};

export const validateLoginPassword: Validator = (value) => {
  if (!value) return 'كلمة المرور مطلوبة.';
  return undefined;
};

/** كلمة المرور الرئيسية تخضع لشروط أشد من كلمة مرور الدخول. */
export const validateMasterPassword: Validator = (value) => {
  if (!value) return 'كلمة المرور الرئيسية مطلوبة.';
  if (value.length < 8) return 'يجب ألا تقل عن ٨ محارف.';
  if (!/[A-Za-z]/.test(value)) return 'أضف حرفًا لاتينيًا واحدًا على الأقل.';
  if (!/[0-9]/.test(normalizeDigits(value))) return 'أضف رقمًا واحدًا على الأقل.';
  return undefined;
};

export function validatePasswordMatch(password: string, confirmation: string): string | undefined {
  if (!confirmation) return 'أعد إدخال كلمة المرور للتأكيد.';
  if (password !== confirmation) return 'كلمتا المرور غير متطابقتين.';
  return undefined;
}

export function validateOtp(code: string): string | undefined {
  const digits = normalizeDigits(code);
  if (digits.length < 6) return 'أدخل الرمز المكوّن من ٦ أرقام.';
  if (!/^\d{6}$/.test(digits)) return 'الرمز يجب أن يتكوّن من أرقام فقط.';
  return undefined;
}
