import { useEffect, useState } from 'react';

/**
 * عدّاد تنازلي بالثواني منذ لحظة `startedAt`.
 * يعيد صفرًا عندما تنتهي المدة أو حين لا توجد لحظة بداية.
 */
export function useCountdown(startedAt: number | null, seconds: number): number {
  const [remaining, setRemaining] = useState(() => computeRemaining(startedAt, seconds));

  useEffect(() => {
    if (startedAt === null) {
      setRemaining(0);
      return;
    }

    setRemaining(computeRemaining(startedAt, seconds));

    const timer = window.setInterval(() => {
      const next = computeRemaining(startedAt, seconds);
      setRemaining(next);
      if (next <= 0) window.clearInterval(timer);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [startedAt, seconds]);

  return remaining;
}

function computeRemaining(startedAt: number | null, seconds: number): number {
  if (startedAt === null) return 0;
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  return Math.max(0, seconds - elapsed);
}
