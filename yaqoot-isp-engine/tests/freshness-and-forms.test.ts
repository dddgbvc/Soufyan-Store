import { describe, expect, it } from 'vitest';
import { classifyFreshness, syncMeta, YAQOOT_OWNED } from '@/modules/isp/core/freshness';
import { redact, isAmbiguousOutcome, operatorMessage } from '@/modules/isp/core/errors';
import { isRetryable, isTerminal } from '@/modules/isp/core/result';
import { validateAll } from '@/components/form/DynamicForm';
import type { FieldDefinition } from '@/modules/isp/core/types';

const NOW = new Date('2026-06-15T10:00:00.000Z');
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();

describe('data freshness', () => {
  it('calls very recent provider data live', () => {
    const result = classifyFreshness(syncMeta('provider', ago(3)), NOW);
    expect(result.level).toBe('live');
  });

  it('labels older data with its age rather than calling it live', () => {
    // Product rule 13: stale data must never look real-time.
    const result = classifyFreshness(syncMeta('provider', ago(90)), NOW);
    expect(result.level).toBe('fresh');
    expect(result.label).toContain('دقيقة');
  });

  it('marks data beyond the stale window as stale', () => {
    const result = classifyFreshness(syncMeta('provider', ago(3600)), NOW);
    expect(result.level).toBe('stale');
  });

  it('reports offline when the connection is down, keeping the last age', () => {
    const result = classifyFreshness(syncMeta('provider', ago(120)), NOW, false);
    expect(result.level).toBe('offline');
    expect(result.label).toContain('غير متصل');
  });

  it('reports never-synced and sync errors distinctly', () => {
    expect(classifyFreshness(syncMeta('provider', null), NOW).level).toBe('offline');
    expect(
      classifyFreshness(syncMeta('provider', ago(10), null, 'error'), NOW).level,
    ).toBe('error');
  });

  it('treats Yaqoot-owned data as always current', () => {
    // Local ledger data is authoritative; it is never "stale".
    expect(classifyFreshness(YAQOOT_OWNED, NOW).level).toBe('live');
  });

  it('treats an unparseable timestamp as an error, not as fresh', () => {
    expect(classifyFreshness(syncMeta('provider', 'nonsense'), NOW).level).toBe('error');
  });
});

describe('error handling', () => {
  it('marks ambiguous outcomes so they are never blindly retried', () => {
    expect(isAmbiguousOutcome('TIMEOUT')).toBe(true);
    expect(isAmbiguousOutcome('UNKNOWN_RESULT')).toBe(true);
    expect(isAmbiguousOutcome('INVALID_CREDENTIALS')).toBe(false);
  });

  it('allows retry only from states where nothing can have happened remotely', () => {
    expect(isRetryable('FAILED')).toBe(true);
    expect(isRetryable('REQUIRES_RECONCILIATION')).toBe(false);
    expect(isTerminal('REQUIRES_RECONCILIATION')).toBe(true);
    expect(isTerminal('SUCCESS')).toBe(true);
  });

  it('gives every reason an Arabic operator message free of internals', () => {
    for (const reason of ['TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE'] as const) {
      const message = operatorMessage(reason);
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/http|null|undefined|stack|token/i);
    }
  });

  it('redacts secrets recursively before anything is logged', () => {
    const redacted = redact({
      username: 'agent',
      password: 'hunter2',
      nested: { api_key: 'abc', authorization: 'Bearer x', keep: 1 },
      list: [{ refresh_token: 'r' }],
    }) as Record<string, unknown>;

    expect(redacted.username).toBe('agent');
    expect(redacted.password).toBe('[REDACTED]');
    const nested = redacted.nested as Record<string, unknown>;
    expect(nested.api_key).toBe('[REDACTED]');
    expect(nested.authorization).toBe('[REDACTED]');
    expect(nested.keep).toBe(1);
    const list = redacted.list as Record<string, unknown>[];
    expect(list[0]?.refresh_token).toBe('[REDACTED]');
  });
});

describe('dynamic form validation', () => {
  const fields: readonly FieldDefinition[] = [
    { key: 'username', type: 'text', label: 'اسم المستخدم', required: true },
    {
      key: 'mac_address',
      type: 'mac',
      label: 'MAC',
      required: false,
    },
    {
      key: 'port',
      type: 'number',
      label: 'المنفذ',
      required: false,
      validation: { min: 1, max: 65535 },
    },
    {
      key: 'otp',
      type: 'otp',
      label: 'رمز التحقق',
      required: false,
      validation: { pattern: '^[0-9]{6}$', message: 'الرمز مكوّن من ٦ أرقام.' },
    },
  ];

  it('requires the fields the provider marks required', () => {
    const errors = validateAll(fields, {});
    expect(errors.username).toBeTruthy();
    expect(errors.mac_address).toBeUndefined();
  });

  it('validates a MAC address', () => {
    expect(validateAll(fields, { username: 'u', mac_address: 'zz' }).mac_address).toBeTruthy();
    expect(
      validateAll(fields, { username: 'u', mac_address: 'AA:BB:CC:DD:EE:FF' }).mac_address,
    ).toBeUndefined();
  });

  it('applies numeric bounds', () => {
    expect(validateAll(fields, { username: 'u', port: '70000' }).port).toBeTruthy();
    expect(validateAll(fields, { username: 'u', port: '8080' }).port).toBeUndefined();
    expect(validateAll(fields, { username: 'u', port: 'abc' }).port).toBeTruthy();
  });

  it('uses the provider-supplied message for a pattern failure', () => {
    expect(validateAll(fields, { username: 'u', optm: '' }).otp).toBeUndefined();
    expect(validateAll(fields, { username: 'u', otp: '12' }).otp).toBe('الرمز مكوّن من ٦ أرقام.');
    expect(validateAll(fields, { username: 'u', otp: '123456' }).otp).toBeUndefined();
  });

  it('skips format rules for an empty optional field', () => {
    expect(validateAll(fields, { username: 'u', mac_address: '   ' }).mac_address).toBeUndefined();
  });
});
