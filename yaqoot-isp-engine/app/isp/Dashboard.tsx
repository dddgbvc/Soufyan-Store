'use client';

import { useEffect, useMemo, useState } from 'react';
import { useProviders } from '@/components/isp/ProviderContext';
import { MetricValue, ProviderBreakdown, WidgetCard } from '@/components/glass/WidgetCard';
import { CurrencyValue, OriginNote } from '@/components/glass/Values';
import { LoadingCard, UnsupportedCapabilityCard } from '@/components/glass/States';
import { Badge } from '@/components/glass/Badges';
import { resolveWidgets, WIDGET_SPAN, type Role } from '@/modules/isp/widgets/registry';
import { aggregateMetric } from '@/modules/isp/capabilities/resolver';
import { CAPABILITY_META } from '@/modules/isp/capabilities/keys';
import { classifyFreshness } from '@/modules/isp/core/freshness';
import { money, profit, toMajor, type Money } from '@/modules/isp/core/money';

interface Snapshot {
  providerId: string;
  generatedAt: string;
  subscribers: { total: number; active: number; byStatus: Record<string, number> } | null;
  expiringSoon: number | null;
  onlineNow: number | null;
  wallet: {
    currentBalance: Money;
    availableBalance: Money;
    lowBalanceThreshold: Money | null;
    lastSyncedAt: string | null;
  } | null;
  health: { reachable: boolean; latencyMs: number | null; checkedAt: string };
}

/**
 * The dashboard renders nothing of its own volition: every card comes from the
 * widget registry filtered by the active capability manifest (§15).
 *
 * There is no `if (provider === ...)` anywhere in this file, and adding a
 * provider requires no change to it.
 */
