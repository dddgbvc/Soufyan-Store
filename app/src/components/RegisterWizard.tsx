import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Rocket } from 'lucide-react';
import type { FormEvent } from 'react';
import { stepVariants } from '../lib/motion';
import { useAuth } from '../state/AuthProvider';
import { StepAdminCredentials } from './register/StepAdminCredentials';
import { StepArchitecture } from './register/StepArchitecture';
import { StepEnterpriseProfile } from './register/StepEnterpriseProfile';
import { Button } from './ui/Button';
import { FormAlert } from './ui/FormAlert';
import { StepProgress } from './ui/StepProgress';

const STEP_TITLES = ['بيانات المسؤول', 'ملف المنشأة', 'المعمارية والنشر'];

const STEP_SUBTITLES = [
  'أنشئ حساب المسؤول الأعلى الذي سيدير المنظومة.',
  'عرّف منشأتك وقطاع نشاطها وعملتها الأساسية.',
  'راجع معمارية النظام واعتمد وحدات التشغيل.',
];

/** معالج تهيئة المنظومة — ثلاث خطوات بانتقالات واعية باتجاه القراءة. */
export function RegisterWizard() {
  const { state, advanceRegister, retreatRegister, isBusy } = useAuth();
  const { registerStep, direction, errors } = state;

  const isLastStep = registerStep === STEP_TITLES.length - 1;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void advanceRegister();
  };

  return (
    <div className="w-full">
      <header className="mb-5">
        <h1 className="text-fluid-2xl font-extrabold text-ink-50">معالج تهيئة المنظومة</h1>
        <p className="mt-1.5 text-fluid-sm leading-relaxed text-ink-400">
          {STEP_SUBTITLES[registerStep]}
        </p>
      </header>

      <div className="mb-5">
        <StepProgress steps={STEP_TITLES} current={registerStep} tone="royal" />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* خطأ على مستوى النموذج يظهر خارج منطقة الانتقال حتى لا يختفي مع الخطوة. */}
        {registerStep !== 2 && (
          <div className="mb-3">
            <FormAlert message={errors.register.form} />
          </div>
        )}

        {/*
          `mode="wait"` يمنع تراكب خطوتين بارتفاعين مختلفين أثناء الانتقال،
          فيبقى ارتفاع البطاقة مستقرًا بلا اهتزاز.
        */}
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={registerStep}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {registerStep === 0 && <StepAdminCredentials />}
            {registerStep === 1 && <StepEnterpriseProfile />}
            {registerStep === 2 && <StepArchitecture />}
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 flex items-center gap-2.5">
          <Button
            variant="secondary"
            onClick={retreatRegister}
            icon={ArrowRight}
            iconPosition="start"
            disabled={isBusy}
            className="shrink-0 px-4"
          >
            {registerStep === 0 ? 'رجوع' : 'السابق'}
          </Button>

          <Button
            type="submit"
            loading={isBusy}
            fullWidth
            icon={isLastStep ? Rocket : ArrowLeft}
            iconPosition="end"
          >
            {isLastStep ? (isBusy ? 'جارٍ تهيئة المنظومة…' : 'تنفيذ التهيئة') : 'التالي'}
          </Button>
        </div>
      </form>
    </div>
  );
}
