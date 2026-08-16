import { motion, useReducedMotion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { SPRING } from '../../lib/motion';
import { AnimatedNumber } from './AnimatedNumber';

interface CounterStepperProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
}

/** مُحدِّد عددي بأزرار كبيرة تناسب اللمس والقلم على شاشات نقاط البيع. */
export function CounterStepper({
  label,
  hint,
  value,
  min,
  max,
  onValueChange,
}: CounterStepperProps) {
  const id = useId();
  const reduceMotion = useReducedMotion();

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-onyx-800/50 p-3">
      <div className="min-w-0">
        <p id={id} className="text-fluid-sm font-semibold text-ink-50">
          {label}
        </p>
        {/* التلميح يلتف بدل أن يُقتطع: الرقم داخله معلومة لا زخرفة. */}
        {hint && <p className="mt-0.5 text-[0.7rem] leading-snug text-ink-500">{hint}</p>}
      </div>

      <div
        className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-onyx-900/60 p-1"
        role="group"
        aria-labelledby={id}
      >
        <StepButton
          onClick={() => onValueChange(clamp(value - 1))}
          disabled={value <= min}
          label="إنقاص"
          reduceMotion={Boolean(reduceMotion)}
        >
          <Minus className="size-4" strokeWidth={2.5} />
        </StepButton>

        <span
          className="numeric min-w-[2.25rem] text-center text-fluid-lg font-bold text-ink-50"
          aria-live="polite"
          aria-atomic="true"
        >
          <AnimatedNumber value={value} duration={0.32} />
        </span>

        <StepButton
          onClick={() => onValueChange(clamp(value + 1))}
          disabled={value >= max}
          label="زيادة"
          reduceMotion={Boolean(reduceMotion)}
        >
          <Plus className="size-4" strokeWidth={2.5} />
        </StepButton>
      </div>
    </div>
  );
}

interface StepButtonProps {
  onClick: () => void;
  disabled: boolean;
  label: string;
  reduceMotion: boolean;
  children: ReactNode;
}

function StepButton({ onClick, disabled, label, reduceMotion, children }: StepButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.88 }}
      transition={SPRING}
      className={cn(
        'tap-target flex cursor-pointer items-center justify-center rounded-full',
        'text-ink-200 transition-colors duration-200',
        'hover:bg-white/[0.08] hover:text-ink-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam-500',
        'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </motion.button>
  );
}