export function Dashboard() {
  const { active, connected, manifests, selected, loading } = useProviders();
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [fetching, setFetching] = useState(false);

  // Fetch a snapshot per connected provider so aggregate mode has real numbers.
  useEffect(() => {
    if (connected.length === 0) return;
    let cancelled = false;

    void (async () => {
      setFetching(true);
      const next: Record<string, Snapshot> = {};
      await Promise.all(
        connected.map(async (p) => {
          try {
            const response = await fetch(
              `/api/isp/dashboard?providerId=${encodeURIComponent(p.provider.id)}`,
              { cache: 'no-store' },
            );
            const body = (await response.json()) as { ok: boolean; snapshot?: Snapshot };
            if (body.ok && body.snapshot) next[p.provider.id] = body.snapshot;
          } catch {
            // A provider that fails to answer simply contributes nothing; the
            // coverage logic below reports it rather than faking a zero.
          }
        }),
      );
      if (!cancelled) {
        setSnapshots(next);
        setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected]);

  // Aggregate mode uses every connected provider; single mode uses just one.
  const scope = useMemo(
    () => (selected === null ? manifests : manifests.filter((m) => m.providerId === selected)),
    [manifests, selected],
  );

  const capabilities = useMemo(() => {
    if (active) return active.capabilities;
    // In aggregate mode a capability counts as present when any provider has
    // it — the per-widget coverage note then qualifies the number.
    const merged: Record<string, { state: 'supported' }> = {};
    for (const m of manifests) {
      for (const [key, decl] of Object.entries(m.manifest)) {
        if (decl && (decl.state === 'supported' || decl.state === 'partial')) {
          merged[key] = { state: 'supported' };
        }
      }
    }
    return merged;
  }, [active, manifests]);

  // Role comes from the ERP session in production; the demo runs as ADMIN.
  const role: Role = 'ADMIN';
  const widgets = useMemo(
    () => resolveWidgets(capabilities, role),
    [capabilities],
  );

  if (loading || (fetching && Object.keys(snapshots).length === 0)) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    );
  }

  if (connected.length === 0) return null;

  const metric = (key: 'subscribersActive' | 'expiringSoon' | 'onlineNow', capability: Parameters<typeof aggregateMetric>[1]) =>
    aggregateMetric(scope, capability, (providerId) => {
      const snap = snapshots[providerId];
      if (!snap) return null;
      if (key === 'subscribersActive') return snap.subscribers?.active ?? null;
      if (key === 'expiringSoon') return snap.expiringSoon;
      return snap.onlineNow;
    });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {widgets.map(({ definition, enabled, gate }) => {
        const span = WIDGET_SPAN[definition.size];

        if (!enabled) {
          const missing = gate.missing[0];
          return (
            <div key={definition.widgetId} className={span}>
              <UnsupportedCapabilityCard
                title={definition.title}
                hint={
                  missing
                    ? CAPABILITY_META[missing].unsupportedHint
                    : (gate.reason ?? 'غير مدعوم.')
                }
              />
            </div>
          );
        }

        switch (definition.widgetId) {
          case 'active-subscribers': {
            const agg = metric('subscribersActive', 'subscriberManagement');
            return (
              <div key={definition.widgetId} className={span}>
                <WidgetCard title={definition.title}>
                  <MetricValue value={agg.total.toLocaleString('ar-IQ', { numberingSystem: 'latn' })} suffix="مشترك" />
                  {selected === null ? (
                    <ProviderBreakdown rows={agg.breakdown} qualifier={agg.qualifier} />
                  ) : null}
                </WidgetCard>
              </div>
            );
          }

          case 'expiring-soon': {
            const agg = metric('expiringSoon', 'subscriberManagement');
            return (
              <div key={definition.widgetId} className={span}>
                <WidgetCard title={definition.title} footer="خلال ٧ أيام">
                  <MetricValue value={agg.total} suffix="اشتراك" tone={agg.total > 0 ? 'warn' : 'default'} />
                  {selected === null ? (
                    <ProviderBreakdown rows={agg.breakdown} qualifier={agg.qualifier} />
                  ) : null}
                </WidgetCard>
              </div>
            );
          }

          case 'online-sessions': {
            const agg = metric('onlineNow', 'sessionMonitoring');
            return (
              <div key={definition.widgetId} className={span}>
                <WidgetCard
                  title={definition.title}
                  // §19: never present a combined online count as complete
                  // when a provider cannot report live sessions.
                  footer={
                    agg.complete
                      ? undefined
                      : 'المزودون الذين يوفرون بيانات جلسات مباشرة فقط'
                  }
                >
                  <MetricValue value={agg.total} suffix="متصل" tone="ok" />
                  {selected === null ? (
                    <ProviderBreakdown rows={agg.breakdown} qualifier={agg.qualifier} />
                  ) : null}
                  {agg.coverage.notReporting.length > 0 ? (
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      لا يوفرها: {agg.coverage.notReporting.map((p) => p.providerName).join('، ')}
                    </p>
                  ) : null}
                </WidgetCard>
              </div>
            );
          }

          case 'wallet-balance': {
            const snap = active ? snapshots[active.provider.id] : undefined;
            const wallet = snap?.wallet ?? null;
            const freshness = wallet?.lastSyncedAt
              ? classifyFreshness({
                  owner: 'provider',
                  fetchedAt: wallet.lastSyncedAt,
                  externalReference: null,
                  syncStatus: 'ok',
                })
              : undefined;
            const low =
              wallet?.lowBalanceThreshold != null &&
              wallet.availableBalance.amount <= wallet.lowBalanceThreshold.amount;

            return (
              <div key={definition.widgetId} className={span}>
                <WidgetCard
                  title={definition.title}
                  freshness={freshness}
                  tone={low ? 'alert' : 'default'}
                  footer={selected === null ? 'اختر مزوداً لعرض رصيده' : undefined}
                >
                  {wallet ? (
                    <>
                      <CurrencyValue value={wallet.availableBalance} size="lg" />
                      {low ? (
                        <div className="mt-1">
                          <Badge tone="warn">الرصيد قارب على الحد الأدنى</Badge>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <MetricValue value={null} />
                  )}
                </WidgetCard>
              </div>
            );
          }

          case 'provider-health': {
            const snap = active ? snapshots[active.provider.id] : undefined;
            const health = snap?.health;
            return (
              <div key={definition.widgetId} className={span}>
                <WidgetCard
                  title={definition.title}
                  footer={
                    health?.latencyMs != null ? `زمن الاستجابة ${health.latencyMs}ms` : undefined
                  }
                >
                  <Badge tone={health?.reachable ? 'ok' : 'muted'} dot pulse={health?.reachable}>
                    {health?.reachable ? 'الاتصال سليم' : 'غير معروف'}
                  </Badge>
                </WidgetCard>
              </div>
            );
          }

          case 'daily-revenue':
          case 'provider-cost':
          case 'profit': {
            // These read from the ERP ledger (isp_dashboard RPC) in production.
            // Without a Supabase session configured they render as unavailable
            // rather than as a zero, which would read as "no sales today".
            const isProfit = definition.widgetId === 'profit';
            const value: Money | null = null;
            return (
              <div key={definition.widgetId} className={span}>
                <WidgetCard
                  title={definition.title}
                  footer={
                    <span className="flex items-center gap-1.5">
                      <OriginNote origin="erp" />
                      <span>— يتطلب اتصالاً بدفاتر ياقوت</span>
                    </span>
                  }
                >
                  <CurrencyValue
                    value={isProfit ? profit(money(0, 'IQD'), null) : value}
                    size="lg"
                  />
                </WidgetCard>
              </div>
            );
          }

          case 'reconciliation-queue': {
            return (
              <div key={definition.widgetId} className={span}>
                <WidgetCard title={definition.title} footer="عمليات تحتاج مراجعة بشرية">
                  <MetricValue value={0} suffix="عملية" />
                </WidgetCard>
              </div>
            );
          }

          default:
            return (
              <div key={definition.widgetId} className={span}>
                <WidgetCard title={definition.title} footer={definition.description}>
                  <MetricValue value={null} />
                </WidgetCard>
              </div>
            );
        }
      })}
    </div>
  );
}

/** Kept for the finance widgets once the ERP ledger is wired. */
export function formatIqd(value: number): string {
  return toMajor(money(value, 'IQD')).toLocaleString('ar-IQ', { numberingSystem: 'latn' });
}
