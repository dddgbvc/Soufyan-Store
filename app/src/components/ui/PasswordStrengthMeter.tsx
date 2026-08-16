import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { EASE_APPLE, SPRING_SETTLE } from '../../lib/motion';
import { STRENGTH_STYLES } from '../../lib/password';
import type { PasswordStrength } from '../../types/auth';

interface PasswordStrengthMeterProps {
  strength: PasswordStrength;
  /** إخفاء المقياس بالكامل قبل أن يبدأ المستخدم بالكتابة. */
  visible: boolean;
  /** عرض قائمة الشروط تحت المقياس. */
  showChecklist?: boolean;
}

const SEGMENTS = 5;

/** مقياس قوة كلمة المرور — تحديث لحظي مع كل ضغطة مفتاح. */
export function PasswordStrengthMeter({
  strength,
  visible,
  showChecklist = true,
}: PasswordStrengthMeterProps) {
  const style = STRENGTH_STYLES[strength.score];
  const filled = strength.score + 1;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.24, ease: EASE_APPLE }}
          className="overflow-hidden"
        >
          <div className="pt-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[0.7rem] text-ink-500">قوة كلمة المرور</span>
              <motion.span
                key={strength.label}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: EASE_APPLE }}
                className={cn('text-[0.72rem] font-bold', style.text)}
              >
                {strength.label}
              </motion.span>
            </div>

            <div className="flex gap-1.5" role="presentation">
              {Array.from({ length: SEGMENTS }, (_, index) => (
                <div
                  key={index}
                  className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]"
                >
                  <motion.div
                    initial={false}
                    animate={{ scaleX: index < filled ? 1 : 0 }}
                    transition={{ ...SPRING_SETTLE, delay: index * 0.03 }}
                    style={{ transformOrigin: 'right' }}
                    className={cn('h-full w-full rounded-full', style.bar)}
                  />
                </div>
              ))}
            </div>

            {showChecklist && (
              <ul className="mt-2.5 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                {strength.checks.map((check) => (
                  <li
                    key={check.id}
                    className={cn(
                      'flex items-center gap-1.5 text-[0.7rem] transition-colors duration-200',
                      check.passed ? 'text-verify-400' : 'text-ink-500',
                    )}
                  >
                    {check.passed ? (
                      <Check className="size-3 shrink-0" strokeWidth={3} aria-hidden="true" />
                    ) : (
                      <X className="size-3 shrink-0 opacity-60" strokeWidth={3} aria-hidden="true" />
                    )}
                    <span className="truncate">{check.label}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* إعلان مهذّب لقارئات الشاشة دون مقاطعة الكتابة */}
            <span className="sr-only" aria-live="polite">
              قوة كلمة المرور: {strength.label}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
