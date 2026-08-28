import 'server-only';

import { sql, type Db } from '@/server/db/client';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

/**
 * Atomically consumes one token from a fixed-window bucket. The counter, the
 * window rollover and the escalating block are all decided inside a single
 * row-locked database call, so concurrent requests cannot race past the limit.
 */
export async function consume(
  bucket: string,
  limit: number,
  windowSeconds: number,
  blockSeconds = 0,
  db: Db = sql,
): Promise<RateLimitResult> {
  const rows = await db<RateLimitResult[]>`
    select allowed, remaining, retry_after
    from erp_auth.consume_rate_limit(${bucket}, ${limit}, ${windowSeconds}, ${blockSeconds})
  `;
  return rows[0] ?? { allowed: false, remaining: 0, retryAfter: windowSeconds };
}

/** Clears a bucket after a legitimate success. */
export async function reset(bucket: string, db: Db = sql): Promise<void> {
  await db`select erp_auth.reset_rate_limit(${bucket})`;
}
