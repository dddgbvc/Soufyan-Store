import { describe, expect, it } from 'vitest';
import { declare } from '@/modules/isp/capabilities/manifest';
import { resolveWidgets, WIDGETS } from '@/modules/isp/widgets/registry';
import { MOCK_PROFILE_DEFINITIONS } from '@/modules/isp/providers/mock/profiles';

const ids = (widgets: ReturnType<typeof resolveWidgets>) =>
  widgets.map((w) => w.definition.widgetId);

describe('widget visibility', () => {
  it('hides the wallet widget for a provider with no wallet, but explains it', () => {
    const widgets = resolveWidgets(declare({ wallet: false }), 'ADMIN');
    const wallet = widgets.find((w) => w.definition.widgetId === 'wallet-balance');
    // showWhenUnsupported: an admin benefits from knowing it exists.
    expect(wallet?.enabled).toBe(false);
    expect(wallet?.gate.reason).toBeTruthy();
  });

  it('drops a widget entirely when it is not worth explaining', () => {
    const widgets = resolveWidgets(declare({ subscriberManagement: false }), 'ADMIN');
    expect(ids(widgets)).not.toContain('active-subscribers');
  });

  it('shows session widgets only where session monitoring exists', () => {
    const withSessions = resolveWidgets(declare({ sessionMonitoring: true }), 'ADMIN');
    expect(
      withSessions.find((w) => w.definition.widgetId === 'online-sessions')?.enabled,
    ).toBe(true);

    const without = resolveWidgets(declare({ sessionMonitoring: false }), 'ADMIN');
    expect(without.find((w) => w.definition.widgetId === 'online-sessions')?.enabled).toBe(false);
  });

  it('never shows profit without a known cost', () => {
    // Profit with an unknown wholesale cost would just be revenue mislabelled.
    const widgets = resolveWidgets(declare({ wholesaleCost: false }), 'ADMIN');
    expect(ids(widgets)).not.toContain('profit');

    const configurable = resolveWidgets(
      { wholesaleCost: { state: 'configurable' } },
      'ADMIN',
    );
    // Configurable means the ERP supplies it, so profit is computable.
    expect(ids(configurable)).toContain('profit');
  });

  it('keeps ERP-owned widgets regardless of provider capabilities', () => {
    const widgets = resolveWidgets({}, 'ADMIN');
    expect(ids(widgets)).toContain('daily-revenue');
    expect(ids(widgets)).toContain('reconciliation-queue');
  });

  it('enforces role before anything else', () => {
    const cashier = resolveWidgets(
      declare({ wallet: true, wholesaleCost: true, subscriberManagement: true }),
      'CASHIER',
    );
    expect(ids(cashier)).not.toContain('wallet-balance');
    expect(ids(cashier)).not.toContain('daily-revenue');
    expect(ids(cashier)).toContain('active-subscribers');
  });

  it('lets a manager see finance but not admin-only surfaces', () => {
    const manager = resolveWidgets(declare({ wallet: true }), 'MANAGER');
    expect(ids(manager)).toContain('wallet-balance');
    expect(ids(manager)).toContain('daily-revenue');
  });

  it('honours user preferences but never over capability restrictions', () => {
    // Spec §18: provider capability always overrides user preference.
    const widgets = resolveWidgets(declare({ sessionMonitoring: false }), 'ADMIN', {
      order: ['online-sessions', 'active-subscribers'],
    });
    const sessions = widgets.find((w) => w.definition.widgetId === 'online-sessions');
    expect(sessions?.enabled).toBe(false);
  });

  it('applies hide and reorder preferences', () => {
    const manifest = declare({ subscriberManagement: true, wallet: true });
    const hidden = resolveWidgets(manifest, 'ADMIN', { hidden: ['daily-revenue'] });
    expect(ids(hidden)).not.toContain('daily-revenue');

    const reordered = resolveWidgets(manifest, 'ADMIN', {
      order: ['recent-renewals', 'active-subscribers'],
    });
    expect(ids(reordered)[0]).toBe('recent-renewals');
    expect(ids(reordered)[1]).toBe('active-subscribers');
  });

  it('sorts by priority when no preference is given', () => {
    const widgets = resolveWidgets(declare({ subscriberManagement: true }), 'ADMIN');
    const priorities = widgets.map((w) => w.definition.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
  });

  it('produces a genuinely different dashboard per mock profile', () => {
    // This is the acceptance test for "the UI adapts": the same registry with
    // different manifests must yield different dashboards.
    const full = ids(resolveWidgets(MOCK_PROFILE_DEFINITIONS.full.capabilities, 'ADMIN'));
    const basic = ids(resolveWidgets(MOCK_PROFILE_DEFINITIONS.basic.capabilities, 'ADMIN'));
    const wireless = ids(resolveWidgets(MOCK_PROFILE_DEFINITIONS.wireless.capabilities, 'ADMIN'));

    expect(full).not.toEqual(basic);
    expect(full).toContain('online-sessions');
    expect(full).toContain('test-accounts');

    // A basic provider has no wallet and no sessions to enable.
    const basicEnabled = resolveWidgets(MOCK_PROFILE_DEFINITIONS.basic.capabilities, 'ADMIN')
      .filter((w) => w.enabled)
      .map((w) => w.definition.widgetId);
    expect(basicEnabled).not.toContain('online-sessions');
    expect(basicEnabled).not.toContain('wallet-balance');

    // A wireless provider has sessions but no wallet.
    const wirelessEnabled = resolveWidgets(
      MOCK_PROFILE_DEFINITIONS.wireless.capabilities,
      'ADMIN',
    )
      .filter((w) => w.enabled)
      .map((w) => w.definition.widgetId);
    expect(wirelessEnabled).toContain('online-sessions');
    expect(wirelessEnabled).not.toContain('wallet-balance');
    expect(wireless.length).toBeGreaterThan(0);
  });

  it('has a unique id and a valid role for every registered widget', () => {
    expect(new Set(WIDGETS.map((w) => w.widgetId)).size).toBe(WIDGETS.length);
    for (const widget of WIDGETS) {
      expect(['CASHIER', 'MANAGER', 'ADMIN']).toContain(widget.minimumRole);
    }
  });
});
