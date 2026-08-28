'use client';

import { useEffect, useRef } from 'react';

interface OtpInputProps {
  length: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
}

/**
 * Segmented code entry. One real input per digit so that mobile autofill and
 * one-time-code suggestions work, with paste spread across the boxes.
 */
export function OtpInput({ length, value, onChange, onComplete, disabled, invalid, label }: OtpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const completedFor = useRef<string | null>(null);

  useEffect(() => {
    if (value.length !== length) {
      completedFor.current = null;
      return;
    }
    if (completedFor.current === value) return;
    completedFor.current = value;
    onComplete?.(value);
  }, [length, onComplete, value]);

  function setDigit(index: number, digit: string) {
    const next = value.padEnd(length, ' ').split('');
    next[index] = digit || ' ';
    onChange(next.join('').replace(/\s+$/, '').replace(/\s/g, ''));
  }

  function handleChange(index: number, raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) {
      setDigit(index, '');
      return;
    }

    if (digits.length > 1) {
      // A pasted or autofilled code fills the rest of the boxes at once.
      const merged = (value.slice(0, index) + digits).slice(0, length);
      onChange(merged);
      inputs.current[Math.min(merged.length, length - 1)]?.focus();
      return;
    }

    setDigit(index, digits);
    if (index < length - 1) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
      onChange(value.slice(0, index - 1));
    } else if (event.key === 'ArrowRight' && index > 0) {
      // RTL: "right" moves toward the earlier digit.
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index < length - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  }

  return (
    <div className="flex flex-row-reverse justify-center gap-2.5" role="group" aria-label={label}>
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={value[index] ?? ''}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-label={`${label} — الرقم ${index + 1}`}
          className="field numeral h-14 w-12 p-0 text-center text-xl font-semibold"
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}
