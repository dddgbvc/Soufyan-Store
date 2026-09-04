import type { FieldDefinition } from '../../core/types';
import type { ProviderErrorReason } from '../../core/errors';

/**
 * Provider authentication contract (spec §42).
 *
 * The frontend never learns how a provider authenticates. It asks the adapter
 * for a field schema, renders it with the shared Yaqoot components, and posts
 * the answers to a server route. Credentials never touch localStorage,
 * sessionStorage, URL params, logs or client-side DB records.
 */

export const AUTH_STATES = [
  'UNAUTHENTICATED',
  'AUTHENTICATING',
  'AUTHENTICATED',
  'EXPIRED',
  'REQUIRES_MFA',
  'REQUIRES_REAUTH',
  'ERROR',
] as const;

export type AuthState = (typeof AUTH_STATES)[number];

export const AUTH_STATE_LABELS: Record<AuthState, string> = {
  UNAUTHENTICATED: 'غير متصل',
  AUTHENTICATING: 'جارٍ الاتصال…',
  AUTHENTICATED: 'متصل',
  EXPIRED: 'انتهت الجلسة',
  REQUIRES_MFA: 'يتطلب تحققاً إضافياً',
  REQUIRES_REAUTH: 'يتطلب إعادة تسجيل دخول',
  ERROR: 'خطأ في الاتصال',
};

/** How the provider expects to be authenticated. */
export type AuthMethodKind =
  | 'password'
  | 'agent_code'
  | 'api_key'
  | 'oauth'
  | 'sso'
  | 'client_certificate'
  | 'passkey'
  | 'none';

export interface AuthMethod {
  readonly kind: AuthMethodKind;
  readonly id: string;
  /** Arabic label for the method selector (§47). */
  readonly label: string;
  readonly description?: string;
  /** Fields to render for this method. Rendered by DynamicForm. */
  readonly fields: readonly FieldDefinition[];
  /** True when a second step (OTP/MFA) always follows. */
  readonly requiresSecondFactor: boolean;
}

export interface AuthRequirements {
  /** Multiple methods → ProviderAuthMethodSelector appears. */
  readonly methods: readonly AuthMethod[];
  readonly defaultMethodId: string;
  /** Session lifetime hint, seconds. Null when the provider does not say. */
  readonly sessionDurationSeconds: number | null;
  /** Whether "Remember secure connection" may be offered (§49). */
  readonly allowPersistentSession: boolean;
  readonly helpUrl: string | null;
}

export interface SecondFactorChallenge {
  readonly kind: 'otp' | 'mfa' | 'qr';
  /** Arabic prompt, e.g. "أدخل الرمز المرسل إلى ٧٧٣١…". */
  readonly prompt: string;
  readonly fields: readonly FieldDefinition[];
  readonly expiresAt: string | null;
  /** Opaque token tying the challenge to the pending server-side attempt. */
  readonly challengeId: string;
}

/**
 * Result of an authentication attempt.
 *
 * There is deliberately no token field: the adapter holds provider session
 * material server-side and hands back only an opaque `sessionRef`.
 */
export type AuthOutcome =
  | {
      readonly state: 'AUTHENTICATED';
      readonly sessionRef: string;
      readonly expiresAt: string | null;
      readonly agentDisplayName: string | null;
    }
  | {
      readonly state: 'REQUIRES_MFA';
      readonly challenge: SecondFactorChallenge;
    }
  | {
      readonly state: 'ERROR';
      readonly reason: ProviderErrorReason;
      /** Arabic, operator-safe. */
      readonly message: string;
    };

export interface AuthStatus {
  readonly state: AuthState;
  readonly expiresAt: string | null;
  readonly agentDisplayName: string | null;
  readonly lastCheckedAt: string;
}

/** Credentials as submitted by the login form. Never logged, never persisted raw. */
export type AuthCredentials = Readonly<Record<string, string>>;

/** How long a provider session may be kept (§49). */
export type SessionPersistence = 'session_only' | 'remember' | 'always_ask';

export const SESSION_PERSISTENCE_LABELS: Record<SessionPersistence, string> = {
  session_only: 'اتصال لهذه الجلسة فقط',
  remember: 'تذكّر الاتصال الآمن',
  always_ask: 'اطلب تسجيل الدخول كل مرة',
};
