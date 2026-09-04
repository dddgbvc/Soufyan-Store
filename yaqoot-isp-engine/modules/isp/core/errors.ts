/**
 * Provider error taxonomy (spec §25 / §44).
 *
 * Two audiences, deliberately separated:
 *   - `message` (Arabic) is what an operator sees. It never contains provider
 *     internals, URLs, tokens or stack traces.
 *   - `diagnostics` is administrator-only and is what the Health Center shows.
 */
export const PROVIDER_ERROR_REASONS = [
  'TIMEOUT',
  'AUTH_FAILED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'REQUIRES_MFA',
  'REQUIRES_OTP',
  'CREDENTIALS_EXPIRED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'MALFORMED_RESPONSE',
  'DUPLICATE_REQUEST',
  'PARTIAL_SUCCESS',
  'UNKNOWN_RESULT',
  'STALE_DATA',
  'UNSUPPORTED_OPERATION',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'INSUFFICIENT_FUNDS',
  'UNSUPPORTED_AUTH_METHOD',
] as const;

export type ProviderErrorReason = (typeof PROVIDER_ERROR_REASONS)[number];

/**
 * Operator-facing Arabic copy. Deliberately vague about provider internals —
 * §44 forbids showing raw provider API errors to ordinary users.
 */
const OPERATOR_MESSAGES: Record<ProviderErrorReason, string> = {
  TIMEOUT: 'تأخر رد مزود الخدمة. حاول مرة أخرى بعد قليل.',
  AUTH_FAILED: 'تعذر التحقق من الاتصال بمزود الخدمة.',
  INVALID_CREDENTIALS: 'بيانات الدخول غير صحيحة.',
  ACCOUNT_LOCKED: 'الحساب موقوف مؤقتاً لدى مزود الخدمة.',
  REQUIRES_MFA: 'يحتاج الحساب تحققاً بخطوتين لإكمال الدخول.',
  REQUIRES_OTP: 'أدخل رمز التحقق المرسل إليك.',
  CREDENTIALS_EXPIRED: 'انتهت صلاحية بيانات الدخول — سجّل الدخول من جديد.',
  RATE_LIMITED: 'طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم أعد المحاولة.',
  PROVIDER_UNAVAILABLE: 'تعذر الاتصال بمزود الخدمة حالياً. تحقق من الاتصال أو حاول مرة أخرى.',
  MALFORMED_RESPONSE: 'وصل رد غير مفهوم من مزود الخدمة. تم تسجيل الحالة للمراجعة.',
  DUPLICATE_REQUEST: 'هذه العملية منفّذة مسبقاً.',
  PARTIAL_SUCCESS: 'نُفِّذ جزء من العملية فقط. راجع التفاصيل.',
  UNKNOWN_RESULT: 'نتيجة العملية غير مؤكدة — بانتظار المطابقة.',
  STALE_DATA: 'البيانات المعروضة قديمة ولم تُحدَّث من مزود الخدمة.',
  UNSUPPORTED_OPERATION: 'هذه العملية غير مدعومة لدى مزود الخدمة المحدد.',
  VALIDATION_FAILED: 'تحقق من الحقول المدخلة.',
  NOT_FOUND: 'لا يوجد سجل مطابق لدى مزود الخدمة.',
  INSUFFICIENT_FUNDS: 'رصيد المحفظة لا يكفي لإتمام العملية.',
  UNSUPPORTED_AUTH_METHOD: 'طريقة الدخول هذه غير مدعومة في هذا الإصدار.',
};

export function operatorMessage(reason: ProviderErrorReason): string {
  return OPERATOR_MESSAGES[reason];
}

/**
 * Reasons where the operation may already have taken effect upstream.
 * These must land in REQUIRES_RECONCILIATION rather than being retried.
 */
const AMBIGUOUS_REASONS: readonly ProviderErrorReason[] = [
  'TIMEOUT',
  'UNKNOWN_RESULT',
  'MALFORMED_RESPONSE',
  'PARTIAL_SUCCESS',
];

export function isAmbiguousOutcome(reason: ProviderErrorReason): boolean {
  return AMBIGUOUS_REASONS.includes(reason);
}

export class ProviderError extends Error {
  readonly reason: ProviderErrorReason;
  readonly providerCode?: string;
  readonly httpStatus?: number;

  constructor(
    reason: ProviderErrorReason,
    options: { providerCode?: string; httpStatus?: number; cause?: unknown } = {},
  ) {
    // The Error message is the operator-safe Arabic string; internals live in
    // the typed fields so they can be redacted at the logging boundary.
    super(operatorMessage(reason));
    this.name = 'ProviderError';
    this.reason = reason;
    this.providerCode = options.providerCode;
    this.httpStatus = options.httpStatus;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/** Keys whose values must never reach a log line or the browser (§35). */
const SECRET_KEY_PATTERN =
  /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|pin|credential|private[_-]?key|otp)/i;

/**
 * Recursively redact secret-looking values. Mirrors the ERP's own
 * `scrub_secrets()` / `audit_redact()` SQL helpers so client and server agree.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[…]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redact(val, depth + 1);
  }
  return out;
}
