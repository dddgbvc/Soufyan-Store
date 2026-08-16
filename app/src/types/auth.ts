import type { LucideIcon } from 'lucide-react';

/* ==========================================================================
   العقود النوعية لمنظومة المصادقة والتهيئة
   ========================================================================== */

/** الشاشات الجذرية لبوابة الدخول. */
export type AuthView = 'login' | 'register' | 'recover' | 'success';

/** نوع المعرّف الذي أدخله المستخدم (يُستنتج تلقائيًا أثناء الكتابة). */
export type IdentifierKind = 'email' | 'phone' | 'unknown';

/** قطاع النشاط التجاري. */
export type BusinessSector = 'telecom' | 'retail' | 'services';

/** العملة الأساسية للمنظومة. */
export type Currency = 'IQD' | 'USD';

/** مفاتيح وحدات المنظومة القابلة للنشر. */
export type ModuleKey =
  | 'core'
  | 'pos'
  | 'inventory'
  | 'ledger'
  | 'crm'
  | 'purchasing'
  | 'reports';

/** تعريف وحدة قابلة للنشر ضمن معمارية المنظومة. */
export interface ErpModule {
  key: ModuleKey;
  label: string;
  description: string;
  /** عدد جداول قاعدة البيانات التي تُنشئها الوحدة. */
  tables: number;
  icon: LucideIcon;
  /** الوحدات الإلزامية لا يمكن إلغاء تحديدها. */
  required: boolean;
}

/* -------------------------- حالات النماذج -------------------------- */

export interface LoginValues {
  identifier: string;
  password: string;
  keepSignedIn: boolean;
}

export interface RegisterValues {
  /** الخطوة ١ — بيانات المسؤول */
  fullName: string;
  workEmail: string;
  masterPassword: string;
  confirmPassword: string;
  /** الخطوة ٢ — ملف المنشأة ونقاط البيع */
  companyName: string;
  sector: BusinessSector;
  currency: Currency;
  /** الخطوة ٣ — المعمارية ونشر الوحدات */
  registers: number;
  modules: ModuleKey[];
}

export interface RecoverValues {
  identifier: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
}

/** خريطة أخطاء مرتبطة بحقول النموذج، مع مفتاح عام للأخطاء الشاملة. */
export type FieldErrors<T> = Partial<Record<keyof T | 'form', string>>;

/* -------------------------- حالة الطلبات -------------------------- */

export type RequestStatus = 'idle' | 'pending' | 'success' | 'error';

/** نتيجة نجاح تُعرض في شاشة الاكتمال قبل التحويل للوحة التحكم. */
export interface SuccessPayload {
  kind: 'signed-in' | 'provisioned' | 'password-reset';
  title: string;
  message: string;
  /** أسطر ملخّص اختيارية (مثل عدد الجداول وسجلات البيع). */
  facts?: { label: string; value: string }[];
}

/* -------------------------- قياس قوة كلمة المرور -------------------------- */

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: StrengthLevel;
  label: string;
  /** نسبة مئوية لعرض الشريط (0–100). */
  percent: number;
  /** الشروط المتحققة وغير المتحققة لعرضها كقائمة إرشادية. */
  checks: { id: string; label: string; passed: boolean }[];
}
