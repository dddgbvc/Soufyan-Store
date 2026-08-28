import { afterAll, describe, expect, it } from 'vitest';

import { sql } from '@/server/db/client';
import { loginWithPin } from '@/server/auth/pin';
import {
  listSessions,
  resolveSession,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSessionByToken,
} from '@/server/auth/session';
import * as rateLimitRepo from '@/server/db/repositories/rateLimit';
import { cleanupFixtures, createTestEmployee, expireSession, testContext } from './helpers/fixtures';

afterAll(cleanupFixtures);

describe('session lifecycle', () => {
  it('resolves a live session to its employee', async () => {
    const employee = await createTestEmployee({ permissions: ['reports.view'] });
    const { token } = await loginWithPin(employee.pin, testContext());

    const resolved = await resolveSession(token);

    expect(resolved?.employee.id).toBe(employee.id);
    expect(resolved?.session.revokedAt).toBeNull();
  });

  it('stores only a digest, never the token itself', async () => {
    const employee = await createTestEmployee();
    const { token, session } = await loginWithPin(employee.pin, testContext());

    const [row] = await sql<{ tokenHash: string }[]>`
      select token_hash from erp_auth.sessions where id = ${session.id}
    `;

    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).not.toContain(token);
  });

  it('rejects a forged or malformed token', async () => {
    await expect(resolveSession('nope')).resolves.toBeNull();
    await expect(resolveSession('a'.repeat(43))).resolves.toBeNull();
  });

  it('refuses an expired session', async () => {
    const employee = await createTestEmployee();
    const { token, session } = await loginWithPin(employee.pin, testContext());

    await expireSession(session.id);

    await expect(resolveSession(token)).resolves.toBeNull();
  });

  it('slides the idle window on each use but never past the absolute ceiling', async () => {
    const employee = await createTestEmployee();
    const { token, session } = await loginWithPin(employee.pin, testContext());

    await sql`update erp_auth.sessions set expires_at = now() + interval '1 minute' where id = ${session.id}`;
    const refreshed = await resolveSession(token);

    expect(refreshed).not.toBeNull();
    expect(refreshed!.session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
    expect(refreshed!.session.expiresAt.getTime()).toBeLessThanOrEqual(
      refreshed!.session.absoluteExpiresAt.getTime(),
    );
  });

  it('stops working once revoked', async () => {
    const employee = await createTestEmployee();
    const { token } = await loginWithPin(employee.pin, testContext());

    await revokeSessionByToken(token, 'logout');

    await expect(resolveSession(token)).resolves.toBeNull();
  });

  it('cuts off every session when the employee is disabled', async () => {
    const employee = await createTestEmployee();
    const { token } = await loginWithPin(employee.pin, testContext());

    await sql`update erp_auth.employees set status = 'disabled' where id = ${employee.id}`;

    // Even without explicit revocation, an inactive employee has no session.
    await expect(resolveSession(token)).resolves.toBeNull();
  });

  it('cuts off every session while the employee is locked out', async () => {
    const employee = await createTestEmployee();
    const { token } = await loginWithPin(employee.pin, testContext());

    await sql`update erp_auth.employees set locked_until = now() + interval '5 minutes' where id = ${employee.id}`;

    await expect(resolveSession(token)).resolves.toBeNull();
  });

  it('tracks each device separately and can revoke all but the current one', async () => {
    const employee = await createTestEmployee();
    const first = await loginWithPin(employee.pin, testContext());
    const second = await loginWithPin(employee.pin, testContext());
    const third = await loginWithPin(employee.pin, testContext());

    const sessions = await listSessions(employee.id);
    expect(sessions.length).toBeGreaterThanOrEqual(3);

    const revoked = await revokeOtherSessions(employee.id, third.session.id, 'revoked_by_owner');
    expect(revoked).toBe(2);

    await expect(resolveSession(first.token)).resolves.toBeNull();
    await expect(resolveSession(second.token)).resolves.toBeNull();
    await expect(resolveSession(third.token)).resolves.not.toBeNull();
  });

  it('revokes everything at once when asked', async () => {
    const employee = await createTestEmployee();
    const first = await loginWithPin(employee.pin, testContext());
    const second = await loginWithPin(employee.pin, testContext());

    await revokeAllSessions(employee.id, 'revoked_by_admin');

    await expect(resolveSession(first.token)).resolves.toBeNull();
    await expect(resolveSession(second.token)).resolves.toBeNull();
  });
});

describe('rate limiter', () => {
  it('allows up to the limit, then blocks', async () => {
    const bucket = `test:${Date.now().toString(36)}:a`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await rateLimitRepo.consume(bucket, 3, 60, 30);
      expect(result.allowed, `attempt ${attempt + 1}`).toBe(true);
    }

    const blocked = await rateLimitRepo.consume(bucket, 3, 60, 30);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('counts down the remaining budget', async () => {
    const bucket = `test:${Date.now().toString(36)}:b`;

    expect((await rateLimitRepo.consume(bucket, 3, 60)).remaining).toBe(2);
    expect((await rateLimitRepo.consume(bucket, 3, 60)).remaining).toBe(1);
    expect((await rateLimitRepo.consume(bucket, 3, 60)).remaining).toBe(0);
  });

  it('escalates the penalty on repeat offences', async () => {
    const bucket = `test:${Date.now().toString(36)}:c`;

    await rateLimitRepo.consume(bucket, 1, 60, 10);
    const first = await rateLimitRepo.consume(bucket, 1, 60, 10);
    const second = await rateLimitRepo.consume(bucket, 1, 60, 10);

    expect(first.allowed).toBe(false);
    expect(second.retryAfter).toBeGreaterThanOrEqual(first.retryAfter);
  });

  it('clears a bucket on reset', async () => {
    const bucket = `test:${Date.now().toString(36)}:d`;

    await rateLimitRepo.consume(bucket, 1, 60, 30);
    expect((await rateLimitRepo.consume(bucket, 1, 60, 30)).allowed).toBe(false);

    await rateLimitRepo.reset(bucket);

    expect((await rateLimitRepo.consume(bucket, 1, 60, 30)).allowed).toBe(true);
  });

  it('holds the limit under concurrent load', async () => {
    const bucket = `test:${Date.now().toString(36)}:e`;

    const results = await Promise.all(
      Array.from({ length: 12 }, () => rateLimitRepo.consume(bucket, 5, 60, 30)),
    );

    // Exactly five may pass, no matter how the twelve interleave.
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });
});
