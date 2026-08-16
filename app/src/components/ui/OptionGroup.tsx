import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../../lib/cn';
import { SPRING } from '../../lib/motion';

export interface OptionItem<T extends string> {
  value: T;
  label: string;
  hint?: string;
  /** شارة قصيرة تظهر في الزاوية (رمز العملة مثلًا). */
  badge?: string;
}

interface OptionGroupProps<T extends string> {
  legend: string;
  options: readonly OptionItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** `cards` للقطاعات، `segmented` لخيارين متقابلين كالعملة. */
  layout?: 'cards' | 'segmented';
}

/**
 * مجموعة اختيار مبنية على أزرار راديو حقيقية (تنقّل بالأسهم مدعوم أصلًا في المتصفح).
 * الشارة النشطة تنزلق بين الخيارات عبر `layoutId` لإحساس مادي متصل.
 */
export function OptionGroup<T extends string>({
  legend,
  options,
  value,
  onValueChange,
  layout = 'cards',
}: OptionGroupProps<T>) {
  const groupName = useId();

  return (
    <fieldset className="w-full">
      <legend className="mb-2 px-1 text-fluid-xs font-medium text-ink-400">{legend}</legend>

      <div
        className={cn(
          'grid gap-2',
          layout === 'segmented' ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3',
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <label
              key={option.value}
              className={cn(
                'group relative flex cursor-pointer select-none items-center gap-2.5 overflow-hidden',
                'rounded-2xl border p-3 min-h-tap',
                'transition-[border-color,background-color] duration-200 ease-apple',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-beam-500',
                selected
                  ? 'border-royal-500/60 bg-royal-600/[0.12]'
                  : 'border-white/10 bg-onyx-800/50 hover:border-white/20 hover:bg-white/[0.04]',
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={selected}
                onChange={() => onValueChange(option.value)}
                className="sr-only"
              />

              {/* توهّج اتجاهي خفيف خلف الخيار النشط */}
              {selected && (
                <motion.span
                  layoutId={`${groupName}-glow`}
                  transition={SPRING}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_100%_0%,rgb(37_99_235_/_0.22),transparent_60%)]"
                />
              )}

              <span
                aria-hidden="true"
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200',
                  selected ? 'border-royal-500 bg-royal-600' : 'border-white/20 bg-transparent',
                )}
              >
                <motion.span
                  initial={false}
                  animate={selected ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
                  transition={SPRING}
                  className="flex"
                >
                  <Check className="size-3 text-white" strokeWidth={3} />
                </motion.span>
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-fluid-sm font-semibold transition-colors duration-200',
                    selected ? 'text-ink-50' : 'text-ink-200',
                  )}
                >
                  {option.label}
                </span>
                {option.hint && (
                  <span className="mt-0.5 block truncate text-[0.7rem] text-ink-500">
                    {option.hint}
                  </span>
                )}
              </span>

              {option.badge && (
                <span
                  className={cn(
                    'latin shrink-0 rounded-lg px-1.5 py-0.5 text-[0.65rem] font-bold transition-colors duration-200',
                    selected ? 'bg-royal-600/30 text-royal-200' : 'bg-white/[0.06] text-ink-500',
                  )}
                >
                  {option.badge}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
