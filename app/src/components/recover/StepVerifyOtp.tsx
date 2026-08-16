import { motion } from 'framer-motion';
import { MailCheck, RotateCcw } from 'lucide-react';
import { cascade, cascadeItem } from '../../lib/motion';
import { maskIdentifier } from '../../lib/validation';
import { useCountdown } from '../../hooks/useCountdown';
import { useAuth } from '../../state/AuthProvider';
import { Button } from '../ui/Button';
import { OtpInput } from '../ui/OtpInput';

/** مهلة إعادة إرسال الرمز بالثواني. */
const RESEND_COOLDOWN = 45;

/** الخطوة ٢ — إدخال رمز التحقق المكوّن من ٦ أرقام. */
export function StepVerifyOtp() {
  const { state, patchRecover, advanceRecover, resendOtp, isBusy } = useAuth();
  const { recover, errors, otpSentAt } = state;

  const remaining = useCountdown(otpSentAt, RESEND_COOLDOWN);
  const canResend = remaining === 0 && !isBusy;

  return (
    <motion.div variants={cascade} initial="hidden" animate="show" className="space-y-5">
      <motion.div
        variants={cascadeItem}
        className="flex items-start gap-3 rounded-2xl border border-verify-500/20 bg-verify-500/[0.07] p-3"
      >
        <MailCheck className="mt-px size-[1.15rem] shrink-0 text-verify-400" aria-hidden="true" />
        <p className="text-[0.72rem] leading-relaxed text-ink-300">
          أُرسل الرمز إلى{' '}
          <span className="latin font-bold text-ink-50">{maskIdentifier(recover.identifier)}</span>
        </p>
      </motion.div>

      <motion.div variants={cascadeItem}>
        <OtpInput
          label="رمز التحقق المكوّن من ٦ أرقام"
          value={recover.otp}
          onValueChange={(otp) => patchRecover({ otp })}
          // اكتمال الرمز يتحقق تلقائيًا دون ضغط زر — تقليل خطوة كاملة.
          onComplete={() => void advanceRecover()}
          error={errors.recover.otp ?? errors.recover.form}
          disabled={isBusy}
        />
      </motion.div>

      <motion.div variants={cascadeItem} className="flex items-center justify-center gap-1.5">
        {canResend ? (
          <Button
            variant="link"
            onClick={() => void resendOtp()}
            icon={RotateCcw}
            iconPosition="start"
            className="text-fluid-xs"
          >
            إعادة إرسال الرمز
          </Button>
        ) : (
          <p className="text-fluid-xs text-ink-500">
            يمكنك طلب رمز جديد بعد{' '}
            <span className="numeric font-bold text-ink-300">{remaining}</span> ثانية
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
