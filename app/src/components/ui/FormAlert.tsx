import { AnimatePresence, motion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { EASE_APPLE } from '../../lib/motion';

interface FormAlertProps {
  message?: string;
}

/** تنبيه على مستوى النموذج (فشل الاتصال، رفض بيانات الدخول…). */
export function FormAlert({ message }: FormAlertProps) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, height: 0, y: -6 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -6 }}
          transition={{ duration: 0.22, ease: EASE_APPLE }}
          className="overflow-hidden"
        >
          <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/25 bg-rose-500/[0.09] p-3">
            <ShieldAlert className="mt-px size-[1.1rem] shrink-0 text-rose-400" aria-hidden="true" />
            <p className="text-fluid-xs leading-relaxed text-rose-100">{message}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
