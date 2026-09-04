'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { GlassSurface } from './GlassSurface';
import { SyncStatus } from './Badges';
import type { FreshnessLevel } from '@/modules/isp/core/freshness';

/**
 * The one card every dashboard widget composes (spec §16, §17).
 *
 * Restraint is the point: one number, one status, optional context line.
 * Motion is limited to a small hover lift so it signals interactivity without
 * competing with the data.
 */
export interface WidgetCardProps {
  title: string;
  children: ReactNode;
  /** Small contextual line under the value. */
  footer?: ReactNode;
  action?: ReactNode;
  freshness?: { level: FreshnessLevel; label: string };
  /** Renders the alert treatment when the value needs attention. */
  tone?: 'default' | 'alert';
  className?: string;
}

export function WidgetCard({
  title,
  children,
  footer,
  action,
  freshness,
  tone = 'default',
  className = '',
}: WidgetCardProps) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={className}
    >
      <GlassSurface
        // Alert cards get a coloured edge rather than a loud fill.
        className={`flex h-full flex-col gap-2 p-5${
          tone === 'alert' ? ' ring-1 ring-[var(--warn)]' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-[var(--text-2)]">{title}</h3>
          {freshness ? <SyncStatus level={freshness.level} label={freshness.label} /> : null}
        </div>

        <div className="flex-1">{children}</div>

        {footer ? <div className="text-xs text-[var(--muted)]">{footer}</div> : null}
        {action}
      </GlassSurface>
    </motion.div>
  );
}

/** Large number + optional trend — the Metric Card variant (§17). */
export function MetricValue({
  value,
  suffix,
  tone,
}: {
  value: string | number | null;
  suffix?: string;
  tone?: 'default' | 'warn' | 'danger' | 'ok';
}) {
  const color =
    tone === 'warn'
      ? 'var(--warn)'
      : tone === 'danger'
        ? 'var(--danger)'
        : tone === 'ok'
          ? 'var(--ok)'
          : 'var(--text)';

  return (
    <p className="flex items-baseline gap-1.5">
      <span className="tnum text-3xl font-semibold" style={{ color }} dir="ltr">
        {value === null ? '—' : value}
      </span>
      {suffix ? <span className="text-sm text-[var(--text-2)]">{suffix}</span> : null}
    </p>
  );
}

/**
 * Provider breakdown for the aggregate view (§19).
 *
 * When coverage is incomplete the qualifier is mandatory — the total must
 * never read as a complete figure when a provider could not report.
 */
export function ProviderBreakdown({
  rows,
  qualifier,
}: {
  rows: readonly { providerName: string; value: number }[];
  qualifier: string | null;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {rows.map((row) => (
        <div key={row.providerName} className="flex justify-between text-xs text-[var(--text-2)]">
          <span>{row.providerName}</span>
          <span className="tnum" dir="ltr">
            {row.value.toLocaleString('ar-IQ', { numberingSystem: 'latn' })}
          </span>
        </div>
      ))}
      {qualifier ? (
        <p className="mt-1 text-[11px] text-[var(--warn)]">{qualifier}</p>
      ) : null}
    </div>
  );
}
