import { describe, expect, it } from 'vitest';
import { createMockAdapter } from '@/modules/isp/providers/mock/adapter';
import type { ProviderSession } from '@/modules/isp/providers/core/adapter';
import { isSuccess } from '@/modules/isp/core/result';
import { isAmbiguousOutcome } from '@/modules/isp/core/errors';

const NOW = new Date('2026-06-15T10:00:00.000Z');
const clock = () => NOW;

async function authenticated(
  options: Parameters<typeof createMockAdapter>[0] = {},
): Promise<{ adapter: ReturnType<typeof createMockAdapter>; session: ProviderSession }> {
  const adapter = createMockAdapter({ now: clock, ...options });
  const outcome = await adapter.authenticate(
    { username: 'agent', password: 'demo1234' },
    'agent_code',
  );
  if (outcome.state !== 'AUTHENTICATED') {
    throw new Error(`expected authentication, got ${outcome.state}`);
  }
  return {
    adapter,
    session: { sessionRef: outcome.sessionRef, providerId: 'mock', expiresAt: outcome.expiresAt },
  };
}

describe('mock provider authentication', () => {
  it('rejects wrong credentials with an operator-safe message', async () => {
    const adapter = createMockAdapter({ now: clock });
    const outcome = await adapter.authenticate({ username: 'agent', password: 'nope' }, 'agent_code');
    expect(outcome.state).toBe('ERROR');
    if (outcome.state === 'ERROR') {
      expect(outcome.reason).toBe('INVALID_CREDENTIALS');
      // Arabic, and free of provider internals.
      expect(outcome.message).not.toMatch(/http|token|stack/i);
    }
  });

  it('rejects an unknown auth method', async () => {
    const adapter = createMockAdapter({ now: clock });
    const outcome = await adapter.authenticate({}, 'oauth');
    expect(outcome.state).toBe('ERROR');
  });

  it('walks the MFA flow when the provider requires a second factor', async () => {
    const adapter = createMockAdapter({ now: clock, requireMfa: true });
    const first = await adapter.authenticate(
      { username: 'agent', password: 'demo1234' },
      'agent_code',
    );
    expect(first.state).toBe('REQUIRES_MFA');
    if (first.state !== 'REQUIRES_MFA') return;

    const wrong = await adapter.submitSecondFactor?.(first.challenge.challengeId, {
      otp: '000000',
    });
    expect(wrong?.state).toBe('ERROR');

    const right = await adapter.submitSecondFactor?.(first.challenge.challengeId, {
      otp: '123456',
    });
    expect(right?.state).toBe('AUTHENTICATED');
  });

  it('refuses data calls without a valid session', async () => {
    const adapter = createMockAdapter({ now: clock });
    await expect(
      adapter.searchSubscribers?.(
        { sessionRef: 'forged', providerId: 'mock', expiresAt: null },
        {},
      ),
    ).rejects.toThrow();
  });

  it('reports the session as unauthenticated after logout', async () => {
    const { adapter, session } = await authenticated();
    await adapter.logout(session);
    const status = await adapter.getAuthenticationStatus(session);
    expect(status.state).toBe('UNAUTHENTICATED');
  });
});

