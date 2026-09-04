import { describe, expect, it } from 'vitest';
import { computeExpiry, daysUntil, isExpiringSoon } from '@/modules/isp/subscriptions/renewal';

const NOW = new Date('2026-06-15T10:00:00.000Z');

describe('renewal semantics', () => {
  it('extends from the existing expiry, not from today', () => {
    // The subscriber must not lose the days they already paid for.
    const result = computeExpiry(
      'extend_from_expiry',
      '2026-06-20T00:00:00.000Z',
      { value: 30, unit: 'day' },
      NOW,
    );
    expect(result.newExpiry).toBe('2026-07-20T00:00:00.000Z');
    expect(result.deferredToProvider).toBe(false);
  });

  it('extends from a past expiry rather than snapping to now', () => {
    // Renewing three days late still yields a full period from the old date,
    // so the customer is not charged for days they did not receive.
    const result = computeExpiry(
      'extend_from_expiry',
      '2026-06-12T00:00:00.000Z',
      { value: 30, unit: 'day' },
      NOW,
    );
    expect(result.newExpiry).toBe('2026-07-12T00:00:00.000Z');
  });

  it('starts from now when the provider says so', () => {
    const result = computeExpiry(
      'start_from_now',
      '2026-06-20T00:00:00.000Z',
      { value: 7, unit: 'day' },
      NOW,
    );
    expect(result.newExpiry).toBe('2026-06-22T10:00:00.000Z');
  });

  it('rolls to the start of next month for calendar billing', () => {
    const result = computeExpiry('calendar_month', null, { value: 1, unit: 'month' }, NOW);
    expect(result.newExpiry).toBe('2026-07-01T00:00:00.000Z');
  });

  it('defers to the provider when semantics are provider-defined', () => {
    const result = computeExpiry(
      'provider_defined',
      '2026-06-20T00:00:00.000Z',
      { value: 30, unit: 'day' },
      NOW,
    );
    expect(result.newExpiry).toBeNull();
    expect(result.deferredToProvider).toBe(true);
  });

  it('refuses to guess a period for a package with no duration', () => {
    // Product rule 3: no hard-coded 30 days anywhere.
    const result = computeExpiry('extend_from_expiry', '2026-06-20T00:00:00.000Z', null, NOW);
    expect(result.newExpiry).toBeNull();
    expect(result.deferredToProvider).toBe(true);
  });

  it('handles hour, week, month and year units', () => {
    const base = '2026-06-15T00:00:00.000Z';
    expect(
      computeExpiry('start_from_now', base, { value: 3, unit: 'hour' }, NOW).newExpiry,
    ).toBe('2026-06-15T13:00:00.000Z');
    expect(
      computeExpiry('extend_from_expiry', base, { value: 2, unit: 'week' }, NOW).newExpiry,
    ).toBe('2026-06-29T00:00:00.000Z');
    expect(
      computeExpiry('extend_from_expiry', base, { value: 3, unit: 'month' }, NOW).newExpiry,
    ).toBe('2026-09-15T00:00:00.000Z');
    expect(
      computeExpiry('extend_from_expiry', base, { value: 1, unit: 'year' }, NOW).newExpiry,
    ).toBe('2027-06-15T00:00:00.000Z');
  });

  it('falls back to now when there is no previous expiry', () => {
    const result = computeExpiry('extend_from_expiry', null, { value: 30, unit: 'day' }, NOW);
    expect(result.newExpiry).toBe('2026-07-15T10:00:00.000Z');
  });

  it('ignores an unparseable expiry rather than producing an invalid date', () => {
    const result = computeExpiry(
      'extend_from_expiry',
      'not-a-date',
      { value: 30, unit: 'day' },
      NOW,
    );
    expect(result.newExpiry).toBe('2026-07-15T10:00:00.000Z');
  });
});

describe('expiry helpers', () => {
  it('returns a negative day count for an expired subscription', () => {
    expect(daysUntil('2026-06-10T10:00:00.000Z', NOW)).toBe(-5);
  });

  it('treats only the next seven days as expiring soon', () => {
    expect(isExpiringSoon('2026-06-18T10:00:00.000Z', NOW)).toBe(true);
    expect(isExpiringSoon('2026-06-30T10:00:00.000Z', NOW)).toBe(false);
    // Already expired is not "expiring soon" — it is a different state.
    expect(isExpiringSoon('2026-06-10T10:00:00.000Z', NOW)).toBe(false);
    expect(isExpiringSoon(null, NOW)).toBe(false);
  });
});
