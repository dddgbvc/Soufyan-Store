/**
 * Money is carried as an integer in the currency's *minor units* so that
 * arithmetic never goes through a float. IQD has an exponent of 0 in practice,
 * but the engine must not assume that — a provider may bill in USD (2).
 */
export interface Money {
  /** Integer amount in minor units. 1500 with exponent 0 = 1,500 IQD. */
  readonly amount: number;
  readonly currency: string;
}

const CURRENCY_EXPONENT: Record<string, number> = {
  IQD: 0,
  USD: 2,
  EUR: 2,
  JOD: 3,
};

export function exponentOf(currency: string): number {
  return CURRENCY_EXPONENT[currency.toUpperCase()] ?? 2;
}

export function money(amount: number, currency: string): Money {
  if (!Number.isFinite(amount)) {
    throw new TypeError(`Money amount must be finite, received ${String(amount)}`);
  }
  return { amount: Math.round(amount), currency: currency.toUpperCase() };
}

/** Build Money from a major-unit decimal (e.g. a numeric column, or "25.50"). */
export function fromMajor(value: number | string, currency: string): Money {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) {
    throw new TypeError(`Cannot read a money value from ${JSON.stringify(value)}`);
  }
  return money(n * 10 ** exponentOf(currency), currency);
}

/** Back to a major-unit number, for writing to a Postgres `numeric` column. */
export function toMajor(m: Money): number {
  return m.amount / 10 ** exponentOf(m.currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    // Silently coercing currencies is how ledgers end up wrong. Refuse.
    throw new TypeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function isZero(m: Money): boolean {
  return m.amount === 0;
}

export function isNegative(m: Money): boolean {
  return m.amount < 0;
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amount - b.amount;
}

/**
 * Format for display. Latin digits inside an LTR isolate: §28 requires
 * technical/numeric identifiers to stay readable inside an RTL page.
 */
export function formatMoney(m: Money, locale = 'ar-IQ'): string {
  const exp = exponentOf(m.currency);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
    numberingSystem: 'latn',
  }).format(toMajor(m));
  return `${formatted} ${m.currency}`;
}

/**
 * Profit is only meaningful when BOTH sides are known. A missing wholesale
 * cost must surface as `null`, never as "profit = retail" (§5, rule 4).
 */
export function profit(retail: Money, cost: Money | null): Money | null {
  if (cost === null) return null;
  return subtract(retail, cost);
}
