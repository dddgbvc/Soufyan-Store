import { motion } from 'framer-motion';
import { ArrowLeft, AtSign, Building2, Phone, ShieldCheck } from 'lucide-react';
import type { FormEvent } from 'react';
import { cascade, cascadeItem } from '../lib/motion';
import { detectIdentifierKind } from '../lib/validation';
import { useAuth } from '../state/AuthProvider';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { FormAlert } from './ui/FormAlert';
import { PasswordField } from './ui/PasswordField';
import { TextField } from './ui/TextField';

/** بوابة تسجيل الدخول — المسار الأساسي للمستخدمين العائدين. */
export function LoginForm() {
  const { state, patchLogin, validateField, submitLogin, goTo, isBusy } = useAuth();
  const { login, errors } = state;

  const identifierKind = detectIdentifierKind(login.identifier);
  const IdentifierIcon =
    identifierKind === 'phone' ? Phone : identifierKind === 'email' ? AtSign : Building2;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitLogin();
  };

  return (
    <motion.div variants={cascade} initial="hidden" animate="show" exit="exit" className="w-full">
      <motion.header variants={cascadeItem} className="mb-6">
        <h1 className="text-fluid-2xl font-extrabold text-ink-50">تسجيل الدخول</h1>
        <p className="mt-1.5 text-fluid-sm leading-relaxed text-ink-400">
          أدخل بيانات حسابك للوصول إلى لوحة تحكم المنظومة.
        </p>
      </motion.header>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <motion.div variants={cascadeItem}>
          <FormAlert message={errors.login.form} />
        </motion.div>

        <motion.div variants={cascadeItem}>
          <TextField
            name="identifier"
            label="البريد الإلكتروني أو رقم الهاتف"
            value={login.identifier}
            onValueChange={(value) => patchLogin({ identifier: value })}
            onBlur={() => validateField('login', 'identifier')}
            error={errors.login.identifier}
            icon={IdentifierIcon}
            // لوحة المفاتيح تتبع نوع المعرّف المكتشَف أثناء الكتابة.
            inputMode={identifierKind === 'phone' ? 'tel' : 'email'}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            className="[&_input]:text-end"
            enterKeyHint="next"
          />
        </motion.div>

        <motion.div variants={cascadeItem}>
          <PasswordField
            name="password"
            label="كلمة المرور"
            value={login.password}
            onValueChange={(value) => patchLogin({ password: value })}
            onBlur={() => validateField('login', 'password')}
            error={errors.login.password}
            autoComplete="current-password"
          />
        </motion.div>

        <motion.div
          variants={cascadeItem}
          className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"
        >
          <Checkbox
            name="keepSignedIn"
            checked={login.keepSignedIn}
            onCheckedChange={(checked) => patchLogin({ keepSignedIn: checked })}
            label="إبقائي مسجّلًا للدخول"
          />

          <Button variant="link" onClick={() => goTo('recover', 1)} className="text-fluid-xs">
            نسيت كلمة المرور؟
          </Button>
        </motion.div>

        <motion.div variants={cascadeItem} className="pt-1">
          <Button type="submit" loading={isBusy} fullWidth icon={ArrowLeft} iconPosition="end">
            {isBusy ? 'جارٍ التحقق…' : 'دخول إلى المنظومة'}
          </Button>
        </motion.div>
      </form>

      {/* فاصل بصري رفيع بدل خط حاد */}
      <motion.div variants={cascadeItem} className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/12" />
        <span className="text-[0.7rem] font-medium text-ink-500">أو</span>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/12" />
      </motion.div>

      <motion.div variants={cascadeItem}>
        <Button variant="secondary" fullWidth onClick={() => goTo('register', 1)}>
          تهيئة منظومة جديدة
        </Button>
      </motion.div>

      <motion.p
        variants={cascadeItem}
        className="mt-5 flex items-center justify-center gap-1.5 text-center text-[0.7rem] text-ink-500"
      >
        <ShieldCheck className="size-3.5 shrink-0 text-verify-500" aria-hidden="true" />
        اتصال مشفّر — الجلسات محمية ومسجَّلة في سجل التدقيق.
      </motion.p>
    </motion.div>
  );
}
