import 'server-only';

/**
 * Authentication failures are deliberately coarse. The client is told "these
 * credentials did not work" and never *why*, so the API cannot be used to probe
 * for valid employees, emails or PINs.
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'account_disabled'
  | 'account_locked'
  | 'rate_limited'
  | 'session_expired'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'csrf_failed'
  | 'weak_pin'
  | 'pin_taken'
  | 'otp_invalid'
  | 'qr_invalid'
  | 'qr_expired'
  | 'unavailable'
  | 'conflict'
  | 'server_error';

const STATUS: Record<AuthErrorCode, number> = {
  invalid_credentials: 401,
  account_disabled: 403,
  account_locked: 423,
  rate_limited: 429,
  session_expired: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  csrf_failed: 403,
  weak_pin: 400,
  pin_taken: 409,
  otp_invalid: 400,
  qr_invalid: 400,
  qr_expired: 410,
  unavailable: 503,
  conflict: 409,
  server_error: 500,
};

/** User-facing Arabic copy. Intentionally vague for every credential failure. */
const MESSAGE: Record<AuthErrorCode, string> = {
  invalid_credentials: 'بيانات الدخول غير صحيحة',
  account_disabled: 'هذا الحساب غير مفعّل. راجع المدير.',
  account_locked: 'تم إيقاف الحساب مؤقتاً بسبب محاولات متكررة',
  rate_limited: 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
  session_expired: 'انتهت الجلسة. سجّل الدخول من جديد.',
  forbidden: 'لا تملك صلاحية لهذا الإجراء',
  not_found: 'العنصر غير موجود',
  invalid_request: 'الطلب غير صالح',
  csrf_failed: 'تعذّر التحقق من الطلب. أعد تحميل الصفحة.',
  weak_pin: 'الرمز ضعيف جداً. اختر رمزاً غير متسلسل وغير مكرر.',
  pin_taken: 'هذا الرمز مستخدم من قبل موظف آخر. اختر رمزاً غيره.',
  otp_invalid: 'الرمز غير صحيح أو منتهي الصلاحية',
  qr_invalid: 'رمز الدخول غير صالح',
  qr_expired: 'انتهت صلاحية رمز الدخول. أنشئ رمزاً جديداً.',
  unavailable: 'هذه الطريقة غير متاحة حالياً',
  conflict: 'تعارض في البيانات',
  server_error: 'حدث خطأ غير متوقع. حاول مرة أخرى.',
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly retryAfter?: number;
  readonly details?: Record<string, unknown>;

  constructor(code: AuthErrorCode, options: { retryAfter?: number; details?: Record<string, unknown> } = {}) {
    super(MESSAGE[code]);
    this.name = 'AuthError';
    this.code = code;
    this.status = STATUS[code];
    this.retryAfter = options.retryAfter;
    this.details = options.details;
  }

  toJSON(): { error: AuthErrorCode; message: string; retryAfter?: number; details?: Record<string, unknown> } {
    return {
      error: this.code,
      message: this.message,
      ...(this.retryAfter !== undefined ? { retryAfter: this.retryAfter } : {}),
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export function messageFor(code: AuthErrorCode): string {
  return MESSAGE[code];
}
