import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { SPRING, SPRING_SETTLE } from '../../lib/motion';

interface StepProgressProps {
  steps: string[];
  /** فهرس الخطوة الحالية (يبدأ من صفر). */
  current: number;
  /** لون التقدّم — أزرق للتهيئة، سماوي للاستعادة. */
  tone?: 'royal' | 'beam';
}

/**
 * شريط تقدّم المعالج.
 * نحرّك `scaleX` (خاصية مركّبة) بدل `width` لتفادي إعادة التخطيط كل إطار،
 * ونثبّت نقطة الأصل يمينًا ليمتلئ الشريط باتجاه القراءة العربية.
 */
export function StepProgress({ steps, current, tone = 'royal' }: StepProgressProps) {
  const progress = (current + 1) / steps.length;

  const fillClass =
    tone === 'royal'
      ? 'bg-gradient-to-l from-royal-600 via-royal-500 to-beam-500'
      : 'bg-gradient-to-l from-beam-600 via-beam-500 to-verify-500';

  return (
    <div className="w-full">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-fluid-xs font-medium text-ink-400">
          الخطوة <span className="numeric text-ink-50">{current + 1}</span> من{' '}
          <span className="numeric">{steps.length}</span>
        </span>
        <span className="truncate text-fluid-xs font-semibold text-ink-50">{steps[current]}</span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={current + 1}
        aria-label="تقدّم المعالج"
      >
        <motion.div
          className={cn('h-full origin-right rounded-full', fillClass)}
          initial={false}
          animate={{ scaleX: progress }}
          transition={SPRING_SETTLE}
          style={{ transformOrigin: 'right' }}
        />
      </div>

      {/* مؤشرات الخطوات: تجيب عن «أين أنا؟» في كل لحظة. */}
      <ol className="mt-3 flex items-center justify-between gap-1.5">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;

          return (
            <li key={step} className="flex min-w-0 flex-1 items-center gap-1.5">
              <motion.span
                initial={false}
                animate={{ scale: active ? 1 : 0.92 }}
                transition={SPRING}
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-bold numeric',
                  'transition-colors duration-300 ease-apple',
                  done && 'bg-verify-500/20 text-verify-400 ring-1 ring-verify-500/40',
                  active && 'bg-sheen-royal text-white shadow-glow-royal',
                  !done && !active && 'bg-white/[0.06] text-ink-500 ring-1 ring-white/10',
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : index + 1}
              </motion.span>

              <span
                className={cn(
                  'hidden truncate text-[0.7rem] transition-colors duration-300 sm:block',
                  active ? 'text-ink-200' : 'text-ink-500',
                )}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