describe('mock provider data', () => {
  it('is deterministic for a given seed', async () => {
    const a = await authenticated({ seed: 99 });
    const b = await authenticated({ seed: 99 });

    const first = await a.adapter.searchSubscribers?.(a.session, { limit: 5 });
    const second = await b.adapter.searchSubscribers?.(b.session, { limit: 5 });
    if (!first || !second || !isSuccess(first) || !isSuccess(second)) throw new Error('no data');

    expect(first.data.items.map((s) => s.fullName)).toEqual(
      second.data.items.map((s) => s.fullName),
    );
  });

  it('omits contact details for a legacy provider', async () => {
    const { adapter, session } = await authenticated({ profile: 'legacy' });
    const result = await adapter.searchSubscribers?.(session, { limit: 5 });
    if (!result || !isSuccess(result)) throw new Error('no data');
    // A legacy API simply does not return these; the UI must not show an
    // empty column pretending the data exists.
    expect(result.data.items.every((s) => s.phoneNumber === null)).toBe(true);
  });

  it('omits speeds and wholesale price where the provider does not publish them', async () => {
    const { adapter, session } = await authenticated({ profile: 'legacy' });
    const result = await adapter.getPackages?.(session);
    if (!result || !isSuccess(result)) throw new Error('no packages');

    for (const pkg of result.data) {
      expect(pkg.downloadSpeed).toBeNull();
      expect(pkg.wholesalePrice.value).toBeNull();
      expect(pkg.wholesalePrice.origin).toBe('unavailable');
    }
  });

  it('marks wholesale price as provider-supplied when it is', async () => {
    const { adapter, session } = await authenticated({ profile: 'full' });
    const result = await adapter.getPackages?.(session);
    if (!result || !isSuccess(result)) throw new Error('no packages');
    expect(result.data[0]?.wholesalePrice.origin).toBe('provider');
  });

  it('gives wireless subscribers tower and signal metadata', async () => {
    const { adapter, session } = await authenticated({ profile: 'wireless' });
    const subscribers = await adapter.searchSubscribers?.(session, { limit: 5 });
    if (!subscribers || !isSuccess(subscribers)) throw new Error('no data');

    const first = subscribers.data.items[0];
    expect(first?.towerId).toBeTruthy();

    const session1 = await adapter.getCurrentSession?.(
      session,
      first?.externalSubscriberId ?? '',
    );
    if (session1 && isSuccess(session1)) {
      expect(session1.data?.signal).not.toBeNull();
    }
  });

  it('filters subscribers by free text and status', async () => {
    const { adapter, session } = await authenticated();
    const all = await adapter.searchSubscribers?.(session, { limit: 100 });
    if (!all || !isSuccess(all)) throw new Error('no data');

    const active = await adapter.searchSubscribers?.(session, { status: 'active', limit: 100 });
    if (!active || !isSuccess(active)) throw new Error('no data');
    expect(active.data.items.every((s) => s.status === 'active')).toBe(true);

    const target = all.data.items[2];
    const byId = await adapter.searchSubscribers?.(session, {
      text: target?.externalSubscriberId ?? '',
    });
    if (!byId || !isSuccess(byId)) throw new Error('no data');
    expect(byId.data.items[0]?.externalSubscriberId).toBe(target?.externalSubscriberId);
  });

  it('paginates with a cursor', async () => {
    const { adapter, session } = await authenticated();
    const page1 = await adapter.searchSubscribers?.(session, { limit: 10 });
    if (!page1 || !isSuccess(page1)) throw new Error('no data');
    expect(page1.data.items).toHaveLength(10);
    expect(page1.data.nextCursor).toBe('10');

    const page2 = await adapter.searchSubscribers?.(session, {
      limit: 10,
      cursor: page1.data.nextCursor ?? undefined,
    });
    if (!page2 || !isSuccess(page2)) throw new Error('no data');
    expect(page2.data.items[0]?.id).not.toBe(page1.data.items[0]?.id);
  });
});

