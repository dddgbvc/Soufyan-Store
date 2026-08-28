'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { BackspaceIcon, CloseIcon } from '@/components/ui/icons';

export type PinPadState = 'idle' | 'verifying' | 'error' | 'success';

interface PinPadProps {
  length: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  state?: PinPadState;
  /** Shown under the dots; keeps the layout from jumping between states. */
  hint?: React.ReactNode;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * The primary way into the system: six digits, no employee list, no name.
 *
 * Everything here is presentation. The digits are held in the parent's state
 * for the lifetime of one attempt and posted straight to the server — they are
 * never written to storage, a URL, or a form that could be autofilled.
 */
export function PinPad({ length, value, onChange, onComplete, disabled = false, state = 'idle', hint }: PinPadProps) {
  const [pressed, setPressed] = useState<string | null>(null);
  const completedFor = useRef<string | null>(null);

  const append = useCallback(
    (digit: string) => {
      if (disabled || value.length >= length) return;
      onChange(value + digit);
    },
    [disabled, length, onChange, value],
  );

  const backspace = useCallback(() => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  }, [disabled, onChange, value]);

  const clear = useCallback(() => {
    if (disabled || value.length === 0) return;
    onChange('');
  }, [disabled, onChange, value.length]);

  // Submit as soon as the last digit lands — the expected behaviour at a till.
  useEffect(() => {
    if (value.length !== length) {
      completedFor.current = null;
      return;
    }
    if (completedFor.current === value) return;
    completedFor.current = value;
    onComplete?.(value);
  }, [length, onComplete, value]);

  // A physical keyboard should work exactly like the on-screen keys.
  useEffect(() => {
    if (disabled) return;

    function handleKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        append(event.key);
        flash(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        backspace();
        flash('backspace');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        clear();
        flash('clear');
      }
    }

    function flash(key: string) {
      setPressed(key);
      window.setTimeout(() => setPressed((current) => (current === key ? null : current)), 110);
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [append, backspace, clear, disabled]);

  return (
    <div className="flex flex-col items-center gap-7">
      <div className="flex flex-col items-center gap-3">
        {/* A PIN fills left-to-right even in an RTL interface. */}
        <div
          dir="ltr"
          className={`flex items-center gap-3.5 ${state === 'error' ? 'animate-shake' : ''}`}
          aria-hidden="true"
        >
          {Array.from({ length }, (_, index) => {
            const filled = index < value.length;
            return (
              <span
                key={index}
                className={[
                  'block rounded-full transition-[width,height,background-color,box-shadow] duration-200',
                  filled ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5',
                  state === 'error' && filled
                    ? 'bg-danger'
                    : state === 'success' && filled
                      ? 'bg-success'
                      : filled
                        ? 'bg-brass shadow-[0_0_12px_var(--color-brass-glow)]'
                        : 'bg-line',
                ].join(' ')}
              >
                {filled ? <span className="animate-dot block h-full w-full rounded-full bg-inherit" /> : null}
              </span>
            );
          })}
        </div>

        {/* Screen readers get the count, never the digits. */}
        <p role="status" aria-live="polite" className="sr-only">
          {`أدخلت ${value.length} من ${length} أرقام`}
        </p>

        <div className="min-h-[1.5rem] text-center text-sm">{hint}</div>
      </div>

      {/* Numeric keypads are universally 1-2-3 from the left; mirroring one
          would put every digit where the muscle memory is not. */}
      <div
        dir="ltr"
        className="stagger grid w-full max-w-[19rem] grid-cols-3 gap-3"
        role="group"
        aria-label="لوحة إدخال الرمز"
      >
        {KEYS.map((digit) => (
          <button
            key={digit}
            type="button"
            className="key numeral"
            disabled={disabled}
            data-pressed={pressed === digit}
            onClick={() => append(digit)}
            aria-label={digit}
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          className="key text-ink-faint"
          disabled={disabled || value.length === 0}
          data-pressed={pressed === 'clear'}
          onClick={clear}
          aria-label="مسح الكل"
        >
          <CloseIcon className="text-xl" />
        </button>

        <button
          key="0"
          type="button"
          className="key numeral"
          disabled={disabled}
          data-pressed={pressed === '0'}
          onClick={() => append('0')}
          aria-label="0"
        >
          0
        </button>

        <button
          type="button"
          className="key text-ink-faint"
          disabled={disabled || value.length === 0}
          data-pressed={pressed === 'backspace'}
          onClick={backspace}
          aria-label="حذف رقم"
        >
          <BackspaceIcon className="text-xl" />
        </button>
      </div>
    </div>
  );
}
