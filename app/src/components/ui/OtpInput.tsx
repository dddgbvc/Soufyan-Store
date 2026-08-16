import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';
import { EASE_APPLE, SPRING } from '../../lib/motion';
import { normalizeDigits } from '../../lib/validation';

interface OtpInputProps {
  value: string;
  onValueChange: (value: string) => void;
  /** يُستدعى تلقائيًا عند اكتمال الأرقام الستة. */
  onComplete?: (value: string) => void;
  length?: number;
  error?: string;
  disabled?: boolean;
  label: string;
}

/**
 * حقل رمز تحقق من ٦ خانات.
 * - `inputMode="numeric"` يستدعي لوحة المفاتيح الرقمية على الجوال.
 * - `autoComplete="one-time-code"` يلتقط الرمز من رسالة SMS على iOS.
 * - الاتجاه LTR داخليًا: ترتيب أرقام الرمز لا يتبع اتجاه النص العربي.
 */
export function OtpInput({
  value,
  onValueChange,
  onComplete,
  length = 6,
  error,
  disabled = false,
  label,
}: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  /**
   * أحدث قيمة معروفة، تُحدَّث فورًا داخل `commit`.
   * نقل التركيز يحدث تزامنيًا قبل إعادة رسم React، فلو قرأ معالج التركيز
   * `value` من الإغلاق لقرأ قيمة قديمة وأعاد التركيز إلى الخانة الأولى —
   * فتضيع الأرقام عند الكتابة السريعة.
   */
  const valueRef = useRef(value);
  valueRef.current = value;

  // التركيز التلقائي على أول خانة فارغة عند ظهور الشاشة.
  useEffect(() => {
    const firstEmpty = Math.min(value.length, length - 1);
    inputsRef.current[firstEmpty]?.focus();
    // مرة واحدة عند التركيب فقط — لا نخطف التركيز أثناء الكتابة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (next: string) => {
    valueRef.current = next;
    onValueChange(next);
    if (next.length === length) {
      onComplete?.(next);
    }
  };

  const handleChange = (index: number, raw: string) => {
    const incoming = normalizeDigits(raw).replace(/\D/g, '');
    if (!incoming) return;

    const chars = value.split('');
    // لصق عدة أرقام دفعة واحدة يملأ الخانات التالية.
    for (let offset = 0; offset < incoming.length && index + offset < length; offset += 1) {
      chars[index + offset] = incoming[offset];
    }

    const next = chars.join('').slice(0, length);
    commit(next);

    const nextFocus = Math.min(index + incoming.length, length - 1);
    inputsRef.current[nextFocus]?.focus();
    inputsRef.current[nextFocus]?.select();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();

      // القيمة تبقى متصلة دائمًا: المسح يقتطع من الخانة الحالية فما بعد.
      if (digits[index]) {
        commit(value.slice(0, index));
        return;
      }

      if (index > 0) {
        commit(value.slice(0, index - 1));
        inputsRef.current[index - 1]?.focus();
      }
      return;
    }

    // الأسهم تتحرك بصريًا: الخانات معروضة LTR.
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputsRef.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = normalizeDigits(event.clipboardData.getData('text')).replace(/\D/g, '');
    if (!pasted) return;

    const next = pasted.slice(0, length);
    commit(next);
    inputsRef.current[Math.min(next.length, length - 1)]?.focus();
  };

  return (
    <div className="w-full">
      <div
        role="group"
        aria-label={label}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? 'otp-error' : undefined}
        dir="ltr"
        className="flex items-center justify-center gap-2 sm:gap-2.5"
      >
        {digits.map((digit, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: index * 0.04 }}
            className="flex-1"
          >
            <input
              ref={(element) => {
                inputsRef.current[index] = element;
              }}
              value={digit}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              onFocus={(event) => {
                // لا يمكن ترك فجوات: التركيز يقفز إلى أول خانة فارغة.
                const current = valueRef.current;
                if (index > current.length) {
                  inputsRef.current[current.length]?.focus();
                  return;
                }
                event.target.select();
              }}
              disabled={disabled}
              // لوحة مفاتيح رقمية مخصّصة + التقاط رمز الرسالة تلقائيًا
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              pattern="[0-9]*"
              maxLength={1}
              type="text"
              aria-label={`الرقم ${index + 1} من ${length}`}
              className={cn(
                'aspect-square w-full min-w-[2.75rem] rounded-2xl text-center',
                'text-[1.35rem] font-bold numeric text-ink-50',
                'bg-onyx-800/70 backdrop-blur-xl',
                'border transition-[border-color,box-shadow,background-color,transform] duration-200 ease-apple',
                'outline-none caret-beam-400',
                'disabled:opacity-50',
                error
                  ? 'border-rose-500/60 focus:border-rose-400'
                  : digit
                    ? 'border-beam-500/45 bg-beam-500/[0.07] shadow-[0_0_18px_-6px_rgb(6_182_212_/_0.5)]'
                    : 'border-white/10 hover:border-white/20',
                'focus:border-beam-500/80 focus:shadow-glow-beam',
              )}
            />
          </motion.div>
        ))}
      </div>

      {error && (
        <motion.p
          id="otp-error"
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: EASE_APPLE }}
          className="mt-3 flex items-center justify-center gap-1.5 text-fluid-xs text-rose-300"
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </motion.p>
      )}
    </div>
  );
}
