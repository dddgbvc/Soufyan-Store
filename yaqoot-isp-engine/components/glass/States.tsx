import type { ReactNode } from 'react';
import { GlassSurface } from './GlassSurface';

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="font-medium text-[var(--text)]">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-[var(--text-2)]">{hint}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  /** Administrator-only diagnostics. Never raw provider errors for operators (§44). */
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="font-medium" style={{ color: 'var(--danger)' }}>
        {title}
      </p>
      {detail ? (
        <details className="max-w-md text-start text-xs text-[var(--text-2)]">
          <summary className="cursor-pointer">تفاصيل تقنية</summary>
          <pre className="ltr mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] p-2">
            {detail}
          </pre>
        </details>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-1.5 text-sm"
        >
          أعد المحاولة
        </button>
      ) : null}
    </div>
  );
}

/**
 * Empty Capability Card (§17). Shown instead of hiding a widget entirely when
 * an administrator benefits from knowing the capability exists but this
 * provider does not offer it.
 */
export function UnsupportedCapabilityCard({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <GlassSurface className="flex h-full flex-col justify-center gap-1.5 p-5 opacity-70">
      <p className="text-sm font-medium text-[var(--text-2)]">{title}</p>
      <p className="text-xs text-[var(--text-2)]">غير مدعوم لدى هذا المزود</p>
      <p className="text-xs text-[var(--muted)]">{hint}</p>
    </GlassSurface>
  );
}

export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <GlassSurface className="flex flex-col gap-3 p-5">
      <div className="shimmer h-3 w-24 rounded" />
      <div className="shimmer h-8 w-32 rounded" />
      {Array.from({ length: Math.max(0, lines - 2) }, (_, i) => (
        <div key={i} className="shimmer h-3 w-full rounded" />
      ))}
    </GlassSurface>
  );
}
