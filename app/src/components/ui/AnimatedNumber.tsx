import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  /** مدة الاستيفاء بالثواني. */
  duration?: number;
  className?: string;
}

/**
 * عدّاد يستوفي بين القيمة السابقة والجديدة.
 * يبدأ دائمًا من القيمة المعروضة حاليًا، فلا تحدث قفزة عند تغيير الاختيار
 * قبل انتهاء الحركة السابقة.
 */
export function AnimatedNumber({ value, duration = 0.55, className }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const currentRef = useRef(value);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      currentRef.current = value;
      setDisplay(value);
      return;
    }

    const controls = animate(currentRef.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        currentRef.current = latest;
        setDisplay(Math.round(latest));
      },
    });

    return () => controls.stop();
  }, [value, duration, reduceMotion]);

  return (
    <span className={className} aria-label={String(value)}>
      {display}
    </span>
  );
}
