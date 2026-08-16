import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cascade, cascadeItem, SPRING, SPRING_SETTLE } from '../lib/motion';
import type { SuccessPayload } from '../types/auth';
import { Button } from './ui/Button';

interface SuccessViewProps {
  payload: SuccessPayload;
  /** يُستدعى عند انتهاء العدّ أو عند ضغط المستخدم للدخول فورًا. */
  onContinue: () => void;
  /** مدة التحويل التلقائي بالثواني. */
  redirectSeconds?: number;
}

/**
 * شاشة اكتمال التهيئة — تأكيد متوهّج بلا زخرفة زائدة،
 * مع تحويل تلقائي إلى لوحة التحكم وإمكانية التقدّم يدويًا في أي لحظة.
 */
export function SuccessView({ payload, onContinue, redirectSeconds = 5 }: SuccessViewProps) {
  const reduceMotion = useReducedMotion();
  const [remaining, setRemaining] = useState(redirectSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      onContinue();
      return;
    }

    const timer = window.setTimeout(() => setRemaining((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, onContinue]);

  const progress = (redirectSeconds - remaining) / redirectSeconds;

  return (
    <motion.div
      variants={cascade}
      initial="hidden"
      animate="show"
      className="w-full text-center"
      role="status"
      aria-live="polite"
    >
      {/* علامة التحقق المتوهّجة */}
      <motion.div variants={cascadeItem} className="relative mx-auto mb-6 grid size-24 place-items-center">
        {!reduceMotion && (
          <>
            <span className="absolute size-20 rounded-full border border-verify-500/40 animate-pulse-ring" />
            <span className="absolute size-20 rounded-full border border-verify-500/30 animate-pulse-ring [animation-delay:1.2s]" />
          </>
        )}

        <span
          aria-hidden="true"
          className="absolute size-24 rounded-full bg-[radial-gradient(circle,rgb(16_185_129_/_0.3)_0%,transparent_70%)] blur-md"
        />

        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduceMotion ? { duration: 0.2 } : { ...SPRING, delay: 0.08 }}
          className="relative grid size-[4.25rem] place-items-center rounded-full bg-gradient-to-br from-verify-400 to-verify-600 shadow-glow-verify"
        >
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0.2 } : { ...SPRING, delay: 0.2 }}
            className="flex"
          >
            <Check className="size-9 text-onyx-900" strokeWidth={3.5} aria-hidden="true" />
          </motion.span>
        </motion.span>
      </motion.div>

      <motion.h1 variants={cascadeItem} className="text-fluid-2xl font-extrabold text-ink-50">
        {payload.title}
      </motion.h1>

      <motion.p
        variants={cascadeItem}
        className="mx-auto mt-2 max-w-sm text-fluid-sm leading-relaxed text-ink-400"
      >
        {payload.message}
      </motion.p>

      {/* ملخّص ما تم إنشاؤه فعليًا */}
      {payload.facts && payload.facts.length > 0 && (
        <motion.dl
          variants={cascadeItem}
          className="mt-6 grid grid-cols-2 gap-2 text-start sm:grid-cols-4"
        >
          {payload.facts.map((fact) => (
            <div
              key={fact.label}
              className="rounded-2xl border border-white/10 bg-onyx-800/50 p-3 text-center"
            >
              <dd className="numeric text-fluid-lg font-extrabold leading-none text-verify-400">
                {fact.value}
              </dd>
              <dt className="mt-1.5 text-[0.62rem] leading-tight text-ink-500">{fact.label}</dt>
            </div>
          ))}
        </motion.dl>
      )}

      <motion.div variants={cascadeItem} className="mt-7">
        <Button onClick={onContinue} fullWidth icon={ArrowLeft} iconPosition="end">
          الدخول إلى لوحة التحكم
        </Button>
      </motion.div>

      {/* شريط التحويل التلقائي */}
      <motion.div variants={cascadeItem} className="mt-4">
        <div className="mx-auto h-0.5 w-40 overflow-hidden rounded-full bg-white/[0.08]">
          <motion.div
            className="h-full origin-right rounded-full bg-verify-500"
            initial={false}
            animate={{ scaleX: progress }}
            transition={SPRING_SETTLE}
            style={{ transformOrigin: 'right' }}
          />
        </div>
        <p className="mt-2 text-[0.68rem] text-ink-500">
          تحويل تلقائي خلال <span className="numeric font-bold text-ink-300">{remaining}</span> ثوانٍ
        </p>
      </motion.div>
    </motion.div>
  );
}
