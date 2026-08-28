'use client';

import { useCallback, useEffect, useState } from 'react';

import { PasswordForm } from '@/components/auth/PasswordForm';
import { PinPad } from '@/components/auth/PinPad';
import { StatusRail } from '@/components/auth/StatusRail';
import { Alert } from '@/components/ui/Alert';
import { CheckIcon, LockIcon, MailIcon, QrIcon, ShieldIcon, Spinner } from '@/components/ui/icons';
import { ApiError, apiFetch } from '@/lib/api';

type Phase = 'checking' | 'ready' | 'approving' | 'approved' | 'invalid' | 'expired';
type Method = 'pin' | 'password';

interface ApproveScreenProps {
  pinLength: number;
  passwordLoginEnabled: boolean;
}

/**
 * What the employee's phone shows after scanning.
 *
 * Approval is a full authentication in its own right: scanning proves the phone
 * saw the screen, but only correct credentials release the waiting device.
 */
export function ApproveScreen({ pinLength, passwordLoginEnabled }: ApproveScreenProps) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [token, setToken] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('pin');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  /**
   * Reads the handle out of the URL fragment and validates it in one pass.
   *
   * The fragment is scrubbed from the address bar immediately: it is a
   * one-time handle and has no business surviving in the browser history.
   * The work is deferred a tick so the loading state paints first.
   */
  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(() => {
      void (async () => {
        const match = window.location.hash.match(/t=([A-Za-z0-9_-]+)/);
        if (match) window.history.replaceState(null, '', window.location.pathname);

        const scanned = match?.[1] ?? null;

        try {
          if (!scanned) throw new ApiError(400, { error: 'qr_invalid', message: 'رمز غير صالح.' });

          const preview = await apiFetch<{ secondsRemaining: number }>('/api/auth/qr/inspect', {
            method: 'POST',
            body: JSON.stringify({ token: scanned }),
          });
          if (cancelled) return;

          setToken(scanned);
          setSecondsLeft(preview.secondsRemaining);
          setPhase('ready');
        } catch (caught) {
          if (cancelled) return;
          const code = caught instanceof ApiError ? caught.code : 'qr_invalid';
          setError(caught instanceof ApiError ? caught.message : 'رمز غير صالح.');
          setPhase(code === 'qr_expired' ? 'expired' : 'invalid');
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'ready' || secondsLeft === null) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((seconds) => {
        if (seconds === null) return null;
        if (seconds <= 1) {
          setPhase('expired');
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase, secondsLeft]);

  const approveWithPin = useCallback(
    async (value: string) => {
      if (!token) return;
      setPhase('approving');
      setError(null);

      try {
        await apiFetch('/api/auth/qr/approve', {
          method: 'POST',
          body: JSON.stringify({ token, method: 'pin', pin: value }),
        });
        setPhase('approved');
      } catch (caught) {
        const failure = caught instanceof ApiError ? caught : null;
        setPin('');
        setError(failure?.message ?? 'تعذّرت الموافقة.');
        setPhase(failure?.code === 'qr_expired' ? 'expired' : 'ready');
      }
    },
    [token],
  );

  return (
    <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-8">
      <div className="w-full max-w-sm">
        <StatusRail />
      </div>

      <section className="panel animate-rise w-full max-w-sm p-7">
        <header className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line-soft bg-sunken text-brass">
            {phase === 'approved' ? <CheckIcon className="text-2xl" /> : <ShieldIcon className="text-2xl" />}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">تسجيل الدخول إلى النظام</h1>
            <p className="mt-1 text-sm text-ink-faint">
              {phase === 'approved'
                ? 'تمت الموافقة بنجاح'
                : 'أكّد هويتك للسماح بفتح النظام على الجهاز الآخر'}
            </p>
          </div>
        </header>

        {phase === 'checking' ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-faint">
            <Spinner /> جارٍ التحقق من الرمز…
          </p>
        ) : null}

        {phase === 'invalid' ? (
          <div className="space-y-4 py-4 text-center">
            <QrIcon className="mx-auto text-4xl text-ink-faint" />
            <Alert tone="error">{error ?? 'رمز الدخول غير صالح أو استُخدم من قبل.'}</Alert>
            <p className="text-xs text-ink-faint">امسح رمزاً جديداً من شاشة الدخول.</p>
          </div>
        ) : null}

        {phase === 'expired' ? (
          <div className="space-y-4 py-4 text-center">
            <QrIcon className="mx-auto text-4xl text-ink-faint" />
            <Alert tone="error">انتهت صلاحية الرمز. أنشئ رمزاً جديداً على الجهاز الآخر.</Alert>
          </div>
        ) : null}

        {phase === 'approved' ? (
          <div className="space-y-4 py-4 text-center">
            <Alert tone="success">تم فتح النظام على الجهاز الآخر. يمكنك إغلاق هذه الصفحة.</Alert>
          </div>
        ) : null}

        {phase === 'ready' || phase === 'approving' ? (
          <div className="space-y-5">
            {secondsLeft !== null ? (
              <p className="text-center text-xs text-ink-faint" role="status" aria-live="polite">
                صالح لمدة <span className="numeral">{secondsLeft}</span> ثانية
              </p>
            ) : null}

            <div className="flex gap-2 rounded-2xl border border-line-soft bg-sunken p-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={method === 'pin'}
                className={`btn flex-1 py-2 text-sm ${method === 'pin' ? 'bg-raised text-ink' : 'text-ink-faint'}`}
                onClick={() => setMethod('pin')}
              >
                <LockIcon />
                رمز الدخول
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === 'password'}
                disabled={!passwordLoginEnabled}
                className={`btn flex-1 py-2 text-sm ${method === 'password' ? 'bg-raised text-ink' : 'text-ink-faint'}`}
                onClick={() => setMethod('password')}
              >
                <MailIcon />
                البريد
              </button>
            </div>

            {method === 'pin' ? (
              <PinPad
                length={pinLength}
                value={pin}
                disabled={phase === 'approving'}
                state={error ? 'error' : phase === 'approving' ? 'verifying' : 'idle'}
                onChange={(next) => {
                  setError(null);
                  setPin(next);
                }}
                onComplete={(value) => void approveWithPin(value)}
                hint={
                  phase === 'approving' ? (
                    <span className="flex items-center justify-center gap-2 text-ink-faint">
                      <Spinner /> جارٍ التأكيد…
                    </span>
                  ) : null
                }
              />
            ) : (
              <PasswordForm
                onAuthenticated={() => undefined}
                approveToken={token ?? undefined}
                onApproved={() => setPhase('approved')}
              />
            )}

            {error ? <Alert tone="error">{error}</Alert> : null}
          </div>
        ) : null}
      </section>

      <p className="max-w-sm text-center text-xs leading-relaxed text-ink-faint/70">
        لا توافق على أي طلب دخول لم تبدأه بنفسك.
      </p>
    </main>
  );
}
