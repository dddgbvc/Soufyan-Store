'use client';

/** Shape of every error the API returns. */
export interface ApiErrorPayload {
  error: string;
  message: string;
  retryAfter?: number;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;
  readonly details?: Record<string, unknown>;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.error;
    this.status = status;
    this.retryAfter = payload.retryAfter;
    this.details = payload.details;
  }
}

const CSRF_COOKIE = 'erp_auth_csrf';

function readCsrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Single entry point for every call the browser makes. It attaches the
 * double-submit CSRF token and normalises failures — including the offline
 * case, which surfaces as a real error rather than an unhandled rejection.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();

  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-csrf-token', readCsrfToken());

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { error: 'network', message: 'تعذّر الاتصال بالخادم. تحقّق من الشبكة.' });
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as Partial<ApiErrorPayload>;
    throw new ApiError(response.status, {
      error: body.error ?? 'server_error',
      message: body.message ?? 'حدث خطأ غير متوقع. حاول مرة أخرى.',
      retryAfter: body.retryAfter,
      details: body.details,
    });
  }

  return payload as T;
}
