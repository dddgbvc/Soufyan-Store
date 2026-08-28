import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { requestOtp, resetPinWithToken, verifyOtp } from '@/server/auth/otp';
import { loginWithPin } from '@/server/auth/pin';
import { resolveSession } from '@/server/auth/session';
import { setMailer, type Mail } from '@/server/mail/mailer';
import { cleanupFixtures, createTestEmployee, expireOtpFor, testContext, uniquePin } from './helpers/fixtures';

const outbox: Mail[] = [];

beforeEach(() => {
  outbox.length = 0;
  setMailer({
    async send(mail) {
      outbox.push(mail);
    },
  });
});

afterEach(() => setMailer(null));
afterAll(cleanupFixtures);

/** Pulls the six digit code out of the captured message. */
function codeFromLastMail(): string {
  const mail = outbox.at(-1);
  if (!mail) throw new Error('no mail was sent');
  const match = mail.text.match(/\b(\d{6})\b/);
  if (!match) throw new Error('no code in mail');
  return match[1];
}

describe('OTP request', () => {
  it('sends a single-use code to a known employee', async () => {
    const employee = await createTestEmployee();

    const result = await requestOtp(employee.email, testContext());

    expect(result.expiresInSeconds).toBeGreaterThan(0);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(employee.email);
    expect(codeFromLastMail()).toMatch(/^\d{6}$/);
  });

  it('never reveals whether an address belongs to an employee', async () => {
    const employee = await createTestEmployee();

    const known = await requestOtp(employee.email, testContext());
    const unknown = await requestOtp('nobody-here@example.test', testContext());

    // Identical answer, and nothing was sent for the unknown address.
    expect(unknown).toEqual(known);
    expect(outbox).toHaveLength(1);
  });

  it('never mails the existing PIN', async () => {
    const employee = await createTestEmployee();

    await requestOtp(employee.email, testContext());

    expect(outbox[0].text).not.toContain(employee.pin);
    expect(outbox[0].html).not.toContain(employee.pin);
  });

  it('invalidates the previous code when a new one is requested', async () => {
    const employee = await createTestEmployee();
    const context = testContext();

    await requestOtp(employee.email, context);
    const firstCode = codeFromLastMail();
    await requestOtp(employee.email, context);

    await expect(verifyOtp(employee.email, firstCode, context)).rejects.toMatchObject({ code: 'otp_invalid' });
    await expect(verifyOtp(employee.email, codeFromLastMail(), context)).resolves.toMatchObject({
      resetToken: expect.any(String),
    });
  });

  it('throttles repeated requests for the same address', async () => {
    const employee = await createTestEmployee();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await requestOtp(employee.email, testContext());
    }

    await expect(requestOtp(employee.email, testContext())).rejects.toMatchObject({ code: 'rate_limited' });
  });
});

describe('OTP verification', () => {
  it('accepts the correct code exactly once', async () => {
    const employee = await createTestEmployee();
    const context = testContext();
    await requestOtp(employee.email, context);
    const code = codeFromLastMail();

    const verified = await verifyOtp(employee.email, code, context);
    expect(verified.resetToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    await expect(verifyOtp(employee.email, code, context)).rejects.toMatchObject({ code: 'otp_invalid' });
  });

  it('rejects a wrong code', async () => {
    const employee = await createTestEmployee();
    const context = testContext();
    await requestOtp(employee.email, context);
    const wrong = codeFromLastMail() === '000000' ? '111111' : '000000';

    await expect(verifyOtp(employee.email, wrong, context)).rejects.toMatchObject({ code: 'otp_invalid' });
  });

  it('rejects an expired code', async () => {
    const employee = await createTestEmployee();
    const context = testContext();
    await requestOtp(employee.email, context);
    const code = codeFromLastMail();

    await expireOtpFor(employee.id);

    await expect(verifyOtp(employee.email, code, context)).rejects.toMatchObject({ code: 'otp_invalid' });
  });

  it('burns the attempt budget and then refuses even the correct code', async () => {
    const employee = await createTestEmployee();
    const context = testContext();
    await requestOtp(employee.email, context);
    const code = codeFromLastMail();
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(verifyOtp(employee.email, wrong, context)).rejects.toMatchObject({ code: 'otp_invalid' });
    }

    await expect(verifyOtp(employee.email, code, context)).rejects.toMatchObject({ code: 'otp_invalid' });
  });

  it('gives the same answer for an unknown address as for a wrong code', async () => {
    const context = testContext();

    await expect(verifyOtp('nobody-here@example.test', '123456', context)).rejects.toMatchObject({
      code: 'otp_invalid',
    });
  });
});

