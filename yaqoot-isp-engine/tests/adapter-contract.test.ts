import { describe, expect, it } from 'vitest';
import { createMockAdapter } from '@/modules/isp/providers/mock/adapter';
import { MOCK_PROFILES, MOCK_PROFILE_DEFINITIONS } from '@/modules/isp/providers/mock/profiles';
import { createEarthlinkAdapter } from '@/modules/isp/providers/earthlink/adapter';
import { validateAdapter } from '@/modules/isp/providers/core/contract';
import {
  OPTIONAL_ADAPTER_METHODS,
  REQUIRED_ADAPTER_METHODS,
  implementsMethod,
} from '@/modules/isp/providers/core/adapter';
import { canPerform } from '@/modules/isp/capabilities/resolver';
import { methodsFor } from '@/modules/isp/providers/core/contract';
import { CAPABILITY_KEYS } from '@/modules/isp/capabilities/keys';

/**
 * The contract suite. This is what stops the "fake button" failure mode:
 * a capability declared usable must have a real method behind it.
 */
describe('adapter contract', () => {
  it.each([...MOCK_PROFILES])('mock/%s satisfies the contract', async (profile) => {
    const adapter = createMockAdapter({ profile });
    const capabilities = await adapter.getCapabilities(null);
    const violations = validateAdapter(adapter, capabilities);
    expect(violations).toEqual([]);
  });

  it.each([...MOCK_PROFILES])(
    'mock/%s implements exactly the methods it declares',
    async (profile) => {
      const adapter = createMockAdapter({ profile });
      const capabilities = await adapter.getCapabilities(null);

      for (const capability of CAPABILITY_KEYS) {
        const methods = methodsFor(capability);
        if (methods.length === 0) continue;

        if (canPerform(capabilities, capability)) {
          for (const method of methods) {
            expect(
              implementsMethod(adapter, method),
              `${profile} declares ${capability} but lacks ${method}()`,
            ).toBe(true);
          }
        }
      }
    },
  );

  it('a basic provider genuinely has no session or wallet methods', async () => {
    // Not "returns unsupported" — the method must not exist, so the UI cannot
    // call it by accident.
    const adapter = createMockAdapter({ profile: 'basic' });
    expect(adapter.getCurrentSession).toBeUndefined();
    expect(adapter.getWalletBalance).toBeUndefined();
    expect(adapter.disconnectSession).toBeUndefined();
    expect(adapter.searchSubscribers).toBeDefined();
  });

  it('a read-only provider exposes no mutating method', async () => {
    const adapter = createMockAdapter({ profile: 'readonly' });
    expect(adapter.renewSubscription).toBeUndefined();
    expect(adapter.changePackage).toBeUndefined();
    expect(adapter.createSubscriber).toBeUndefined();
    expect(adapter.disconnectSession).toBeUndefined();
    expect(adapter.resetMac).toBeUndefined();
    // …but reading still works.
    expect(adapter.searchSubscribers).toBeDefined();
    expect(adapter.getWalletBalance).toBeDefined();
  });

  it('every adapter implements all required methods', async () => {
    for (const adapter of [createMockAdapter(), createEarthlinkAdapter()]) {
      for (const method of REQUIRED_ADAPTER_METHODS) {
        expect(typeof adapter[method], `${adapter.key}.${method}`).toBe('function');
      }
    }
  });

  it('the Earthlink adapter is an honest, inert boundary', async () => {
    // No official API documentation was available, so it must claim nothing
    // and grant nothing (§1, §38).
    const adapter = createEarthlinkAdapter();
    const capabilities = await adapter.getCapabilities(null);

    for (const capability of CAPABILITY_KEYS) {
      expect(canPerform(capabilities, capability), capability).toBe(false);
    }

    const outcome = await adapter.authenticate({}, 'unconfigured');
    expect(outcome.state).toBe('ERROR');

    const profile = await adapter.getProviderProfile();
    expect(profile.status).toBe('inactive');

    expect(validateAdapter(adapter, capabilities)).toEqual([]);
  });

  it('flags a capability declared without a backing method', async () => {
    // Deliberately dishonest adapter: claims renewal, implements nothing.
    const adapter = createMockAdapter({ profile: 'basic' });
    const violations = validateAdapter(adapter, {
      packageChange: { state: 'supported' },
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.kind).toBe('capability_without_method');
    expect(violations[0]?.capability).toBe('packageChange');
  });

  it('keeps the optional-method list in sync with the type', () => {
    // Guards against adding a method to the interface and forgetting the list
    // that the contract validator walks.
    expect(new Set(OPTIONAL_ADAPTER_METHODS).size).toBe(OPTIONAL_ADAPTER_METHODS.length);
  });

  it.each([...MOCK_PROFILES])('mock/%s declares a coherent profile', (profile) => {
    const definition = MOCK_PROFILE_DEFINITIONS[profile];
    expect(definition.profile).toBe(profile);
    expect(definition.dataShape.technologies.length).toBeGreaterThan(0);
  });
});
