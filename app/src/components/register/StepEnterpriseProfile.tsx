import { motion } from 'framer-motion';
import { Store } from 'lucide-react';
import { cascade, cascadeItem } from '../../lib/motion';
import { CURRENCY_OPTIONS, SECTOR_OPTIONS } from '../../lib/modules';
import { useAuth } from '../../state/AuthProvider';
import type { BusinessSector, Currency } from '../../types/auth';
import { OptionGroup, type OptionItem } from '../ui/OptionGroup';
import { TextField } from '../ui/TextField';

const sectorItems: OptionItem<BusinessSector>[] = SECTOR_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
  hint: option.hint,
}));

const currencyItems: OptionItem<Currency>[] = CURRENCY_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
  hint: option.hint,
  badge: option.symbol,
}));

/** الخطوة ٢ — ملف المنشأة ونقاط البيع. */
export function StepEnterpriseProfile() {
  const { state, patchRegister, validateField } = useAuth();
  const { register, errors } = state;

  return (
    <motion.div variants={cascade} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={cascadeItem}>
        <TextField
          name="companyName"
          label="اسم المنشأة أو المتجر"
          value={register.companyName}
          onValueChange={(value) => patchRegister({ companyName: value })}
          onBlur={() => validateField('register', 'companyName')}
          error={errors.register.companyName}
          icon={Store}
          autoComplete="organization"
          dir="auto"
          enterKeyHint="next"
          hint={errors.register.companyName ? undefined : 'يظهر على الفواتير وإيصالات نقاط البيع.'}
        />
      </motion.div>

      <motion.div variants={cascadeItem}>
        <OptionGroup
          legend="قطاع النشاط"
          options={sectorItems}
          value={register.sector}
          onValueChange={(sector) => patchRegister({ sector })}
        />
      </motion.div>

      <motion.div variants={cascadeItem}>
        <OptionGroup
          legend="العملة الأساسية"
          options={currencyItems}
          value={register.currency}
          onValueChange={(currency) => patchRegister({ currency })}
          layout="segmented"
        />
      </motion.div>

      <motion.p variants={cascadeItem} className="px-1 text-[0.7rem] leading-relaxed text-ink-500">
        يحدّد القطاع شجرة الحسابات الابتدائية وقوالب التقارير. يمكن إضافة عملات ثانوية لاحقًا
        من إعدادات المنظومة.
      </motion.p>
    </motion.div>
  );
}
