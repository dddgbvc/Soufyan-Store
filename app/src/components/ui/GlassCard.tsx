import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { SPRING_SURFACE } from '../../lib/motion';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * النافذة العائمة: زجاج سائل (Apple) فوق مادة أكريليك/مايكا (Fluent 2).
 * السطح الكبير يحمل ضبابًا أقوى وظلًا أعمق من العناصر الصغيرة —
 * فيُقرأ كطبقة سميكة فعلًا لا كمستطيل شفاف.
 */
export function GlassCard({ children, className }: GlassCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_SURFACE}
      className={cn(
        'relative isolate overflow-hidden',
        'rounded-[1.75rem] sm:rounded-4xl',
        'glass glass-edge grain',
        'border border-white/[0.08]',
        'shadow-acrylic',
        className,
      )}
    >
      {/* طبقة مايكا: إضاءة اتجاهية من الأعلى-اليمين نحو الأسفل-اليسار */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-mica opacity-90"
      />
      {/* خط ضوء علوي رفيع — انعكاس الحافة */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-l from-transparent via-white/25 to-transparent"
      />
      {children}
    </motion.section>
  );
}
