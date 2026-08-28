import { AlertIcon, CheckIcon, ShieldIcon } from '@/components/ui/icons';

type Tone = 'error' | 'success' | 'info';

const TONE = {
  error: { className: 'border-danger/40 bg-danger-soft text-danger', Icon: AlertIcon },
  success: { className: 'border-success/40 bg-success-soft text-success', Icon: CheckIcon },
  info: { className: 'border-line-soft bg-sunken/60 text-ink-dim', Icon: ShieldIcon },
} as const;

/**
 * Inline status message. Errors are announced assertively because they
 * interrupt what the person was trying to do; everything else is polite.
 */
export function Alert({ tone = 'info', children }: { tone?: Tone; children: React.ReactNode }) {
  const { className, Icon } = TONE[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`animate-fade flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${className}`}
    >
      <Icon className="mt-0.5 shrink-0 text-base" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
