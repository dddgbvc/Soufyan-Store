import { motion } from 'framer-motion';
import { AtSign, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useMemo } from 'react';
import { cascade, cascadeItem } from '../../lib/motion';
import { evaluatePassword } from '../../lib/password';
import { useAuth } from '../../state/AuthProvider';
import { PasswordField } from '../ui/PasswordField';
import { PasswordStrengthMeter } from '../ui/PasswordStrengthMeter';
import { TextField } from '../ui/TextField';

/** الخطوة ١ — بيانات المسؤول الأعلى للمنظومة. */
export function StepAdminCredentials() {
  const { state, patchRegister, validateField } = useAuth();
  const { register, errors } = state;

  const strength = useMemo(
    () => evaluatePassword(register.masterPassword),
    [register.masterPassword],
  );

  return (
    <motion.div variants={cascade} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={cascadeItem}>
        <TextField
          name="fullName"
          label="الاسم الكامل"
          value={register.fullName}
          onValueChange={(value) => patchRegister({ fullName: value })}
          onBlur={() => validateField('register', 'fullName')}
          error={errors.register.fullName}
          icon={UserRound}
          autoComplete="name"
          // الاتجاه تلقائي: يتبع لغة ما يكتبه المستخدم فعلًا.
          dir="auto"
          enterKeyHint="next"
        />
      </motion.div>

      <motion.div variants={cascadeItem}>
        <TextField
          name="workEmail"
          label="البريد الإلكتروني للعمل"
          value={register.workEmail}
          onValueChange={(value) => patchRegister({ workEmail: value })}
          onBlur={() => validateField('register', 'workEmail')}
          error={errors.register.workEmail}
          icon={AtSign}
          type="email"
          inputMode="email"
          autoComplete="email"
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
          name="masterPassword"
          label="كلمة المرور الرئيسية"
          value={register.masterPassword}
          onValueChange={(value) => patchRegister({ masterPassword: value })}
          onBlur={() => validateField('register', 'masterPassword')}
          error={errors.register.masterPassword}
          autoComplete="new-password"
          icon={ShieldCheck}
        />
        <PasswordStrengthMeter
          strength={strength}
          visible={register.masterPassword.length > 0}
        />
      </motion.div>

      <motion.div variants={cascadeItem}>
        <PasswordField
          name="confirmPassword"
          label="تأكيد كلمة المرور"
          value={register.confirmPassword}
          onValueChange={(value) => patchRegister({ confirmPassword: value })}
          onBlur={() => validateField('register', 'confirmPassword')}
          error={errors.register.confirmPassword}
          autoComplete="new-password"
          icon={KeyRound}
        />
      </motion.div>

      <motion.p variants={cascadeItem} className="px-1 text-[0.7rem] leading-relaxed text-ink-500">
        هذا الحساب يملك أعلى صلاحية في المنظومة: إدارة المستخدمين، إغلاق الفترات المحاسبية،
        والوصول إلى سجل التدقيق الكامل.
      </motion.p>
    </motion.div>
  );
}
