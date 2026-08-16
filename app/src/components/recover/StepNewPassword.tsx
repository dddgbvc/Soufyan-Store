import { motion } from 'framer-motion';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { cascade, cascadeItem } from '../../lib/motion';
import { evaluatePassword } from '../../lib/password';
import { useAuth } from '../../state/AuthProvider';
import { FormAlert } from '../ui/FormAlert';
import { PasswordField } from '../ui/PasswordField';
import { PasswordStrengthMeter } from '../ui/PasswordStrengthMeter';

/** الخطوة ٣ — تعيين كلمة مرور جديدة مع مؤشر قوة لحظي. */
export function StepNewPassword() {
  const { state, patchRecover, validateField } = useAuth();
  const { recover, errors } = state;

  const strength = useMemo(() => evaluatePassword(recover.newPassword), [recover.newPassword]);

  return (
    <motion.div variants={cascade} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={cascadeItem}>
        <FormAlert message={errors.recover.form} />
      </motion.div>

      <motion.div variants={cascadeItem}>
        <PasswordField
          name="newPassword"
          label="كلمة المرور الجديدة"
          value={recover.newPassword}
          onValueChange={(value) => patchRecover({ newPassword: value })}
          onBlur={() => validateField('recover', 'newPassword')}
          error={errors.recover.newPassword}
          autoComplete="new-password"
          icon={ShieldCheck}
        />
        <PasswordStrengthMeter strength={strength} visible={recover.newPassword.length > 0} />
      </motion.div>

      <motion.div variants={cascadeItem}>
        <PasswordField
          name="confirmPassword"
          label="تأكيد كلمة المرور الجديدة"
          value={recover.confirmPassword}
          onValueChange={(value) => patchRecover({ confirmPassword: value })}
          onBlur={() => validateField('recover', 'confirmPassword')}
          error={errors.recover.confirmPassword}
          autoComplete="new-password"
          icon={KeyRound}
        />
      </motion.div>

      <motion.p variants={cascadeItem} className="px-1 text-[0.7rem] leading-relaxed text-ink-500">
        عند الحفظ ستُنهى جميع الجلسات النشطة على الأجهزة الأخرى، ويُسجَّل الإجراء في سجل التدقيق.
      </motion.p>
    </motion.div>
  );
}