describe('mock provider mutations', () => {
  it('renews a subscription and debits the wallet', async () => {
    const { adapter, session } = await authenticated();
    const before = await adapter.getWalletBalance?.(session);
    const subscribers = await adapter.searchSubscribers?.(session, { limit: 1 });
    const packages = await adapter.getPackages?.(session);
    if (!before || !isSuccess(before) || !subscribers || !isSuccess(subscribers)) throw new Error();
    if (!packages || !isSuccess(packages)) throw new Error();

    const subscriber = subscribers.data.items[0];
    const pkg = packages.data[0];
    if (!subscriber || !pkg) throw new Error('fixture missing');

    const result = await adapter.renewSubscription?.(session, {
      subscriberId: subscriber.externalSubscriberId,
      packageId: pkg.externalPackageId,
      idempotencyKey: 'renew-key-alpha',
    });
    expect(result && isSuccess(result)).toBe(true);

    const after = await adapter.getWalletBalance?.(session);
    if (!after || !isSuccess(after)) throw new Error();
    expect(after.data.currentBalance.amount).toBeLessThan(before.data.currentBalance.amount);
  });

  it('is idempotent: the same key never charges twice', async () => {
    const { adapter, session } = await authenticated();
    const subscribers = await adapter.searchSubscribers?.(session, { limit: 1 });
    const packages = await adapter.getPackages?.(session);
    if (!subscribers || !isSuccess(subscribers) || !packages || !isSuccess(packages)) throw new Error();

    const subscriber = subscribers.data.items[0];
    const pkg = packages.data[0];
    if (!subscriber || !pkg) throw new Error('fixture missing');

    const request = {
      subscriberId: subscriber.externalSubscriberId,
      packageId: pkg.externalPackageId,
      idempotencyKey: 'renew-key-beta',
    };

    const first = await adapter.renewSubscription?.(session, request);
    const balanceAfterFirst = await adapter.getWalletBalance?.(session);
    const second = await adapter.renewSubscription?.(session, request);
    const balanceAfterSecond = await adapter.getWalletBalance?.(session);

    if (!balanceAfterFirst || !isSuccess(balanceAfterFirst)) throw new Error();
    if (!balanceAfterSecond || !isSuccess(balanceAfterSecond)) throw new Error();

    // Same outcome object, and crucially no second debit.
    expect(second).toEqual(first);
    expect(balanceAfterSecond.data.currentBalance.amount).toBe(
      balanceAfterFirst.data.currentBalance.amount,
    );
  });

  it('parks an ambiguous failure for reconciliation instead of failing outright', async () => {
    // failureRate 1 forces the injector; TIMEOUT/UNKNOWN_RESULT must never be
    // reported as a plain FAILED, because the provider may have applied it.
    const { adapter, session } = await authenticated({ failureRate: 1 });
    const subscribers = await adapter.searchSubscribers?.(session, { limit: 1 });
    const packages = await adapter.getPackages?.(session);
    if (!subscribers || !isSuccess(subscribers) || !packages || !isSuccess(packages)) throw new Error();

    const subscriber = subscribers.data.items[0];
    const pkg = packages.data[0];
    if (!subscriber || !pkg) throw new Error('fixture missing');

    const outcomes = await Promise.all(
      ['k-one-aaa', 'k-two-bbb', 'k-three-ccc', 'k-four-ddd', 'k-five-eee'].map((key) =>
        adapter.renewSubscription?.(session, {
          subscriberId: subscriber.externalSubscriberId,
          packageId: pkg.externalPackageId,
          idempotencyKey: key,
        }),
      ),
    );

    for (const outcome of outcomes) {
      if (!outcome || isSuccess(outcome)) continue;
      if (isAmbiguousOutcome(outcome.reason)) {
        expect(outcome.state).toBe('REQUIRES_RECONCILIATION');
        expect(outcome.reconciliation?.note).toBeTruthy();
      } else {
        expect(outcome.state).toBe('FAILED');
      }
    }

    // At least one ambiguous outcome must have been produced by the injector.
    expect(
      outcomes.some((o) => o && !isSuccess(o) && o.state === 'REQUIRES_RECONCILIATION'),
    ).toBe(true);
  });

  it('reports package-change rules from the provider rather than assuming them', async () => {
    const { adapter, session } = await authenticated();
    const subscribers = await adapter.searchSubscribers?.(session, { limit: 1 });
    const packages = await adapter.getPackages?.(session);
    if (!subscribers || !isSuccess(subscribers) || !packages || !isSuccess(packages)) throw new Error();

    const subscriber = subscribers.data.items[0];
    const cheapest = [...packages.data].sort(
      (a, b) => a.retailPrice.amount - b.retailPrice.amount,
    )[0];
    if (!subscriber || !cheapest) throw new Error('fixture missing');

    const options = await adapter.getPackageChangeOptions?.(
      session,
      subscriber.externalSubscriberId,
      cheapest.externalPackageId,
    );
    if (!options || !isSuccess(options)) throw new Error();

    expect(options.data.map((o) => o.timing)).toEqual(['immediate', 'next_cycle', 'prorated']);
    // A disallowed option carries a reason instead of silently vanishing.
    const prorated = options.data.find((o) => o.timing === 'prorated');
    if (prorated && !prorated.allowed) expect(prorated.reason).toBeTruthy();
  });

  it('takes test-account durations from the provider', async () => {
    // Product rule 8: never assume 2h/4h/24h or zero cost.
    const { adapter, session } = await authenticated();
    const options = await adapter.getTestAccountOptions?.(session);
    if (!options || !isSuccess(options)) throw new Error();
    expect(options.data.length).toBeGreaterThan(0);

    const first = options.data[0];
    if (!first) throw new Error('no options');
    const created = await adapter.createTestAccount?.(session, first.durationHours, 'test-acc-key1');
    if (!created || !isSuccess(created)) throw new Error();
    expect(Date.parse(created.data.expiresAt) - Date.parse(created.data.createdAt)).toBe(
      first.durationHours * 3600_000,
    );
  });

  it('refuses a renewal when the wallet cannot cover the wholesale cost', async () => {
    const { adapter, session } = await authenticated({ seed: 5 });
    const packages = await adapter.getPackages?.(session);
    const subscribers = await adapter.searchSubscribers?.(session, { limit: 1 });
    if (!packages || !isSuccess(packages) || !subscribers || !isSuccess(subscribers)) throw new Error();

    const subscriber = subscribers.data.items[0];
    const pkg = packages.data[0];
    if (!subscriber || !pkg) throw new Error('fixture missing');

    // Drain the wallet with repeated renewals until one is refused.
    let refused = false;
    for (let i = 0; i < 200 && !refused; i += 1) {
      const outcome = await adapter.renewSubscription?.(session, {
        subscriberId: subscriber.externalSubscriberId,
        packageId: pkg.externalPackageId,
        idempotencyKey: `drain-key-${i}`,
      });
      if (outcome && !isSuccess(outcome) && outcome.reason === 'INSUFFICIENT_FUNDS') refused = true;
    }
    expect(refused).toBe(true);
  });
});
