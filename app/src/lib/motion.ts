import type { Transition, Variants } from 'framer-motion';

/* ==========================================================================
   منظومة الحركة — فيزياء نوابض مستوحاة من Apple
   القاعدة: كل حركة تبدأ من القيمة المعروضة حاليًا، فتبقى قابلة للمقاطعة.
   ========================================================================== */

/**
 * النابض الأساسي للمنظومة.
 * نسبة الإخماد ζ = 26 / (2·√320) ≈ 0.73 — استقرار سريع مع مرونة طبيعية خفيفة.
 */
export const SPRING: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 26,
  mass: 0.9,
};

/** نابض مخمَّد كليًا (بلا تجاوز) — للأسطح الكبيرة والعناصر غير المدفوعة بإيماءة. */
export const SPRING_SETTLE: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 36,
  mass: 0.9,
};

/** نابض هادئ للأسطح الواسعة (البطاقة، لوحة العرض الجانبية). */
export const SPRING_SURFACE: Transition = {
  type: 'spring',
  stiffness: 210,
  damping: 30,
  mass: 1,
};

/** منحنى Apple القياسي للتلاشي السريع. */
export const EASE_APPLE = [0.22, 1, 0.36, 1] as const;

/** تأخير الظهور المتتابع لكل عنصر إدخال/زر. */
export const STAGGER_STEP = 0.06;

/* -------------------------- الظهور المتتابع -------------------------- */

export const cascade: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: STAGGER_STEP, delayChildren: 0.04 },
  },
  exit: { opacity: 0, transition: { duration: 0.14, ease: EASE_APPLE } },
};

/**
 * عنصر ضمن التتابع.
 * نحرّك opacity و transform فقط (خصائص صديقة للمركّب) حفاظًا على 60 إطارًا
 * على أجهزة نقاط البيع الضعيفة.
 */
export const cascadeItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14, ease: EASE_APPLE } },
};

/* -------------------------- تحوّلات الخطوات (RTL) -------------------------- */

/**
 * اتجاه انزلاق خطوات المعالج.
 *
 * `rtl-mirror` (الافتراضي): الخطوة التالية تدخل من اليسار وتخرج السابقة إلى اليمين،
 *   وهي المرآة الهندسية الصحيحة لواجهة RTL: الخطوات مصفوفة من اليمين إلى اليسار،
 *   فتتقدّم الكاميرا يسارًا تمامًا كاتجاه امتلاء شريط التقدّم.
 *
 * `ltr-classic`: السلوك المعتاد في الواجهات اللاتينية (التالية تدخل من اليمين).
 *
 * تبديل القيمة هنا يقلب اتجاه كل تحوّلات المعالج في المنظومة.
 */
export const STEP_SLIDE_MODE: 'rtl-mirror' | 'ltr-classic' = 'rtl-mirror';

/** مسافة الانزلاق الأفقي — قصيرة لتبقى الحركة أنيقة لا مسرحية. */
export const STEP_SLIDE_DISTANCE = 44;

/** اتجاه الانتقال: 1 = للأمام (التالي)، −1 = للخلف (السابق). */
export type StepDirection = 1 | -1;

/**
 * متغيّرات انزلاق الخطوات، واعية باتجاه القراءة.
 * الدخول والخروج يسلكان المسار نفسه (اتساق مكاني): ما يخرج يمينًا يعود من اليمين.
 */
export const stepVariants: Variants = {
  enter: (direction: StepDirection) => ({
    opacity: 0,
    x: slideOffset(direction, 'enter'),
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: SPRING,
  },
  exit: (direction: StepDirection) => ({
    opacity: 0,
    x: slideOffset(direction, 'exit'),
    transition: { duration: 0.18, ease: EASE_APPLE },
  }),
};

function slideOffset(direction: StepDirection, phase: 'enter' | 'exit'): number {
  const mirrored = STEP_SLIDE_MODE === 'rtl-mirror' ? -1 : 1;
  const sign = phase === 'enter' ? 1 : -1;
  return direction * mirrored * sign * STEP_SLIDE_DISTANCE;
}

/* -------------------------- تحوّل الشاشات الجذرية -------------------------- */

/**
 * تبدّل الشاشات (دخول ↔ تسجيل ↔ استعادة).
 * المادة «تتجسّد» بتغيّر الحجم والشفافية معًا بدل تلاشٍ مسطّح.
 */
export const viewVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING_SURFACE },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.99,
    transition: { duration: 0.2, ease: EASE_APPLE },
  },
};

/** ظهور لوحة العرض الجانبية (سطح كبير ⇒ نابض أهدأ). */
export const showcaseVariants: Variants = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: { ...SPRING_SURFACE, delay: 0.08 } },
};
