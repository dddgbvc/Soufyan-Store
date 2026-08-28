'use client';

import { useEffect, useRef } from 'react';

import { CloseIcon } from '@/components/ui/icons';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * A modal panel that behaves like one: focus moves in, Escape and the backdrop
 * close it, Tab cannot wander out, and the page behind it stops scrolling.
 */
export function Sheet({ open, onClose, title, description, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    // Land on the first control rather than leaving focus behind the backdrop.
    window.setTimeout(() => focusables()[0]?.focus(), 60);

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = overflow;
      restoreFocusTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="إغلاق"
        className="absolute inset-0 animate-fade bg-sunken/80 backdrop-blur-sm"
        onClick={onClose}
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel animate-rise relative z-10 max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none p-6 sm:rounded-b-3xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-1 text-sm text-ink-faint">{description}</p> : null}
          </div>
          <button type="button" className="btn btn-quiet -m-2 p-2" onClick={onClose} aria-label="إغلاق">
            <CloseIcon className="text-lg" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
