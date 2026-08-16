import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { EASE_APPLE } from '../../lib/motion';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  /** عنصر يظهر في نهاية الحقل (زر إظهار كلمة المرور مثلًا). */
  trailing?: ReactNode;
}

/**
 * حقل نصي بعنوان عائم يستجيب للتركيز والامتلاء.
 * ملاحظة: حجم الخط 16px على الجوال لمنع تكبير iOS التلقائي عند التركيز.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, value, onValueChange, error, hint, icon: Icon, trailing, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const invalid = Boolean(error);

  return (
    <div className="w-full">
      <div
        className={cn(
          'group relative flex items-center rounded-2xl',
          'bg-onyx-800/70 backdrop-blur-xl',
          'border transition-[border-color,box-shadow,background-color] duration-200 ease-apple',
          'shadow-field',
          invalid
            ? 'border-rose-500/60 focus-within:border-rose-400 focus-within:shadow-[0_0_0_1px_rgb(244_63_94_/_0.35)]'
            : 'border-white/10 hover:border-white/[0.18] focus-within:border-beam-500/70 focus-within:shadow-glow-beam',
          className,
        )}
      >
        {Icon && (
          <Icon
            className={cn(
              'pointer-events-none absolute start-4 size-[1.15rem] transition-colors duration-200',
              invalid
                ? 'text-rose-400'
                : 'text-ink-500 group-focus-within:text-beam-400',
            )}
            aria-hidden="true"
          />
        )}

        <input
          ref={ref}
          id={inputId}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          // مسافة واحدة كـ placeholder لتفعيل :placeholder-shown في العنوان العائم.
          placeholder=" "
          aria-invalid={invalid || undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(
            'peer h-[3.6rem] w-full rounded-2xl bg-transparent',
            'text-[16px] sm:text-[15px] font-medium text-ink-50',
            'pt-5 pb-1.5',
            Icon ? 'ps-12' : 'ps-4',
            trailing ? 'pe-12' : 'pe-4',
            'outline-none placeholder:text-transparent',
            'autofill:bg-transparent',
          )}
          {...rest}
        />

        <label
          htmlFor={inputId}
          className={cn(
            'pointer-events-none absolute origin-[center_right] select-none',
            Icon ? 'start-12' : 'start-4',
            'text-ink-400 transition-all duration-200 ease-apple',
            // الحالة العائمة (افتراضية عندما يحمل الحقل قيمة)
            'top-[0.55rem] translate-y-0 text-[0.7rem]',
            // الحالة المستقرة (حقل فارغ وغير مركَّز)
            'peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-[0.95rem]',
            // العودة للطفو عند التركيز
            'peer-focus:top-[0.55rem] peer-focus:translate-y-0 peer-focus:text-[0.7rem]',
            invalid ? 'text-rose-300' : 'peer-focus:text-beam-400',
          )}
        >
          {label}
        </label>

        {trailing && <div className="absolute end-2 flex items-center">{trailing}</div>}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {(error || hint) && (
          <motion.p
            key={error ?? hint}
            id={messageId}
            role={error ? 'alert' : undefined}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: EASE_APPLE }}
            className={cn(
              'mt-1.5 flex items-start gap-1.5 px-1 text-fluid-xs leading-relaxed',
              error ? 'text-rose-300' : 'text-ink-500',
            )}
          >
            {/* اللون ليس المؤشر الوحيد على الخطأ: أيقونة صريحة ترافق الرسالة. */}
            {error && <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />}
            <span>{error ?? hint}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});
