import 'server-only';

import { NextResponse } from 'next/server';

import { AuthError } from '@/server/security/errors';

/**
 * Every route handler funnels through here so that no unexpected exception can
 * leak a stack trace, a SQL fragment or an internal identifier to the client.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    const response = NextResponse.json((data ?? { ok: true }) as Record<string, unknown>);
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      const response = NextResponse.json(error.toJSON(), { status: error.status });
      if (error.retryAfter !== undefined) {
        response.headers.set('retry-after', String(error.retryAfter));
      }
      response.headers.set('cache-control', 'no-store');
      return response;
    }

    // Unexpected: log server-side with detail, answer with nothing useful.
    console.error('[api] unhandled error', error);
    const response = NextResponse.json(
      { error: 'server_error', message: 'حدث خطأ غير متوقع. حاول مرة أخرى.' },
      { status: 500 },
    );
    response.headers.set('cache-control', 'no-store');
    return response;
  }
}
