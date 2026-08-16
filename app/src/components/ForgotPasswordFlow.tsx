import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { FormEvent } from 'react';
import { stepVariants } from '../lib/motion';
import { useAuth } from '../state/AuthProvider';
import { StepIdentity } from './recover/StepIdentity';
import { StepNewPassword } from './recover/StepNewPassword';
import { StepVerifyOtp } from './recover/StepVerifyOtp';
import { Button } from './ui/Button';
import { FormAlert } from './ui/FormAlert';
import { StepProgress } from './ui/StepProgress';

const STEP_TITLES = ['تحديد الهوية', 'رمز التحقق', 'كلمة المرور الجديدة'];

const STEP_SUBTITLES = [
  'سنتحقّق من هويتك قبل السماح بتغيير كلمة المرور.',
  'أدخل الرمز المرسل إليك لإكمال التحقق.',
  'اختر كلمة مرور قوية لحماية حسابك.',
];

const CTA_LABELS = ['إرسال رمز التحقق', 'تأكيد الرمز', 'حفظ كلمة المرور'];
const BUSY_LABELS = ['جارٍ الإرسال…', 'جارٍ التحقق…', 'جارٍ الحفظ…'];

/** مسار استعادة كلمة المرور — ثلاث خطوات آمنة. */
export function ForgotPasswordFlow() {
  const { state, advanceRecover, retreatRecover, isBusy } = useAuth();
  const { recoverStep, direction, errors } = state;

  const isLastStep = recoverStep === STEP_TITLES.length - 1;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void advanceRecover();
  };

  return (
    <div className="w-full">
      <header className="mb-5">
        <h1 className="text-fluid-2xl font-extrabold text-ink-50">استعادة كلمة المرور</h1>
        <p className="mt-1.5 text-fluid-sm leading-relaxed text-ink-400">
          {STEP_SUBTITLES[recoverStep]}
        </p>
      </header>

      <div className="mb-5">
        <StepProgress steps={STEP_TITLES} current={recoverStep} tone="beam" />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* الخطوتان ١ و٢ تعرضان أخطاء النموذج هنا؛ الخطوة ٣ تعرضها داخلها. */}
        {recoverStep === 0 && (
          <div className="mb-3">
            <FormAlert message={errors.recover.form} />
          </div>
        )}

        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={recoverStep}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {recoverStep === 0 && <StepIdentity />}
            {recoverStep === 1 && <StepVerifyOtp />}
            {recoverStep === 2 && <StepNewPassword />}
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 flex items-center gap-2.5">
          <Button
            variant="secondary"
            onClick={retreatRecover}
            icon={ArrowRight}
            iconPosition="start"
            disabled={isBusy}
            className="shrink-0 px-4"
          >
            {recoverStep === 0 ? 'إلغاء' : 'السابق'}
          </Button>

          <Button
            type="submit"
            loading={isBusy}
            fullWidth
            icon={isLastStep ? Check : ArrowLeft}
            iconPosition="end"
          >
            {isBusy ? BUSY_LABELS[recoverStep] : CTA_LABELS[recoverStep]}
          </Button>
        </div>
      </form>
    </div>
  );
}
