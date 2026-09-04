'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DynamicForm, useFormState, validateAll } from '@/components/form/DynamicForm';
import { ProviderBadge } from '@/components/glass/Badges';
import type {
  AuthMethod,
  AuthRequirements,
  SecondFactorChallenge,
} from '@/modules/isp/providers/core/auth';

/**
 * Provider login gate (spec §41, §44, §47).
 *
 * Deliberately generic: no provider name, no provider-specific field, no
 * provider-specific error handling. The adapter supplies the method list and
 * the field schema; this renders them in Yaqoot's own visual language so the
 * operator never feels they left the ERP for a vendor portal (§48).
 */

export type LoginPhase = 'credentials' | 'mfa' | 'discovering';

export interface ProviderIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly logoUrl: string | null;
  readonly accentColor: string | null;
}

async function postAuth(body: unknown): Promise<{
  ok: boolean;
  kind?: string;
  message?: string;
  challenge?: SecondFactorChallenge;
  requirements?: AuthRequirements;
}> {
  const response = await fetch('/api/isp/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

export function ProviderLoginModal({
  provider,
  open,
  onClose,
  onAuthenticated,
}: {
  provider: ProviderIdentity;
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}) {
  const [requirements, setRequirements] = useState<AuthRequirements | null>(null);
  const [methodId, setMethodId] = useState<string>('');
  const [phase, setPhase] = useState<LoginPhase>('credentials');
  const [challenge, setChallenge] = useState<SecondFactorChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      const result = await postAuth({ action: 'requirements', providerId: provider.id });
      if (cancelled || !result.requirements) return;
      setRequirements(result.requirements);
      setMethodId(result.requirements.defaultMethodId);
      setPhase('credentials');
      setChallenge(null);
      setError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, provider.id]);

  const method: AuthMethod | null =
    requirements?.methods.find((m) => m.id === methodId) ?? requirements?.methods[0] ?? null;

  const fields = phase === 'mfa' && challenge ? challenge.fields : (method?.fields ?? []);
  const form = useFormState(fields);

  if (!open) return null;

  // A provider with no documented auth method (e.g. an unimplemented adapter)
  // must show its state, not a fake form.
  const unconfigured = method?.kind === 'none';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const errors = validateAll(fields, form.values);
    if (Object.keys(errors).length > 0) {
      form.setErrors(errors);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result =
        phase === 'mfa' && challenge
          ? await postAuth({
              action: 'mfa',
              challengeId: challenge.challengeId,
              answers: form.values,
            })
          : await postAuth({
              action: 'login',
              providerId: provider.id,
              methodId,
              credentials: form.values,
              persistence: remember ? 'remember' : 'session_only',
            });

      if (!result.ok) {
        setError(result.message ?? 'تعذر إكمال الاتصال.');
        return;
      }

      if (result.kind === 'mfa' && result.challenge) {
        setChallenge(result.challenge);
        setPhase('mfa');
        form.reset();
        return;
      }

      // Authenticated: discovery already ran server-side (§43).
      setPhase('discovering');
      onAuthenticated();
    } catch {
      setError('تعذر الاتصال بمزود الخدمة حالياً. تحقق من الاتصال أو حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 grid place-items-center p-4"
        style={{ background: 'rgba(10,12,18,.55)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`الاتصال بمزود ${provider.displayName}`}
          className="glass w-full max-w-md p-6"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* هوية ياقوت أولاً، وهوية المزود تابعة لها (§48) */}
          <p className="text-xs tracking-wide text-[var(--muted)]">ياقوت ERP</p>

          <div className="mt-2 flex items-center justify-between gap-3">
            <ProviderBadge
              name={provider.displayName}
              logoUrl={provider.logoUrl}
              accent={provider.accentColor}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)]"
            >
              ✕
            </button>
          </div>

          {requirements === null ? (
            <div className="mt-6 flex flex-col gap-3">
              <div className="shimmer h-10 rounded-xl" />
              <div className="shimmer h-10 rounded-xl" />
            </div>
          ) : unconfigured ? (
            <div className="mt-5 flex flex-col gap-3">
              <p className="text-sm text-[var(--text-2)]">{method?.description}</p>
              <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">
                هذا المزود مُعرَّف في النظام لكن تكامله غير مُفعّل بعد. لن تظهر أي عملية
                عليه حتى تُضبط بيانات الاتصال الرسمية.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5">
              {/* محدّد طريقة الدخول يظهر فقط عند وجود أكثر من طريقة (§47) */}
              {phase === 'credentials' && requirements.methods.length > 1 ? (
                <div className="mb-4 flex flex-wrap gap-2">
                  {requirements.methods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={m.id === methodId}
                      onClick={() => {
                        setMethodId(m.id);
                        form.reset();
                      }}
                      className="rounded-full border px-3 py-1 text-xs"
                      style={{
                        borderColor: m.id === methodId ? 'var(--primary)' : 'var(--border)',
                        color: m.id === methodId ? 'var(--primary)' : 'var(--text-2)',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {phase === 'mfa' && challenge ? (
                <p className="mb-3 text-sm text-[var(--text-2)]">{challenge.prompt}</p>
              ) : null}

              <DynamicForm
                fields={fields}
                values={form.values}
                errors={form.errors}
                onChange={form.change}
                disabled={busy}
                idPrefix={`login-${provider.id}`}
              />

              {phase === 'credentials' && requirements.allowPersistentSession ? (
                <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-2)]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  تذكّر الاتصال الآمن
                </label>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl px-3 py-2 text-sm"
                  style={{
                    color: 'var(--danger)',
                    background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
                  }}
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="mt-5 w-full rounded-xl py-2.5 font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--primary)' }}
              >
                {busy
                  ? phase === 'discovering'
                    ? 'جارٍ اكتشاف الخدمات…'
                    : 'جارٍ الاتصال…'
                  : phase === 'mfa'
                    ? 'تأكيد الرمز'
                    : 'تسجيل الدخول'}
              </button>

              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[var(--muted)]">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--ok)' }}
                />
                اتصال آمن — بيانات الدخول تُرسل من خادم ياقوت ولا تُحفظ في المتصفح
              </p>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
