import type { LoginValues, RecoverValues, RegisterValues } from '../types/auth';
import { normalizeDigits } from '../lib/validation';

/* ==========================================================================
   طبقة الخدمة — حدّ فاصل نظيف بين الواجهة والخادم
   --------------------------------------------------------------------------
   التنفيذ الحالي محاكاة محلية بزمن استجابة واقعي. لربط خادم حقيقي:
   استبدل `mockAuthService` بتنفيذ آخر لواجهة `AuthService` نفسها
   (مثلًا عبر fetch إلى /api/auth) دون تعديل أي مكوّن واجهة.
   ========================================================================== */

export interface AuthResult {
  ok: true;
  /** رمز الجلسة — يُخزَّن من قبل طبقة أعلى، لا داخل المكوّنات. */
  token: string;
}

export class AuthError extends Error {
  /** الحقل المسؤول عن الخطأ، لعرض الرسالة تحته مباشرة. */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'AuthError';
    this.field = field;
  }
}

export interface ProvisionSummary {
  tables: number;
  registers: number;
  ledgerAccounts: number;
  tenantId: string;
}

export interface AuthService {
  signIn(values: LoginValues): Promise<AuthResult>;
  provisionTenant(values: RegisterValues): Promise<ProvisionSummary>;
  requestOtp(identifier: string): Promise<void>;
  verifyOtp(values: Pick<RecoverValues, 'identifier' | 'otp'>): Promise<void>;
  resetPassword(values: RecoverValues): Promise<void>;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * قيم محجوزة لاختبار مسارات الخطأ في بيئة العرض:
 * - كلمة مرور `wrong-pass` ⇒ بيانات دخول غير صحيحة.
 * - رمز تحقق `000000` ⇒ رمز غير صالح.
 */
const DEMO_INVALID_PASSWORD = 'wrong-pass';
const DEMO_INVALID_OTP = '000000';

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const mockAuthService: AuthService = {
  async signIn(values) {
    await delay(950);
    if (values.password === DEMO_INVALID_PASSWORD) {
      throw new AuthError('بيانات الدخول غير صحيحة. تحقّق من المعرّف وكلمة المرور.', 'password');
    }
    return { ok: true, token: randomToken() };
  },

  async provisionTenant(values) {
    // التهيئة أطول زمنًا: إنشاء المخطط وتهيئة الدفاتر.
    await delay(1600);
    return {
      tables: 0, // يُحتسب في طبقة العرض من الوحدات المختارة
      registers: values.registers,
      ledgerAccounts: 0,
      tenantId: randomToken().slice(0, 12),
    };
  },

  async requestOtp(identifier) {
    await delay(850);
    if (!identifier.trim()) {
      throw new AuthError('تعذّر إرسال الرمز. تحقّق من المعرّف.', 'identifier');
    }
  },

  async verifyOtp({ otp }) {
    await delay(900);
    if (normalizeDigits(otp) === DEMO_INVALID_OTP) {
      throw new AuthError('الرمز غير صحيح أو انتهت صلاحيته.', 'otp');
    }
  },

  async resetPassword(values) {
    await delay(1100);
    if (values.newPassword !== values.confirmPassword) {
      throw new AuthError('كلمتا المرور غير متطابقتين.', 'confirmPassword');
    }
  },
};
