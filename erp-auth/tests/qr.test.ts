import { afterAll, describe, expect, it } from 'vitest';

import {
  approveChallenge,
  consumeChallenge,
  createChallenge,
  getChallengeStatus,
  inspectChallenge,
  revokeChallenge,
} from '@/server/auth/qr';
import { resolveSession } from '@/server/auth/session';
import { cleanupFixtures, createTestEmployee, expireChallenge, testContext, uniquePin } from './helpers/fixtures';

afterAll(cleanupFixtures);

describe('QR challenge creation', () => {
  it('mints a challenge whose payload carries no identity', async () => {
    const challenge = await createChallenge(testContext());

    expect(challenge.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(challenge.pollSecret).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(challenge.token).not.toBe(challenge.pollSecret);

    // The QR encodes a fragment-only handle: no email, no id, no credential.
    expect(challenge.url).toContain('/approve#t=');
    expect(challenge.url.split('#')[0]).not.toContain(challenge.token);
  });

  it('issues a distinct challenge every time', async () => {
    const context = testContext();
    const first = await createChallenge(context);
    const second = await createChallenge(context);

    expect(first.challengeId).not.toBe(second.challengeId);
    expect(first.token).not.toBe(second.token);
  });

  it('starts out pending', async () => {
    const context = testContext();
    const challenge = await createChallenge(context);

    await expect(getChallengeStatus(challenge.challengeId, challenge.pollSecret, context)).resolves.toMatchObject({
      status: 'pending',
    });
  });
});

describe('QR approval', () => {
  it('completes the cross-device login', async () => {
    const employee = await createTestEmployee({ permissions: ['cashier.view'] });
    const desktop = testContext();
    const challenge = await createChallenge(desktop);

    // Phone: scan, then authenticate.
    const phone = testContext();
    await expect(inspectChallenge(challenge.token, phone)).resolves.toMatchObject({ status: 'pending' });
    await approveChallenge(challenge.token, { method: 'pin', pin: employee.pin }, phone);

    // Desktop: poll, then redeem.
    await expect(getChallengeStatus(challenge.challengeId, challenge.pollSecret, desktop)).resolves.toMatchObject({
      status: 'approved',
    });
    const result = await consumeChallenge(challenge.challengeId, challenge.pollSecret, desktop);

    expect(result.employee.id).toBe(employee.id);
    expect(result.permissions).toContain('cashier.view');
    expect(result.session.method).toBe('qr');
    await expect(resolveSession(result.token)).resolves.toMatchObject({ employee: { id: employee.id } });
  });

  it('refuses approval with wrong credentials', async () => {
    await createTestEmployee();
    const challenge = await createChallenge(testContext());

    await expect(
      approveChallenge(challenge.token, { method: 'pin', pin: uniquePin() }, testContext()),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('refuses approval from a disabled employee', async () => {
    const employee = await createTestEmployee({ status: 'disabled' });
    const challenge = await createChallenge(testContext());

    await expect(
      approveChallenge(challenge.token, { method: 'pin', pin: employee.pin }, testContext()),
    ).rejects.toMatchObject({ code: 'account_disabled' });
  });

  it('rejects an unknown or forged token', async () => {
    const employee = await createTestEmployee();

    await expect(
      approveChallenge('forged-token-that-does-not-exist-01', { method: 'pin', pin: employee.pin }, testContext()),
    ).rejects.toMatchObject({ code: 'qr_expired' });
  });

  it('cannot be approved twice', async () => {
    const employee = await createTestEmployee();
    const challenge = await createChallenge(testContext());

    await approveChallenge(challenge.token, { method: 'pin', pin: employee.pin }, testContext());

    await expect(
      approveChallenge(challenge.token, { method: 'pin', pin: employee.pin }, testContext()),
    ).rejects.toMatchObject({ code: 'qr_expired' });
  });
});

describe('QR single use and expiry', () => {
  it('cannot be consumed twice', async () => {
    const employee = await createTestEmployee();
    const desktop = testContext();
    const challenge = await createChallenge(desktop);

    await approveChallenge(challenge.token, { method: 'pin', pin: employee.pin }, testContext());
    await consumeChallenge(challenge.challengeId, challenge.pollSecret, desktop);

    await expect(consumeChallenge(challenge.challengeId, challenge.pollSecret, desktop)).rejects.toMatchObject({
      code: 'qr_expired',
    });
  });

  it('cannot be consumed before it is approved', async () => {
    const desktop = testContext();
    const challenge = await createChallenge(desktop);

    await expect(consumeChallenge(challenge.challengeId, challenge.pollSecret, desktop)).rejects.toMatchObject({
      code: 'qr_expired',
    });
  });

  it('rejects a scan after expiry', async () => {
    const challenge = await createChallenge(testContext());
    await expireChallenge(challenge.challengeId);

    await expect(inspectChallenge(challenge.token, testContext())).rejects.toMatchObject({ code: 'qr_expired' });
  });

  it('rejects approval after expiry', async () => {
    const employee = await createTestEmployee();
    const challenge = await createChallenge(testContext());
    await expireChallenge(challenge.challengeId);

    await expect(
      approveChallenge(challenge.token, { method: 'pin', pin: employee.pin }, testContext()),
    ).rejects.toMatchObject({ code: 'qr_expired' });
  });

  it('reports an expired challenge to the waiting screen', async () => {
    const desktop = testContext();
    const challenge = await createChallenge(desktop);
    await expireChallenge(challenge.challengeId);

    await expect(getChallengeStatus(challenge.challengeId, challenge.pollSecret, desktop)).resolves.toMatchObject({
      status: 'expired',
    });
  });

  it('honours revocation', async () => {
    const employee = await createTestEmployee();
    const desktop = testContext();
    const challenge = await createChallenge(desktop);

    await revokeChallenge(challenge.challengeId, challenge.pollSecret, desktop);

    await expect(inspectChallenge(challenge.token, testContext())).rejects.toMatchObject({ code: 'qr_invalid' });
    await expect(
      approveChallenge(challenge.token, { method: 'pin', pin: employee.pin }, testContext()),
    ).rejects.toMatchObject({ code: 'qr_expired' });
  });
});

describe('QR binding', () => {
  it('refuses a status poll with the wrong poll secret', async () => {
    const desktop = testContext();
    const challenge = await createChallenge(desktop);
    const other = await createChallenge(testContext());

    await expect(getChallengeStatus(challenge.challengeId, other.pollSecret, desktop)).rejects.toMatchObject({
      code: 'qr_invalid',
    });
  });

  it('refuses consumption from a different device, even with the poll secret', async () => {
    const employee = await createTestEmployee();
    const desktop = testContext();
    const challenge = await createChallenge(desktop);

    await approveChallenge(challenge.token, { method: 'pin', pin: employee.pin }, testContext());

    // Attacker holds the poll secret but not the originating browser's cookie.
    const attacker = testContext();
    await expect(consumeChallenge(challenge.challengeId, challenge.pollSecret, attacker)).rejects.toMatchObject({
      code: 'qr_expired',
    });

    // The rightful screen still works afterwards.
    await expect(consumeChallenge(challenge.challengeId, challenge.pollSecret, desktop)).resolves.toMatchObject({
      employee: { id: employee.id },
    });
  });

  it('keeps concurrent challenges independent', async () => {
    const first = await createTestEmployee();
    const second = await createTestEmployee();
    const deskA = testContext();
    const deskB = testContext();

    const challengeA = await createChallenge(deskA);
    const challengeB = await createChallenge(deskB);

    await approveChallenge(challengeA.token, { method: 'pin', pin: first.pin }, testContext());
    await approveChallenge(challengeB.token, { method: 'pin', pin: second.pin }, testContext());

    const resultA = await consumeChallenge(challengeA.challengeId, challengeA.pollSecret, deskA);
    const resultB = await consumeChallenge(challengeB.challengeId, challengeB.pollSecret, deskB);

    expect(resultA.employee.id).toBe(first.id);
    expect(resultB.employee.id).toBe(second.id);
  });

  it('lets only one of two racing redemptions win', async () => {
    const employee = await createTestEmployee();
    const desktop = testContext();
    const challenge = await createChallenge(desktop);

    await approveChallenge(challenge.token, { method: 'pin', pin: employee.pin }, testContext());

    const outcomes = await Promise.allSettled([
      consumeChallenge(challenge.challengeId, challenge.pollSecret, desktop),
      consumeChallenge(challenge.challengeId, challenge.pollSecret, desktop),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
  });
});
