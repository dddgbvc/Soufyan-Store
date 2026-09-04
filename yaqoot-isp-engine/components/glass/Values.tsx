import { formatMoney, type Money } from '@/modules/isp/core/money';
import type { ValueOrigin } from '@/modules/isp/core/types';

/**
 * Money always renders as an LTR isolate with tabular figures so columns line
 * up and the currency never flips inside the RTL page (§28).
 */
export function CurrencyValue({
  value,
  size = 'md',
}: {
  value: Money | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cls =
    size === 'lg' ? 'text-3xl font-semibold' : size === 'sm' ? 'text-sm' : 'text-base font-medium';

  if (value === null) {
    return <span className={`${cls} text-[var(--muted)]`}>—</span>;
  }
  return (
    <span className={`ltr tnum ${cls}`} dir="ltr">
      {formatMoney(value)}
    </span>
  );
}

const ORIGIN_LABEL: Record<ValueOrigin, string> = {
  provider: 'من المزود',
  erp: 'مضبوط في ياقوت',
  unavailable: 'غير متاح',
};

/**
 * Spec §5: a cost must always say where it came from. An ERP-configured
 * wholesale price must never be mistaken for one the provider confirmed.
 */
export function OriginNote({ origin }: { origin: ValueOrigin }) {
  return <span className="text-[11px] text-[var(--muted)]">{ORIGIN_LABEL[origin]}</span>;
}

/** Technical identifier — username, MAC, IP, transaction id (§28). */
export function Ltr({ children }: { children: React.ReactNode }) {
  return (
    <span className="ltr text-sm" dir="ltr">
      {children ?? '—'}
    </span>
  );
}
