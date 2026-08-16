import { motion, useReducedMotion } from 'framer-motion';
import { Check, Database, Lock, Receipt, ScanBarcode } from 'lucide-react';
import { cn } from '../../lib/cn';
import { cascade, cascadeItem, SPRING } from '../../lib/motion';
import {
  countLedgerAccounts,
  countPosSessions,
  countTables,
  ERP_MODULES,
  MAX_REGISTERS,
  MIN_REGISTERS,
} from '../../lib/modules';
import { useAuth } from '../../state/AuthProvider';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { CounterStepper } from '../ui/CounterStepper';
import { FormAlert } from '../ui/FormAlert';

/**
 * الخطوة ٣ — المعمارية ونشر الوحدات.
 * ملخّص حيّ: كل تبديل وحدة أو تغيير عدد السجلات يعيد حساب الأرقام فورًا،
 * فيرى المسؤول أثر قراره قبل تنفيذ التهيئة.
 */
export function StepArchitecture() {
  const { state, patchRegister, toggleModule } = useAuth();
  const { register, errors } = state;
  const reduceMotion = useReducedMotion();

  const tables = countTables(register.modules);
  const ledgerAccounts = countLedgerAccounts(register.sector, register.modules);
  const sessions = countPosSessions(register.registers);

  return (
    <motion.div variants={cascade} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={cascadeItem}>
        <FormAlert message={errors.register.modules ?? errors.register.form} />
      </motion.div>

      {/* ملخّص المعمارية — ثلاث بطاقات إحصائية */}
      <motion.div variants={cascadeItem} className="grid grid-cols-3 gap-2">
        <StatTile
          icon={Database}
          value={tables}
          label="جدول بيانات"
          tone="royal"
        />
        <StatTile icon={ScanBarcode} value={register.registers} label="سجل بيع" tone="beam" />
        <StatTile icon={Receipt} value={ledgerAccounts} label="حساب دفتري" tone="verify" />
      </motion.div>

      {/* عدد سجلات نقاط البيع */}
      <motion.div variants={cascadeItem}>
        <CounterStepper
          label="سجلات نقاط البيع"
          hint={`${sessions} جلسة بيع متزامنة (ورديتان لكل سجل)`}
          value={register.registers}
          min={MIN_REGISTERS}
          max={MAX_REGISTERS}
          onValueChange={(registers) => patchRegister({ registers })}
        />
      </motion.div>

      {/* وحدات النشر */}
      <motion.div variants={cascadeItem}>
        <p className="mb-2 px-1 text-fluid-xs font-medium text-ink-400">وحدات المنظومة</p>

        <ul className="space-y-1.5">
          {ERP_MODULES.map((module) => {
            const active = register.modules.includes(module.key);
            const Icon = module.icon;

            return (
              <li key={module.key}>
                <button
                  type="button"
                  onClick={() => toggleModule(module.key)}
                  disabled={module.required}
                  aria-pressed={active}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border p-2.5 text-start min-h-tap',
                    'transition-[border-color,background-color] duration-200 ease-apple',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam-500',
                    module.required ? 'cursor-default' : 'cursor-pointer',
                    active
                      ? 'border-royal-500/45 bg-royal-600/[0.10]'
                      : 'border-white/10 bg-onyx-800/40 hover:border-white/20 hover:bg-white/[0.04]',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-200',
                      active ? 'bg-royal-600/25 text-royal-200' : 'bg-white/[0.05] text-ink-500',
                    )}
                  >
                    <Icon className="size-[1.05rem]" aria-hidden="true" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'truncate text-fluid-sm font-semibold transition-colors duration-200',
                          active ? 'text-ink-50' : 'text-ink-300',
                        )}
                      >
                        {module.label}
                      </span>
                      {module.required && (
                        <Lock className="size-3 shrink-0 text-ink-500" aria-hidden="true" />
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.68rem] text-ink-500">
                      {module.description}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    <span className="numeric rounded-lg bg-white/[0.05] px-1.5 py-0.5 text-[0.62rem] font-bold text-ink-400">
                      {module.tables}
                    </span>

                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-md border transition-colors duration-200',
                        active
                          ? 'border-royal-500 bg-royal-600'
                          : 'border-white/15 bg-transparent',
                      )}
                      aria-hidden="true"
                    >
                      <motion.span
                        initial={false}
                        animate={active ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
                        transition={reduceMotion ? { duration: 0.12 } : SPRING}
                        className="flex"
                      >
                        <Check className="size-3 text-white" strokeWidth={3} />
                      </motion.span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </motion.div>

      <motion.p variants={cascadeItem} className="px-1 text-[0.7rem] leading-relaxed text-ink-500">
        عند التأكيد يُنشأ مخطط قاعدة البيانات، وتُهيّأ شجرة الحسابات، وتُفتح الفترة المحاسبية
        الأولى تلقائيًا. الوحدات المقفلة أساسية لتشغيل المنظومة.
      </motion.p>
    </motion.div>
  );
}

/* -------------------------- بطاقة إحصائية -------------------------- */

interface StatTileProps {
  icon: typeof Database;
  value: number;
  label: string;
  tone: 'royal' | 'beam' | 'verify';
}

const TONES: Record<StatTileProps['tone'], string> = {
  royal: 'text-royal-400 bg-royal-600/[0.12] border-royal-500/25',
  beam: 'text-beam-400 bg-beam-500/[0.10] border-beam-500/25',
  verify: 'text-verify-400 bg-verify-500/[0.10] border-verify-500/25',
};

function StatTile({ icon: Icon, value, label, tone }: StatTileProps) {
  return (
    <div className={cn('rounded-2xl border p-2.5 text-center', TONES[tone])}>
      <Icon className="mx-auto mb-1 size-4 opacity-90" aria-hidden="true" />
      <p className="numeric text-fluid-lg font-extrabold leading-none text-ink-50">
        <AnimatedNumber value={value} />
      </p>
      <p className="mt-1 truncate text-[0.62rem] text-ink-400">{label}</p>
    </div>
  );
}
