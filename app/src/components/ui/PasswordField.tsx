import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, KeyRound, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { EASE_APPLE } from '../../lib/motion';
import { TextField } from './TextField';

interface PasswordFieldProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  /** `current-password` لتسجيل الدخول و`new-password` للإنشاء والاستعادة. */
  autoComplete?: 'current-password' | 'new-password';
  name?: string;
  id?: string;
}

/** حقل كلمة مرور مع تبديل إظهار/إخفاء سلس ودعم كامل لقارئات الشاشة. */
export function PasswordField({
  label,
  value,
  onValueChange,
  onBlur,
  error,
  hint,
  icon = KeyRound,
  autoComplete = 'current-password',
  name,
  id,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <TextField
      id={id}
      name={name}
      label={label}
      value={value}
      onValueChange={onValueChange}
      onBlur={onBlur}
      error={error}
      hint={hint}
      icon={icon}
      type={revealed ? 'text' : 'password'}
      autoComplete={autoComplete}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      // محتوى لاتيني داخل واجهة عربية: الاتجاه LTR مع محاذاة لليمين
      // ليبقى النص أسفل عنوانه مباشرة.
      dir="ltr"
      className="[&_input]:text-end"
      trailing={
        <motion.button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          whileTap={reduceMotion ? undefined : { scale: 0.9 }}
          className="tap-target flex cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:text-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam-500"
          aria-label={revealed ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          aria-pressed={revealed}
        >
          {/* تبديل الأيقونة بتلاشٍ قصير بدل قفزة مفاجئة. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={revealed ? 'visible' : 'hidden'}
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.82 }}
              transition={{ duration: 0.14, ease: EASE_APPLE }}
              className="flex"
            >
              {revealed ? (
                <EyeOff className="size-[1.15rem]" aria-hidden="true" />
              ) : (
                <Eye className="size-[1.15rem]" aria-hidden="true" />
              )}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      }
    />
  );
}
