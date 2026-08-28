import { afterAll, describe, expect, it } from 'vitest';

import { changeOwnPin, loginWithPin, setPinFor } from '@/server/auth/pin';
import { resolveSession } from '@/server/auth/session';
import { AuthError } from '@/server/security/errors';
import { cleanupFixtures, createTestEmployee, testContext, uniquePin } from './helpers/fixtures';

afterAll(cleanupFixtures);

describe('PIN login', () => {
  it('identifies the employee from the PIN alone and loads their permissions', async () => {
    const employee = await createTestEmployee({ permissions: ['inventory.view', 'cashier.view'] });

    const result = await loginWithPin(employee.pin, testContext());

    expect(result.employee.id).toBe(employee.id);
    expect(result.employee.fullName).toBe(employee.fullName);
    expect(result.permissions.sort()).toEqual(['cashier.view', 'inventory.view']);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });

  it('issues a session that resolves back to the same employee', async () => {
    const employee = await createTestEmployee();

    const { token } = await loginWithPin(employee.pin, testContext());
    const resolved = await resolveSession(token);

    expect(resolved?.employee.id).toBe(employee.id);
    expect(resolved?.session.method).toBe('pin');
  });

  it('rejects a wrong PIN with a generic error', async () => {
    await createTestEmployee();
    const wrong = uniquePin();

    await expect(loginWithPin(wrong, testContext())).rejects.toMatchObject({
      code: 'invalid_credentials',
      status: 401,
    });
  });

  it('rejects a malformed PIN without touching the database', async () => {
    await expect(loginWithPin('12', testContext())).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(loginWithPin('abcdef', testContext())).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('refuses a disabled account even when the PIN is correct', async () => {
    const employee = await createTestEmployee({ status: 'disabled' });

    await expect(loginWithPin(employee.pin, testContext())).rejects.toMatchObject({
      code: 'account_disabled',
      status: 403,
    });
  });

  it('locks out a client after repeated failures, then reports how long to wait', async () => {
    await createTestEmployee();
    const context = testContext();

    // The configured budget is 5 attempts per window.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(loginWithPin(uniquePin(), context)).rejects.toMatchObject({ code: 'invalid_credentials' });
    }

    const blocked = await loginWithPin(uniquePin(), context).catch((error: unknown) => error);

    expect(blocked).toBeInstanceOf(AuthError);
    expect((blocked as AuthError).code).toBe('rate_limited');
    expect((blocked as AuthError).status).toBe(429);
    expect((blocked as AuthError).retryAfter).toBeGreaterThan(0);
  });

  it('blocks a brute-force client even when it finally guesses a real PIN', async () => {
    const employee = await createTestEmployee();
    const context = testContext();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await loginWithPin(uniquePin(), context).catch(() => undefined);
    }

    // The correct PIN must not be a way out of the penalty box.
    await expect(loginWithPin(employee.pin, context)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('keeps the lockout scoped to the offending client', async () => {
    const employee = await createTestEmployee();
    const attacker = testContext();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await loginWithPin(uniquePin(), attacker).catch(() => undefined);
    }

    // A different till in the same shop is unaffected.
    const result = await loginWithPin(employee.pin, testContext());
    expect(result.employee.id).toBe(employee.id);
  });

  it('clears the failure counter after a successful login', async () => {
    const employee = await createTestEmployee();
    const context = testContext();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await loginWithPin(uniquePin(), context).catch(() => undefined);
    }
    await loginWithPin(employee.pin, context);

    // Budget is full again: four more failures still do not trip the limit.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(loginWithPin(uniquePin(), context)).rejects.toMatchObject({ code: 'invalid_credentials' });
    }
  });
});

describe('PIN policy', () => {
  it('refuses a weak PIN', async () => {
    const employee = await createTestEmployee();

    await expect(
      setPinFor(employee.id, '123456', { context: testContext(), event: 'pin.changed' }),
    ).rejects.toMatchObject({ code: 'weak_pin' });
  });

  it('refuses a PIN that already belongs to somebody else', async () => {
    const first = await createTestEmployee();
    const second = await createTestEmployee();

    await expect(
      setPinFor(second.id, first.pin, { context: testContext(), event: 'pin.changed' }),
    ).rejects.toMatchObject({ code: 'pin_taken' });
  });

  it('lets an employee change their own PIN and invalidates the old one', async () => {
    const employee = await createTestEmployee();
    const { session } = await loginWithPin(employee.pin, testContext());
    const newPin = uniquePin();

    await changeOwnPin(employee.id, employee.pin, newPin, testContext(), session.id);

    await expect(loginWithPin(newPin, testContext())).resolves.toMatchObject({
      employee: { id: employee.id },
    });
    await expect(loginWithPin(employee.pin, testContext())).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
  });

  it('refuses a PIN change without the current PIN', async () => {
    const employee = await createTestEmployee();
    const { session } = await loginWithPin(employee.pin, testContext());

    await expect(
      changeOwnPin(employee.id, uniquePin(), uniquePin(), testContext(), session.id),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('logs every other device out when the PIN changes', async () => {
    const employee = await createTestEmployee();
    const other = await loginWithPin(employee.pin, testContext());
    const current = await loginWithPin(employee.pin, testContext());
    const newPin = uniquePin();

    await changeOwnPin(employee.id, employee.pin, newPin, testContext(), current.session.id);

    await expect(resolveSession(other.token)).resolves.toBeNull();
  });
});
