import type { PackageDuration, RenewalSemantics } from '../core/types';

/**
 * Expiry arithmetic driven entirely by provider-declared semantics (spec §8).
 *
 * Product rule 3: never hard-code a 30-day renewal. There is no default period
 * in this file — a package without a duration cannot be renewed by the ERP,
 * and we say so rather than guessing.
 */

export interface ExpiryComputation {
  readonly newExpiry: string | null;
  /** Arabic explanation shown next to the computed date in the renew dialog. */
  readonly explanation: string;
  /** True when the ERP cannot derive the date and must defer to the provider. */
  readonly deferredToProvider: boolean;
}

function addDuration(base: Date, duration: PackageDuration): Date {
  const next = new Date(base.getTime());
  switch (duration.unit) {
    case 'hour':
      next.setUTCHours(next.getUTCHours() + duration.value);
      return next;
    case 'day':
      next.setUTCDate(next.getUTCDate() + duration.value);
      return next;
    case 'week':
      next.setUTCDate(next.getUTCDate() + duration.value * 7);
      return next;
    case 'month':
      next.setUTCMonth(next.getUTCMonth() + duration.value);
      return next;
    case 'year':
      next.setUTCFullYear(next.getUTCFullYear() + duration.value);
      return next;
    default: {
      // Exhaustiveness guard: a new DurationUnit must be handled explicitly.
      const never: never = duration.unit;
      throw new Error(`Unhandled duration unit: ${String(never)}`);
    }
  }
}

function startOfNextMonth(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

export function computeExpiry(
  semantics: RenewalSemantics,
  currentExpiry: string | null,
  duration: PackageDuration | null,
  now: Date = new Date(),
): ExpiryComputation {
  if (semantics === 'provider_defined') {
    return {
      newExpiry: null,
      explanation: 'المزود هو من يحدد تاريخ الانتهاء الجديد بعد تنفيذ التجديد.',
      deferredToProvider: true,
    };
  }

  if (duration === null) {
    return {
      newExpiry: null,
      explanation: 'هذه الباقة بلا مدة محددة — يحدد المزود تاريخ الانتهاء.',
      deferredToProvider: true,
    };
  }

  const current = currentExpiry ? new Date(currentExpiry) : null;
  const currentValid = current !== null && !Number.isNaN(current.getTime());

  switch (semantics) {
    case 'extend_from_expiry': {
      // Extends from the existing expiry even if it is already in the past, so
      // the subscriber is not charged for days they did not receive.
      const base = currentValid ? current : now;
      const next = addDuration(base, duration);
      return {
        newExpiry: next.toISOString(),
        explanation: currentValid
          ? 'يُضاف طول الباقة إلى تاريخ الانتهاء الحالي.'
          : 'لا يوجد تاريخ انتهاء سابق — تُحتسب المدة من الآن.',
        deferredToProvider: false,
      };
    }

    case 'start_from_now': {
      const next = addDuration(now, duration);
      return {
        newExpiry: next.toISOString(),
        explanation: 'تبدأ المدة من لحظة التجديد.',
        deferredToProvider: false,
      };
    }

    case 'calendar_month': {
      const next = startOfNextMonth(currentValid && current > now ? current : now);
      return {
        newExpiry: next.toISOString(),
        explanation: 'تنتهي الباقة مع بداية الشهر التالي حسب دورة المزود.',
        deferredToProvider: false,
      };
    }

    case 'fixed_cycle': {
      // A fixed cycle always advances from the current expiry, keeping the
      // subscriber on the provider's billing day.
      const base = currentValid ? current : now;
      const next = addDuration(base, duration);
      return {
        newExpiry: next.toISOString(),
        explanation: 'دورة فوترة ثابتة — يبقى يوم التجديد كما هو.',
        deferredToProvider: false,
      };
    }

    default: {
      const never: never = semantics;
      throw new Error(`Unhandled renewal semantics: ${String(never)}`);
    }
  }
}

/**
 * Days remaining, floored at nothing — a negative result is meaningful
 * (already expired) and callers rely on the sign.
 */
export function daysUntil(expiry: string | null, now: Date = new Date()): number | null {
  if (expiry === null) return null;
  const at = Date.parse(expiry);
  if (Number.isNaN(at)) return null;
  return Math.ceil((at - now.getTime()) / 86_400_000);
}

/** Threshold used by the "Expiring Soon" widget and the registry filter. */
export const EXPIRING_SOON_DAYS = 7;

export function isExpiringSoon(expiry: string | null, now: Date = new Date()): boolean {
  const days = daysUntil(expiry, now);
  return days !== null && days >= 0 && days <= EXPIRING_SOON_DAYS;
}
