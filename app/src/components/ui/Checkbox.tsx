import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../../lib/cn';
import { SPRING } from '../../lib/motion';

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  name?: string;
}

/** مربّع اختيار بمساحة لمس كاملة تشمل النص. */
export function Checkbox({ checked, onCheckedChange, label, name }: CheckboxProps) {
  const id = useId();
  const reduceMotion = useReducedMotion();

  return (
    <label
      htmlFor={id}
      className="tap-target group inline-flex cursor-pointer select-none items-center gap-2.5 rounded-xl py-1 pe-1 text-fluid-sm text-ink-300 transition-colors duration-200 hover:text-ink-50"
    >
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer sr-only"
      />

      <span
        aria-hidden="true"
        className={cn(
          'flex size-[1.35rem] shrink-0 items-center justify-center rounded-[0.5rem] border',
          'transition-[background-color,border-color,box-shadow] duration-200 ease-apple',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-beam-500',
          checked
            ? 'border-royal-500 bg-sheen-royal shadow-glow-royal'
            : 'border-white/15 bg-onyx-800/70 group-hover:border-white/30',
        )}
      >
        <motion.span
          initial={false}
          animate={checked ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
          transition={reduceMotion ? { duration: 0.12 } : SPRING}
          className="flex"
        >
          <Check className="size-3.5 text-white" strokeWidth={3} />
        </motion.span>
      </span>

      <span>{label}</span>
    </label>
  );
}
