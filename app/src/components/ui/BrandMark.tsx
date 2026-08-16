import { cn } from '../../lib/cn';

interface BrandMarkProps {
  className?: string;
  /** إظهار اسم المنظومة بجانب الشعار. */
  withWordmark?: boolean;
  size?: 'sm' | 'md';
}

/**
 * الشعار: بنية هندسية مجرّدة (طبقات معمارية متراكبة) — بلا شخصيات أو رموز تعبيرية،
 * التزامًا بالطابع التنفيذي البحت.
 */
export function BrandMark({ className, withWordmark = true, size = 'md' }: BrandMarkProps) {
  const markSize = size === 'sm' ? 'size-9' : 'size-11';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'relative grid shrink-0 place-items-center rounded-2xl',
          'bg-sheen-royal shadow-glow-royal',
          markSize,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-[60%]"
          role="img"
          aria-label="شعار منظومة سفيان"
        >
          {/* ثلاث طبقات: البيانات، العمليات، التقارير */}
          <path
            d="M12 2.5 21 7l-9 4.5L3 7l9-4.5Z"
            fill="white"
            fillOpacity="0.95"
          />
          <path
            d="M3 12l9 4.5L21 12"
            stroke="white"
            strokeOpacity="0.75"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 16.8l9 4.5 9-4.5"
            stroke="white"
            strokeOpacity="0.45"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {withWordmark && (
        <div className="min-w-0">
          <p className="truncate text-fluid-base font-extrabold leading-tight text-ink-50">
            منظومة سفيان
          </p>
          <p className="latin truncate text-[0.65rem] font-semibold text-ink-500">
            ERP · POS PLATFORM
          </p>
        </div>
      )}
    </div>
  );
}
