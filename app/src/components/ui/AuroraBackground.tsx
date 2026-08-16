import { useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/cn';

/**
 * خلفية الأجواء: هالات ضوئية متراكبة + شبكة هندسية خافتة.
 * الحركة بطيئة جدًا ومنخفضة التباين، وتتوقف تمامًا عند تفعيل «تقليل الحركة»
 * لتجنّب أي انزعاج بصري (خلفية متحركة بملء الشاشة).
 */
export function AuroraBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* القاعدة: أونيكس عميق */}
      <div className="absolute inset-0 bg-onyx-900" />

      {/* هالة ملكية من الأعلى-اليمين (مصدر الضوء الأساسي في واجهة RTL) */}
      <div
        className={cn(
          'absolute -top-[22%] -right-[12%] size-[65vmax] rounded-full',
          'bg-[radial-gradient(circle,rgb(37_99_235_/_0.32)_0%,transparent_62%)]',
          'blur-[60px]',
          !reduceMotion && 'animate-aurora-drift',
        )}
      />

      {/* هالة سماوية من الأسفل-اليسار — تباين اتجاهي */}
      <div
        className={cn(
          'absolute -bottom-[26%] -left-[16%] size-[58vmax] rounded-full',
          'bg-[radial-gradient(circle,rgb(6_182_212_/_0.24)_0%,transparent_60%)]',
          'blur-[70px]',
          !reduceMotion && 'animate-aurora-drift [animation-delay:-9s]',
        )}
      />

      {/* لمسة زمردية خافتة تربط حالة التحقق بالهوية البصرية */}
      <div className="absolute bottom-[8%] right-[24%] size-[26vmax] rounded-full bg-[radial-gradient(circle,rgb(16_185_129_/_0.12)_0%,transparent_65%)] blur-[80px]" />

      {/* شبكة معمارية دقيقة — بنية بلا ضجيج */}
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(to left, rgb(148 163 184 / 0.09) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.09) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, #000 20%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 40%, #000 20%, transparent 78%)',
        }}
      />

      {/* تعتيم الأطراف لتركيز البصر على النافذة */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(4_7_14_/_0.72)_100%)]" />
    </div>
  );
}
