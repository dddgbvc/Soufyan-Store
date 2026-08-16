import { AnimatePresence, motion } from 'framer-motion';
import { viewVariants } from '../lib/motion';
import { useAuth } from '../state/AuthProvider';
import { ForgotPasswordFlow } from './ForgotPasswordFlow';
import { LoginForm } from './LoginForm';
import { RegisterWizard } from './RegisterWizard';
import { ShowcasePane } from './ShowcasePane';
import { SuccessView } from './SuccessView';
import { AuroraBackground } from './ui/AuroraBackground';
import { BrandMark } from './ui/BrandMark';
import { GlassCard } from './ui/GlassCard';

interface AuthPortalProps {
  /** يُستدعى عند اكتمال المصادقة والانتقال إلى لوحة التحكم. */
  onAuthenticated: () => void;
}

/**
 * الغلاف الجذري لبوابة المصادقة.
 *
 * التخطيط المتكيّف:
 * - جوال/لوحي: نافذة واحدة بعمود مفرد مع تمرير داخلي على الشاشات القصيرة.
 * - سطح المكتب (lg+): عرض مقسوم — النموذج يمينًا (اتجاه القراءة الأساسي)
 *   ولوحة معاينة المنظومة يسارًا.
 */
export function AuthPortal({ onAuthenticated }: AuthPortalProps) {
  const { state } = useAuth();
  const { view, success } = state;

  return (
    <div className="relative flex min-h-screen-dynamic w-full items-center justify-center pad-safe">
      <AuroraBackground />

      <div className="w-full max-w-lg lg:max-w-6xl">
        <GlassCard className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* لوحة النموذج */}
          <div
            className={[
              'relative flex flex-col',
              'p-5 sm:p-7 lg:p-9 xl:p-10',
              // تمرير داخلي ناعم بدل تمدّد الصفحة على الشاشات القصيرة
              'max-h-[calc(100dvh-2rem)] scroll-shell thin-scrollbar',
              'sm:max-h-[calc(100dvh-3rem)]',
            ].join(' ')}
          >
            {/* الهوية تظهر داخل النموذج عندما تكون لوحة العرض مخفية */}
            <div className="mb-6 lg:hidden">
              <BrandMark size="sm" />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                variants={viewVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                className="flex-1"
              >
                {view === 'login' && <LoginForm />}
                {view === 'register' && <RegisterWizard />}
                {view === 'recover' && <ForgotPasswordFlow />}
                {view === 'success' && success && (
                  <SuccessView payload={success} onContinue={onAuthenticated} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* لوحة العرض — سطح مكتب فقط */}
          <div className="relative hidden border-s border-white/[0.06] bg-onyx-950/40 lg:block">
            {/* توهّج اتجاهي يفصل اللوحتين بصريًا دون خط حاد */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 start-0 w-24 bg-gradient-to-l from-royal-600/[0.07] to-transparent"
            />
            <ShowcasePane />
          </div>
        </GlassCard>

        <p className="mt-4 px-2 text-center text-[0.65rem] leading-relaxed text-ink-500">
          © {new Date().getFullYear()} منظومة سفيان — سامراء، العراق. جميع الجلسات مشفّرة ومسجَّلة.
        </p>
      </div>
    </div>
  );
}
