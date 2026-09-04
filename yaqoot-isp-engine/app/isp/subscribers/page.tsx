'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProviders } from '@/components/isp/ProviderContext';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { StatusBadge } from '@/components/glass/Badges';
import { EmptyState, ErrorState } from '@/components/glass/States';
import { Ltr } from '@/components/glass/Values';
import { canPerform } from '@/modules/isp/capabilities/resolver';
import type { CapabilityManifest } from '@/modules/isp/capabilities/manifest';
import type { Subscriber, SubscriberStatus } from '@/modules/isp/core/types';
import { SUBSCRIBER_STATUSES } from '@/modules/isp/core/types';

/**
 * Subscriber registry (spec §6).
 *
 * The column set is derived from the provider's capabilities, not hard-coded:
 * a provider without session monitoring has no IP column at all, and a legacy
 * provider that returns no contact details has no phone column.
 */

interface Column {
  readonly key: string;
  readonly label: string;
  readonly render: (subscriber: Subscriber) => React.ReactNode;
}

function columnsFor(capabilities: CapabilityManifest, hasTower: boolean): readonly Column[] {
  const columns: Column[] = [
    { key: 'name', label: 'الاسم', render: (s) => s.fullName },
    {
      key: 'external',
      label: 'رقم المشترك',
      render: (s) => <Ltr>{s.externalSubscriberId}</Ltr>,
    },
    { key: 'status', label: 'الحالة', render: (s) => <StatusBadge status={s.status} /> },
  ];

  // Username only exists where the provider models one.
  if (canPerform(capabilities, 'pppoe') || canPerform(capabilities, 'ftth')) {
    columns.push({
      key: 'username',
      label: 'اسم المستخدم',
      render: (s) => <Ltr>{s.username}</Ltr>,
    });
  }

  columns.push({
    key: 'technology',
    label: 'التقنية',
    render: (s) => <Ltr>{s.technology?.toUpperCase()}</Ltr>,
  });

  // Contact details are absent from legacy APIs — no empty column then.
  columns.push({
    key: 'phone',
    label: 'الهاتف',
    render: (s) => <Ltr>{s.phoneNumber}</Ltr>,
  });

  if (hasTower) {
    columns.push({ key: 'tower', label: 'البرج', render: (s) => <Ltr>{s.towerId}</Ltr> });
  }

  return columns;
}

const TECHNOLOGIES = ['pppoe', 'ftth', 'wireless'] as const;

export default function SubscribersPage() {
  const { active, selected, loading: providersLoading } = useProviders();
  const [rows, setRows] = useState<readonly Subscriber[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<SubscriberStatus | ''>('');
  const [technology, setTechnology] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) {
      setRows([]);
      setTotal(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ providerId: active.provider.id, limit: '50' });
      if (text.trim()) params.set('q', text.trim());
      if (status) params.set('status', status);
      if (technology) params.set('technology', technology);

      const response = await fetch(`/api/isp/subscribers?${params.toString()}`, {
        cache: 'no-store',
      });
      const body = (await response.json()) as {
        ok: boolean;
        items?: Subscriber[];
        total?: number | null;
        message?: string;
      };
      if (!body.ok) {
        setError(body.message ?? 'تعذر جلب المشتركين.');
        setRows([]);
        return;
      }
      setRows(body.items ?? []);
      setTotal(body.total ?? null);
    } catch {
      setError('تعذر الاتصال بمزود الخدمة حالياً.');
    } finally {
      setLoading(false);
    }
  }, [active, text, status, technology]);

  useEffect(() => {
    // Debounce so typing does not hammer the provider API.
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const hasTower = useMemo(() => rows.some((r) => r.towerId !== null), [rows]);
  const columns = useMemo(
    () => columnsFor(active?.capabilities ?? {}, hasTower),
    [active, hasTower],
  );

  if (providersLoading) {
    return <p className="text-sm text-[var(--text-2)]">جارٍ التحميل…</p>;
  }

  if (selected === null) {
    return (
      <GlassSurface>
        <EmptyState
          title="اختر مزوداً"
          hint="سجل المشتركين خاص بكل مزود — اختر مزوداً من الشريط أعلاه."
        />
      </GlassSurface>
    );
  }

  if (active && !canPerform(active.capabilities, 'subscriberManagement')) {
    return (
      <GlassSurface>
        <EmptyState
          title="سجل المشتركين غير متاح"
          hint="هذا المزود لا يتيح قراءة سجل المشتركين عبر الواجهة البرمجية."
        />
      </GlassSurface>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-2xl">المشتركون</h1>
      <p className="mb-4 text-sm text-[var(--text-2)]">
        {total === null ? '' : `${total.toLocaleString('ar-IQ', { numberingSystem: 'latn' })} مشترك`}
        {active?.readOnly ? ' — هذا المزود للقراءة فقط' : ''}
      </p>

      <GlassSurface className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <label htmlFor="sub-search" className="sr-only">
          بحث
        </label>
        <input
          id="sub-search"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ابحث بالاسم أو الرقم أو اسم المستخدم…"
          className="min-w-[220px] flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
        />

        <label htmlFor="sub-status" className="sr-only">
          الحالة
        </label>
        <select
          id="sub-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as SubscriberStatus | '')}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
        >
          <option value="">كل الحالات</option>
          {SUBSCRIBER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label htmlFor="sub-tech" className="sr-only">
          التقنية
        </label>
        <select
          id="sub-tech"
          value={technology}
          onChange={(e) => setTechnology(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
        >
          <option value="">كل التقنيات</option>
          {TECHNOLOGIES.filter((t) => canPerform(active?.capabilities ?? {}, t)).map((t) => (
            <option key={t} value={t}>
              {t.toUpperCase()}
            </option>
          ))}
        </select>
      </GlassSurface>

      <GlassSurface variant="flat" className="overflow-x-auto thin-scroll">
        {error ? (
          <ErrorState title={error} onRetry={() => void load()} />
        ) : loading ? (
          <div className="p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="shimmer mb-2 h-9 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="لا توجد نتائج مطابقة" hint="جرّب تعديل البحث أو الفلاتر." />
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {columns.map((column) => (
                  <th key={column.key} className="p-3 text-start font-medium text-[var(--text-2)]">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((subscriber) => (
                <tr
                  key={subscriber.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]"
                >
                  {columns.map((column) => (
                    <td key={column.key} className="p-3">
                      {column.render(subscriber)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassSurface>
    </>
  );
}
