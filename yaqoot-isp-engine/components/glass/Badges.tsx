import type { ReactNode } from 'react';
import { CAPABILITY_META, type CapabilityKey } from '@/modules/isp/capabilities/keys';
import {
  CAPABILITY_STATE_LABELS,
  type CapabilityState,
} from '@/modules/isp/capabilities/manifest';
import type { SubscriberStatus } from '@/modules/isp/core/types';
import type { FreshnessLevel } from '@/modules/isp/core/freshness';

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted' | 'primary';

const TONE_STYLE: Record<Tone, { color: string; bg: string }> = {
  ok: { color: 'var(--ok)', bg: 'color-mix(in srgb, var(--ok) 14%, transparent)' },
  warn: { color: 'var(--warn)', bg: 'color-mix(in srgb, var(--warn) 16%, transparent)' },
  danger: { color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 14%, transparent)' },
  info: { color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 14%, transparent)' },
  muted: { color: 'var(--text-2)', bg: 'var(--surface-2)' },
  primary: { color: 'var(--primary)', bg: 'color-mix(in srgb, var(--primary) 12%, transparent)' },
};

export function Badge({
  tone = 'muted',
  children,
  title,
  dot = false,
  pulse = false,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
  dot?: boolean;
  pulse?: boolean;
}) {
  const style = TONE_STYLE[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color: style.color, background: style.bg }}
    >
      {dot ? (
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${pulse ? 'animate-status-pulse' : ''}`}
          style={{ background: style.color }}
        />
      ) : null}
      {children}
    </span>
  );
}

const SUBSCRIBER_STATUS: Record<SubscriberStatus, { label: string; tone: Tone }> = {
  active: { label: 'فعّال', tone: 'ok' },
  expiring: { label: 'قارب على الانتهاء', tone: 'warn' },
  expired: { label: 'منتهٍ', tone: 'danger' },
  suspended: { label: 'موقوف', tone: 'warn' },
  disabled: { label: 'معطّل', tone: 'muted' },
  pending: { label: 'قيد التفعيل', tone: 'info' },
  unknown: { label: 'غير معروف', tone: 'muted' },
};

export function StatusBadge({ status }: { status: SubscriberStatus }) {
  const meta = SUBSCRIBER_STATUS[status];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

const CAPABILITY_TONE: Record<CapabilityState, Tone> = {
  supported: 'ok',
  unsupported: 'muted',
  partial: 'warn',
  configurable: 'info',
  unknown: 'muted',
};

/**
 * Capability state is never rendered as a bare tick/cross: "configurable" and
 * "unknown" are meaningfully different from "unsupported" (§20).
 */
export function CapabilityBadge({
  capability,
  state,
  note,
}: {
  capability: CapabilityKey;
  state: CapabilityState;
  note?: string;
}) {
  return (
    <Badge
      tone={CAPABILITY_TONE[state]}
      title={note ?? CAPABILITY_META[capability].unsupportedHint}
    >
      {CAPABILITY_STATE_LABELS[state]}
    </Badge>
  );
}

const FRESHNESS_TONE: Record<FreshnessLevel, Tone> = {
  live: 'ok',
  fresh: 'info',
  stale: 'warn',
  offline: 'muted',
  error: 'danger',
};

/**
 * Product rule 13: stale external data must never look real-time. This badge
 * is mandatory on every provider-sourced surface.
 */
export function SyncStatus({ level, label }: { level: FreshnessLevel; label: string }) {
  return (
    <Badge tone={FRESHNESS_TONE[level]} dot pulse={level === 'live'}>
      {label}
    </Badge>
  );
}

export function ProviderBadge({
  name,
  logoUrl,
  accent,
}: {
  name: string;
  logoUrl: string | null;
  accent: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {/* شعار المزود داخل حاوية محايدة: يعالج الشعارات ضعيفة التباين (§48) */}
      <span
        aria-hidden
        className="grid h-6 w-6 place-items-center overflow-hidden rounded-md border text-[10px] font-bold"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
          color: accent ?? 'var(--text-2)',
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          name.slice(0, 2)
        )}
      </span>
      <span className="font-medium">{name}</span>
    </span>
  );
}
