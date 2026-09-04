'use client';

import { useMemo, useState } from 'react';
import type { FieldDefinition } from '@/modules/isp/core/types';

/**
 * Schema-driven form (spec §9, §47).
 *
 * Contains no provider names and no provider-specific logic. The adapter
 * supplies the field definitions; this renders and validates them. That is
 * what lets a new provider with a different login (agent code, API key, OTP)
 * work without touching the UI.
 */

export type FormValues = Record<string, string>;

function validateField(field: FieldDefinition, raw: string): string | null {
  const value = raw.trim();

  if (field.required && value === '') {
    return 'هذا الحقل مطلوب.';
  }
  if (value === '') return null;

  const v = field.validation;
  if (v?.pattern) {
    // Anchored so a partial match cannot pass a whole-value rule.
    const re = new RegExp(v.pattern);
    if (!re.test(value)) return v.message ?? 'القيمة غير مطابقة للصيغة المطلوبة.';
  }
  if (v?.minLength !== undefined && value.length < v.minLength) {
    return v.message ?? `أقل طول ${v.minLength}.`;
  }
  if (v?.maxLength !== undefined && value.length > v.maxLength) {
    return v.message ?? `أكبر طول ${v.maxLength}.`;
  }
  if (field.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'أدخل رقماً صحيحاً.';
    if (v?.min !== undefined && n < v.min) return v.message ?? `أقل قيمة ${v.min}.`;
    if (v?.max !== undefined && n > v.max) return v.message ?? `أكبر قيمة ${v.max}.`;
  }
  if (field.type === 'mac' && !/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(value)) {
    return 'صيغة MAC غير صحيحة (AA:BB:CC:DD:EE:FF).';
  }
  if (field.type === 'ip' && !/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return 'صيغة IP غير صحيحة.';
  }
  return null;
}

export function validateAll(
  fields: readonly FieldDefinition[],
  values: FormValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const error = validateField(field, values[field.key] ?? '');
    if (error) errors[field.key] = error;
  }
  return errors;
}

const INPUT_CLASS =
  'w-full rounded-xl border bg-[var(--surface-2)] px-3.5 py-2.5 text-[15px] ' +
  'text-[var(--text)] outline-none transition-shadow ' +
  'focus:border-[var(--primary)] focus:shadow-[var(--glow)]';

function inputTypeFor(field: FieldDefinition): string {
  switch (field.type) {
    case 'password':
      return 'password';
    case 'number':
      return 'number';
    case 'email':
      return 'email';
    case 'tel':
      return 'tel';
    case 'date':
      return 'date';
    case 'otp':
      return 'text';
    default:
      return 'text';
  }
}

export function DynamicForm({
  fields,
  values,
  errors,
  onChange,
  disabled = false,
  idPrefix = 'df',
}: {
  fields: readonly FieldDefinition[];
  values: FormValues;
  errors: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const errorId = `${id}-error`;
        const helpId = `${id}-help`;
        const error = errors[field.key];
        const value = values[field.key] ?? '';

        // Technical identifiers stay LTR inside the RTL page (§28).
        const ltr = field.ltr === true;

        return (
          <div key={field.key} className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-sm text-[var(--text-2)]">
              {field.label}
              {field.required ? (
                <span aria-hidden className="ms-1" style={{ color: 'var(--danger)' }}>
                  *
                </span>
              ) : null}
            </label>

            {field.type === 'select' ? (
              <select
                id={id}
                className={INPUT_CLASS}
                style={{ borderColor: error ? 'var(--danger)' : 'var(--border)' }}
                value={value}
                disabled={disabled || field.readOnly === true}
                required={field.required}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : field.helpText ? helpId : undefined}
                onChange={(e) => onChange(field.key, e.target.value)}
              >
                <option value="">— اختر —</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'boolean' ? (
              <input
                id={id}
                type="checkbox"
                className="h-5 w-5 accent-[var(--primary)]"
                checked={value === 'true'}
                disabled={disabled || field.readOnly === true}
                onChange={(e) => onChange(field.key, String(e.target.checked))}
              />
            ) : field.type === 'textarea' ? (
              <textarea
                id={id}
                rows={3}
                className={INPUT_CLASS}
                style={{ borderColor: error ? 'var(--danger)' : 'var(--border)' }}
                value={value}
                disabled={disabled || field.readOnly === true}
                required={field.required}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : field.helpText ? helpId : undefined}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            ) : (
              <input
                id={id}
                type={inputTypeFor(field)}
                inputMode={field.type === 'otp' ? 'numeric' : undefined}
                autoComplete={
                  field.type === 'password' ? 'current-password' : field.secure ? 'off' : undefined
                }
                className={`${INPUT_CLASS} ${ltr ? 'ltr' : ''}`}
                style={{ borderColor: error ? 'var(--danger)' : 'var(--border)' }}
                dir={ltr ? 'ltr' : undefined}
                value={value}
                placeholder={field.placeholder}
                disabled={disabled || field.readOnly === true}
                required={field.required}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : field.helpText ? helpId : undefined}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            )}

            {error ? (
              <p id={errorId} className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
                {error}
              </p>
            ) : field.helpText ? (
              <p id={helpId} className="text-xs text-[var(--muted)]">
                {field.helpText}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Small helper for components that own form state. */
export function useFormState(fields: readonly FieldDefinition[]) {
  const initial = useMemo(() => {
    const out: FormValues = {};
    for (const field of fields) out[field.key] = '';
    return out;
  }, [fields]);

  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  return {
    values,
    errors,
    setErrors,
    reset: () => {
      setValues(initial);
      setErrors({});
    },
    change: (key: string, value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
  };
}
