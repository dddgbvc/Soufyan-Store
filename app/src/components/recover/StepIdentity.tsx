import { motion } from 'framer-motion';
import { AtSign, Building2, Phone, ShieldQuestion } from 'lucide-react';
import { cascade, cascadeItem } from '../../lib/motion';
import { detectIdentifierKind } from '../../lib/validation';
import { useAuth } from '../../state/AuthProvider';
import { TextField } from '../ui/TextField';

/** الخطوة ١ — تحديد الهوية لإرسال رمز التحقق. */
export function StepIdentity() {
  const { state, patchRecover, validateField } = useAuth();
  const { recover, errors } = state;

  const kind = detectIdentifierKind(recover.identifier);
  const Icon = kind === 'phone' ? Phone : kind === 'email' ? AtSign : Building2;

  return (
    <motion.div variants={cascade} initial="hidden" animate="show" className="space-y-4">
      <motion.div
        variants={cascadeItem}
        className="flex items-start gap-3 rounded-2xl border border-white/10 bg-onyx-800/40 p-3"
      >
        <ShieldQuestion className="mt-px size-[1.15rem] shrink-0 text-beam-400" aria-hidden="true" />
        <p className="text-[0.72rem] leading-relaxed text-ink-400">
          أدخل البريد الإلكتروني أو رقم الهاتف المرتبط بحسابك، وسنرسل رمز تحقق مكوّنًا من ٦ أرقام
          صالحًا لعشر دقائق.
        </p>
      </motion.div>

      <motion.div variants={cascadeItem}>
        <TextField
          name="identifier"
          label="البريد الإلكتروني أو رقم الهاتف"
          value={recover.identifier}
          onValueChange={(value) => patchRecover({ identifier: value })}
          onBlur={() => validateField('recover', 'identifier')}
          error={errors.recover.identifier}
          icon={Icon}
          inputMode={kind === 'phone' ? 'tel' : 'email'}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          dir="ltr"
          className="[&_input]:text-end"
          enterKeyHint="send"
        />
      </motion.div>
    </motion.div>
  );
}
