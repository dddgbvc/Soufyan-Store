import { describe, expect, it } from 'vitest';
import { CAPABILITY_KEYS } from '@/modules/isp/capabilities/keys';
import { declare, resolveManifest } from '@/modules/isp/capabilities/manifest';
import {
  aggregateMetric,
  aggregateState,
  canPerform,
  coverageFor,
  gate,
  hasData,
  isReadOnly,
  stateOf,
  type ProviderManifest,
} from '@/modules/isp/capabilities/resolver';

describe('capability resolution', () => {
  it('treats an omitted capability as unknown, not unsupported', () => {
    // The distinction matters: omission means discovery has not told us yet,
    // and must not be rendered as a confident "not supported".
    const manifest = declare({ renewal: true });
    expect(stateOf(manifest, 'wallet')).toBe('unknown');
    expect(stateOf(manifest, 'renewal')).toBe('supported');
  });

  it('fills every known key when resolving', () => {
    const resolved = resolveManifest(declare({ renewal: true }));
    for (const key of CAPABILITY_KEYS) {
      expect(resolved[key]).toBeDefined();
    }
  });

  it('allows an operation only when supported or partial', () => {
    expect(canPerform(declare({ renewal: true }), 'renewal')).toBe(true);
    expect(canPerform({ renewal: { state: 'partial' } }, 'renewal')).toBe(true);
    expect(canPerform({ renewal: { state: 'configurable' } }, 'renewal')).toBe(false);
    expect(canPerform({ renewal: { state: 'unknown' } }, 'renewal')).toBe(false);
    expect(canPerform(declare({ renewal: false }), 'renewal')).toBe(false);
  });

  it('separates "can act" from "has data"', () => {
    // A wholesale price the ERP supplies is data to show, but not an
    // operation the provider can perform.
    const manifest = { wholesaleCost: { state: 'configurable' as const } };
    expect(hasData(manifest, 'wholesaleCost')).toBe(true);
    expect(canPerform(manifest, 'wholesaleCost')).toBe(false);
  });

  it('gates a widget on all required capabilities and explains the first gap', () => {
    const manifest = declare({ wallet: true, walletTransactions: false });
    const result = gate(manifest, ['wallet', 'walletTransactions']);
    expect(result.allowed).toBe(false);
    expect(result.missing).toEqual(['walletTransactions']);
    expect(result.reason).toBeTruthy();
  });

  it('detects a read-only provider', () => {
    const readOnly = declare({
      subscriberManagement: true,
      sessionMonitoring: true,
      renewal: false,
      activation: false,
    });
    expect(isReadOnly(readOnly)).toBe(true);
    expect(isReadOnly(declare({ renewal: true }))).toBe(false);
  });
});

describe('multi-provider aggregation', () => {
  const providers: readonly ProviderManifest[] = [
    {
      providerId: 'a',
      providerName: 'مزود أ',
      manifest: declare({ subscriberManagement: true, sessionMonitoring: true }),
    },
    {
      providerId: 'b',
      providerName: 'مزود ب',
      manifest: declare({ subscriberManagement: true, sessionMonitoring: false }),
    },
  ];

  it('reports incomplete coverage when a provider cannot supply the metric', () => {
    const coverage = coverageFor(providers, 'sessionMonitoring');
    expect(coverage.reporting.map((p) => p.providerId)).toEqual(['a']);
    expect(coverage.notReporting.map((p) => p.providerId)).toEqual(['b']);
    expect(coverage.complete).toBe(false);
  });

  it('reports complete coverage when every provider supplies it', () => {
    expect(coverageFor(providers, 'subscriberManagement').complete).toBe(true);
  });

  it('never silently combines an incomplete online-session count', () => {
    // Spec §19: if one provider has session monitoring and another does not,
    // the combined number must not be presented as complete.
    const metric = aggregateMetric(providers, 'sessionMonitoring', (id) =>
      id === 'a' ? 120 : 999,
    );
    expect(metric.total).toBe(120);
    expect(metric.complete).toBe(false);
    expect(metric.qualifier).toBeTruthy();
    // The non-reporting provider is named so the UI can say who is missing.
    expect(metric.coverage.notReporting[0]?.providerName).toBe('مزود ب');
  });

  it('sums across providers and drops the qualifier when coverage is full', () => {
    const metric = aggregateMetric(providers, 'subscriberManagement', (id) =>
      id === 'a' ? 7420 : 3810,
    );
    expect(metric.total).toBe(11230);
    expect(metric.complete).toBe(true);
    expect(metric.qualifier).toBeNull();
    expect(metric.breakdown).toHaveLength(2);
  });

  it('marks a metric incomplete when a reporting provider returns nothing', () => {
    // A provider that *should* report but failed must not be hidden inside
    // a total that looks authoritative.
    const metric = aggregateMetric(providers, 'subscriberManagement', (id) =>
      id === 'a' ? 7420 : null,
    );
    expect(metric.total).toBe(7420);
    expect(metric.complete).toBe(false);
  });

  it('summarises a mixed capability as partial', () => {
    expect(aggregateState(providers, 'sessionMonitoring')).toBe('partial');
    expect(aggregateState(providers, 'subscriberManagement')).toBe('supported');
    expect(aggregateState([], 'wallet')).toBe('unknown');
  });
});