describe('PIN reset', () => {
  it('completes the full forgot-PIN journey', async () => {
    const employee = await createTestEmployee();
    const context = testContext();
    const newPin = uniquePin();

    await requestOtp(employee.email, context);
    const { resetToken } = await verifyOtp(employee.email, codeFromLastMail(), context);
    await resetPinWithToken(resetToken, newPin, context);

    await expect(loginWithPin(newPin, testContext())).resolves.toMatchObject({ employee: { id: employee.id } });
    await expect(loginWithPin(employee.pin, testContext())).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('refuses to reuse a reset token', async () => {
    const employee = await createTestEmployee();
    const context = testContext();

    await requestOtp(employee.email, context);
    const { resetToken } = await verifyOtp(employee.email, codeFromLastMail(), context);
    await resetPinWithToken(resetToken, uniquePin(), context);

    await expect(resetPinWithToken(resetToken, uniquePin(), context)).rejects.toMatchObject({
      code: 'otp_invalid',
    });
  });

  it('rejects a forged reset token', async () => {
    await expect(
      resetPinWithToken('not-a-real-reset-token-value-000', uniquePin(), testContext()),
    ).rejects.toMatchObject({ code: 'otp_invalid' });
  });

  it('refuses a weak replacement PIN', async () => {
    const employee = await createTestEmployee();
    const context = testContext();

    await requestOtp(employee.email, context);
    const { resetToken } = await verifyOtp(employee.email, codeFromLastMail(), context);

    await expect(resetPinWithToken(resetToken, '123456', context)).rejects.toMatchObject({ code: 'weak_pin' });
  });

  it('keeps the reset handle usable after a rejected weak PIN', async () => {
    const employee = await createTestEmployee();
    const context = testContext();

    await requestOtp(employee.email, context);
    const { resetToken } = await verifyOtp(employee.email, codeFromLastMail(), context);

    // A typo must not cost the employee the whole recovery journey.
    await expect(resetPinWithToken(resetToken, '123456', context)).rejects.toMatchObject({ code: 'weak_pin' });

    const good = uniquePin();
    await expect(resetPinWithToken(resetToken, good, context)).resolves.toMatchObject({
      employeeId: employee.id,
    });
    await expect(loginWithPin(good, testContext())).resolves.toMatchObject({ employee: { id: employee.id } });
  });

  it('keeps the reset handle usable when the chosen PIN is already taken', async () => {
    const other = await createTestEmployee();
    const employee = await createTestEmployee();
    const context = testContext();

    await requestOtp(employee.email, context);
    const { resetToken } = await verifyOtp(employee.email, codeFromLastMail(), context);

    await expect(resetPinWithToken(resetToken, other.pin, context)).rejects.toMatchObject({ code: 'pin_taken' });

    const good = uniquePin();
    await expect(resetPinWithToken(resetToken, good, context)).resolves.toMatchObject({
      employeeId: employee.id,
    });
  });

  it('logs every device out after a reset', async () => {
    const employee = await createTestEmployee();
    const context = testContext();
    const before = await loginWithPin(employee.pin, testContext());

    await requestOtp(employee.email, context);
    const { resetToken } = await verifyOtp(employee.email, codeFromLastMail(), context);
    await resetPinWithToken(resetToken, uniquePin(), context);

    await expect(resolveSession(before.token)).resolves.toBeNull();
  });
});
