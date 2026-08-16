import { motion } from 'framer-motion';
import { ArrowLeftRight, Boxes, LogOut, Receipt, ScanBarcode } from 'lucide-react';
import { cascade, cascadeItem } from '../lib/motion';
import { Button } from './ui/Button';
import { AuroraBackground } from './ui/AuroraBackground';
import { BrandMark } from './ui/BrandMark';
import { GlassCard } from './ui/GlassCard';

interface DashboardGatewayProps {
  /** العودة إلى بوابة الدخول (تسجيل خروج). */
  onSignOut: () => void;
}

const MODULES = [
  { icon: ScanBarcode, label: 'نقطة البيع', hint: 'فتح وردية جديدة' },
  { icon: Boxes, label: 'المخزون', hint: 'الأصناف والجرد' },
  { icon: Receipt, label: 'الفواتير', hint: 'المبيعات والمرتجعات' },
  { icon: ArrowLeftRight, label: 'الحسابات', hint: 'القيود ودفتر الأستاذ' },
];

/**
 * وجهة ما بعد المصادقة.
 * هذه نقطة التسليم إلى لوحة تحكم المنظومة — تُستبدل لاحقًا بتطبيق ERP الكامل
 * أو بمسار توجيه فعلي، دون أي تغيير في بوابة المصادقة.
 */
export function DashboardGateway({ onSignOut }: DashboardGatewayProps) {
  return (
    <div className="relative flex min-h-screen-dynamic w-full items-center justify-center pad-safe">
      <AuroraBackground />

      <motion.div variants={cascade} initial="hidden" animate="show" className="w-full max-w-3xl">
        <GlassCard className="p-5 sm:p-8">
          <motion.div
            variants={cascadeItem}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <BrandMark />
            <Button variant="ghost" onClick={onSignOut} icon={LogOut} iconPosition="start">
              تسجيل الخروج
            </Button>
          </motion.div>

          <motion.h1
            variants={cascadeItem}
            className="mt-7 text-fluid-2xl font-extrabold text-ink-50"
          >
            لوحة تحكم المنظومة
          </motion.h1>
          <motion.p variants={cascadeItem} className="mt-1.5 text-fluid-sm text-ink-400">
            تم تسليم الجلسة بنجاح من بوابة المصادقة. هذه الشاشة نقطة الوصل مع تطبيق ERP الكامل.
          </motion.p>

          <motion.ul
            variants={cascadeItem}
            className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4"
          >
            {MODULES.map((module) => (
              <li
                key={module.label}
                className="rounded-2xl border border-white/10 bg-onyx-800/50 p-4 text-center"
              >
                <module.icon className="mx-auto mb-2 size-5 text-beam-400" aria-hidden="true" />
                <p className="truncate text-fluid-xs font-semibold text-ink-50">{module.label}</p>
                <p className="mt-0.5 truncate text-[0.62rem] text-ink-500">{module.hint}</p>
              </li>
            ))}
          </motion.ul>
        </GlassCard>
      </motion.div>
    </div>
  );
}
