import 'server-only';

/**
 * Central, fail-fast configuration. Every secret is read here and nowhere else,
 * so there is exactly one place to audit for credential handling.
 */

type Mode = 'development' | 'test' | 'production';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value.trim();
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = optional(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Environment variable ${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

const mode = (process.env.NODE_ENV ?? 'development') as Mode;

/** The pepper must be long enough that a database leak alone is not enough. */
function readPepper(): string {
  const pepper = required('AUTH_PIN_PEPPER');
  if (pepper.length < 32) {
    throw new Error('AUTH_PIN_PEPPER must be at least 32 characters. Generate one with: npm run gen:pepper');
  }
  if (mode === 'production' && /^(changeme|example|dev|test)/i.test(pepper)) {
    throw new Error('AUTH_PIN_PEPPER still holds a placeholder value. Generate a real secret before deploying.');
  }
  return pepper;
}

export const config = {
  mode,
  isProduction: mode === 'production',
  isTest: mode === 'test',

  appUrl: (optional('APP_URL') ?? 'http://localhost:3000').replace(/\/+$/, ''),

  database: {
    url: required('DATABASE_URL'),
    poolSize: int('DATABASE_POOL_SIZE', 8, 1, 50),
    statementTimeoutMs: int('DATABASE_STATEMENT_TIMEOUT_MS', 8000, 500, 60_000),
  },

  secrets: {
    pepper: readPepper(),
  },

  session: {
    cookieName: optional('SESSION_COOKIE_NAME') ?? 'erp_auth_session',
    csrfCookieName: optional('CSRF_COOKIE_NAME') ?? 'erp_auth_csrf',
    deviceCookieName: optional('DEVICE_COOKIE_NAME') ?? 'erp_auth_device',
    /** Sliding window: a session dies this long after the last request. */
    idleMinutes: int('SESSION_IDLE_MINUTES', 60, 5, 24 * 60),
    /** Hard ceiling regardless of activity. */
    absoluteHours: int('SESSION_ABSOLUTE_HOURS', 12, 1, 24 * 30),
  },

  pin: {
    length: int('PIN_LENGTH', 6, 4, 12),
    /** Attempts allowed per client fingerprint before the escalating lockout. */
    maxAttemptsPerWindow: int('PIN_MAX_ATTEMPTS', 5, 1, 50),
    windowSeconds: int('PIN_ATTEMPT_WINDOW_SECONDS', 300, 30, 3600),
    lockoutSeconds: int('PIN_LOCKOUT_SECONDS', 120, 10, 3600),
  },

  otp: {
    length: 6,
    ttlSeconds: int('OTP_TTL_SECONDS', 600, 60, 1800),
    maxAttempts: int('OTP_MAX_ATTEMPTS', 5, 1, 10),
    /** Requests per email/IP per hour. */
    maxRequestsPerHour: int('OTP_MAX_REQUESTS_PER_HOUR', 5, 1, 50),
    /** Lifetime of the short-lived token issued after a correct OTP. */
    resetTokenTtlSeconds: int('OTP_RESET_TOKEN_TTL_SECONDS', 600, 60, 1800),
  },

  qr: {
    ttlSeconds: int('QR_TTL_SECONDS', 120, 30, 600),
    pollIntervalMs: int('QR_POLL_INTERVAL_MS', 1500, 500, 10_000),
  },

  supabase: {
    url: optional('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: optional('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY'),
    /** Email + password login is only offered when Supabase Auth is wired up. */
    get passwordLoginEnabled(): boolean {
      return Boolean(config.supabase.url && config.supabase.anonKey);
    },
  },

  mail: {
    provider: (optional('MAIL_PROVIDER') ?? 'console') as 'console' | 'resend',
    from: optional('MAIL_FROM') ?? 'ERP Auth <no-reply@example.com>',
    resendApiKey: optional('RESEND_API_KEY'),
  },
} as const;

export type AppConfig = typeof config;
