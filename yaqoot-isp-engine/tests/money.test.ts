import { describe, expect, it } from 'vitest';
import {
  add,
  formatMoney,
  fromMajor,
  money,
  profit,
  subtract,
  toMajor,
} from '@/modules/isp/core/money';

describe('money', () => {
  it('round-trips IQD, which has no minor unit', () => {
    const value = fromMajor(25000, 'IQD');
    expect(value.amount).toBe(25000);
    expect(toMajor(value)).toBe(25000);
  });

  it('round-trips a two-decimal currency without float drift', () => {
    const value = fromMajor('25.50', 'USD');
    expect(value.amount).toBe(2550);
    expect(toMajor(value)).toBe(25.5);
  });

  it('adds and subtracts in minor units', () => {
    expect(add(money(1000, 'IQD'), money(500, 'IQD')).amount).toBe(1500);
    expect(subtract(money(1000, 'IQD'), money(1500, 'IQD')).amount).toBe(-500);
  });

  it('refuses to mix currencies rather than silently coercing', () => {
    // Silent coercion is how a ledger ends up quietly wrong.
    expect(() => add(money(1000, 'IQD'), money(10, 'USD'))).toThrow(/Currency mismatch/);
  });

  it('rejects a non-finite amount', () => {
    expect(() => money(Number.NaN, 'IQD')).toThrow();
    expect(() => fromMajor('abc', 'IQD')).toThrow();
  });

  it('renders money LTR with Latin digits', () => {
    const formatted = formatMoney(money(1750000, 'IQD'));
    expect(formatted).toContain('IQD');
    expect(formatted).toMatch(/1[,.]750[,.]000/);
  });

  it('returns null profit when the wholesale cost is unknown', () => {
    // Spec §5: a missing cost must never render as "profit = retail".
    expect(profit(money(40000, 'IQD'), null)).toBeNull();
    expect(profit(money(40000, 'IQD'), money(31000, 'IQD'))?.amount).toBe(9000);
  });
});
