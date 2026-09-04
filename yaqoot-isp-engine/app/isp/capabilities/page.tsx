'use client';

import { Fragment, useState } from 'react';
import { useProviders } from '@/components/isp/ProviderContext';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { CapabilityBadge, ProviderBadge } from '@/components/glass/Badges';
import { EmptyState } from '@/components/glass/States';
import {
  CAPABILITY_GROUP_LABELS,
  CAPABILITY_META,
  capabilitiesInGroup,
  type CapabilityGroup,
  type CapabilityKey,
} from '@/modules/isp/capabilities/keys';
import { declarationOf, stateOf } from '@/modules/isp/capabilities/resolver';
import { methodsFor } from '@/modules/isp/providers/core/contract';

const GROUPS: readonly CapabilityGroup[] = [
  'subscribers',
  'financial',
  'network',
  'provisioning',
  'notifications',
  'technology',
];

/**
 * Provider Capability Matrix (spec §20).
 *
 * Administrator view of exactly what each connected provider declares.
 * Clicking a cell reveals the adapter's own note and the methods that back
 * the capability — so "unsupported" is always explainable, never mysterious.
 */
export default function CapabilityMatrixPage() {
  const { providers, loading } = useProviders();
  const [selectedCell, setSelectedCell] = useState<{
    providerId: string;
    capability: CapabilityKey;
  } | null>(null);

  if (loading) {
    return <p className="text-sm text-[var(--text-2)]">جارٍ التحميل…</p>;
  }

  if (providers.length === 0) {
    return (
      <GlassSurface>
        <EmptyState
          title="لا يوجد مزودون مُسجّلون"
          hint="سجّل محوّل مزود في modules/isp/providers/bootstrap.ts ليظهر هنا."
        />
      </GlassSurface>
    );
  }

  const detail = selectedCell
    ? (() => {
        const provider = providers.find((p) => p.provider.id === selectedCell.providerId);
        if (!provider) return null;
        return {
          provider,
          capability: selectedCell.capability,
          declaration: declarationOf(provider.capabilities, selectedCell.capability),
        };
      })()
    : null;

  return (
    <>
      <h1 className="mb-1 text-2xl">قدرات المزودين</h1>
      <p className="mb-4 text-sm text-[var(--text-2)]">
        ما يعلنه كل محوّل بعد اكتشاف الخدمات. اضغط أي خانة لعرض تفاصيلها.
      </p>

      <GlassSurface variant="flat" className="overflow-x-auto thin-scroll">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky start-0 bg-[var(--surface)] p-3 text-start font-medium">
                القدرة
              </th>
              {providers.map((p) => (
                <th key={p.provider.id} className="p-3 text-start font-medium">
                  <ProviderBadge
                    name={p.provider.displayName}
                    logoUrl={p.provider.logoUrl}
                    accent={p.provider.accentColor}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => (
              <Fragment key={group}>
                <tr>
                  <td
                    colSpan={providers.length + 1}
                    className="bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text-2)]"
                  >
                    {CAPABILITY_GROUP_LABELS[group]}
                  </td>
                </tr>
                {capabilitiesInGroup(group).map((capability) => (
                  <tr key={capability} className="border-t border-[var(--border)]">
                    <td className="sticky start-0 bg-[var(--surface)] p-3">
                      {CAPABILITY_META[capability].label}
                    </td>
                    {providers.map((p) => (
                      <td key={p.provider.id} className="p-3">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCell({ providerId: p.provider.id, capability })
                          }
                          className="cursor-pointer"
                        >
                          <CapabilityBadge
                            capability={capability}
                            state={stateOf(p.capabilities, capability)}
                            note={declarationOf(p.capabilities, capability).note}
                          />
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </GlassSurface>

      {detail ? (
        <GlassSurface className="mt-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg">{CAPABILITY_META[detail.capability].label}</h2>
              <p className="text-sm text-[var(--text-2)]">
                {detail.provider.provider.displayName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCell(null)}
              aria-label="إغلاق التفاصيل"
              className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border)]"
            >
              ✕
            </button>
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--muted)]">الحالة المعلنة</dt>
              <dd className="mt-1">
                <CapabilityBadge
                  capability={detail.capability}
                  state={detail.declaration.state}
                  note={detail.declaration.note}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">دوال المحوّل المرتبطة</dt>
              <dd className="ltr mt-1 text-xs">
                {methodsFor(detail.capability).length > 0
                  ? methodsFor(detail.capability).map((m) => `${m}()`).join(', ')
                  : '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--muted)]">ملاحظة المحوّل</dt>
              <dd className="mt-1 text-[var(--text-2)]">
                {detail.declaration.note ??
                  CAPABILITY_META[detail.capability].unsupportedHint}
              </dd>
            </div>
            {detail.declaration.detail &&
            Object.keys(detail.declaration.detail).length > 0 ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-[var(--muted)]">تفاصيل إضافية</dt>
                <dd>
                  <pre className="ltr mt-1 overflow-x-auto rounded-lg bg-[var(--surface-2)] p-2 text-xs">
                    {JSON.stringify(detail.declaration.detail, null, 2)}
                  </pre>
                </dd>
              </div>
            ) : null}
          </dl>
        </GlassSurface>
      ) : null}
    </>
  );
}
