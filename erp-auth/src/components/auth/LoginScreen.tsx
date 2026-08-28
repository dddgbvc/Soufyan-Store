'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ChangePinForm } from '@/components/auth/ChangePinForm';
import { ForgotPinFlow } from '@/components/auth/ForgotPinFlow';
import { PasswordForm } from '@/components/auth/PasswordForm';
import { PinPad, type PinPadState } from '@/components/auth/PinPad';
import { QrPanel } from '@/components/auth/QrPanel';
import { StatusRail } from '@/components/auth/StatusRail';
import { Alert } from '@/components/ui/Alert';
import { Sheet } from '@/components/ui/Sheet';
import { LockIcon, MailIcon, QrIcon, ShieldIcon, Spinner } from '@/components/ui/icons';
import { ApiError, apiFetch } from '@/lib/api';
import type { LoginPayload } from '@/lib/session-types';

type Sheets = 'none' | 'methods' | 'qr' | 'password' | 'forgot' | 'change-pin';

interface LoginScreenProps {
  pinLength: number;
  passwordLoginEnabled: boolean;
}

/**
 * The screen every shift starts at.
 *
 * It shows no employee list and no names: identity is resolved server-side from
 * the PIN itself, and the first time a name appears anywhere is in the welcome
 * that follows a successful authentication.
 */
export function LoginScreen({ pinLength, passwordLoginEnabled }: LoginScreenProps) {
  const router = useRouter();

  const [pin, setPin] = useState('');
  const [state, setState] = useState<PinPadState>('idle');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [lockedFor, setLockedFor] = useState(0);
  const [sheet, setSheet] = useState<Sheets>('none');
  const [welcome, setWelcome] = useState<LoginPayload | null>(null);

  // Held only until a forced PIN change is completed with it, then dropped.
  const [usedPin, setUsedPin] = useState<string | null>(null);

  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = window.setInterval(() => {
      setLockedFor((seconds) => {
        const next = Math.max(0, seconds - 1);
        if (next === 0) {
          setError(null);
          setState('idle');
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockedFor]);

  const succeed = useCallback(
    (payload: LoginPayload) => {
      setState('success');
      setSheet('none');
      setWelcome(payload);

      if (payload.mustChangePin) {
        // Straight to the change screen: this credential is not usable yet.
        window.setTimeout(() => setSheet('change-pin'), 1200);
        return;
      }

      window.setTimeout(() => {
        router.replace('/dashboard');
        router.refresh();
      }, 1400);
    },
    [router],
  );

  const submitPin = useCallback(
    async (value: string) => {
      setState('verifying');
      setError(null);

      try {
        const payload = await apiFetch<LoginPayload>('/api/auth/pin', {
          method: 'POST',
          body: JSON.stringify({ pin: value }),
        });
        setUsedPin(value);
        setPin('');
        succeed(payload);
      } catch (caught) {
        const failure =
          caught instanceof ApiError
            ? caught
            : new ApiError(0, { error: 'server_error', message: 'حدث خطأ غير متوقع.' });

        setState('error');
        setError({ code: failure.code, message: failure.message });
        if (failure.code === 'rate_limited' || failure.code === 'account_locked') {
          setLockedFor(failure.retryAfter ?? 60);
        }

        // Clear the digits after the shake so the mistake is visible first.
        window.setTimeout(() => {
          setPin('');
          setState((current) => (current === 'error' ? 'idle' : current));
        }, 620);
      }
    },
    [succeed],
  );

  const blocked = lockedFor > 0;

  return (
    <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-8">
      <div className="w-full max-w-sm">
        <StatusRail />
      </div>

      <section className="panel animate-rise w-full max-w-sm p-7 sm:p-8">
        <header className="mb-7 flex flex-col items-center gap-3 text-center">
          {/* Logo placeholder — swap for the shop mark. */}
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line-soft bg-sunken text-brass shadow-[0_0_28px_var(--color-brass-glow)]">
            <ShieldIcon className="text-2xl" />
          </div>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">أهلاً بعودتك</h1>
            <p className="mt-1 text-sm text-ink-faint">أدخل رمز الدخول للمتابعة</p>
          </div>
        </header>

        <PinPad
          length={pinLength}
          value={pin}
          onChange={(next) => {
            if (blocked) return;
            if (error && state !== 'verifying') setError(null);
            setState(next.length > 0 ? 'idle' : 'idle');
            setPin(next);
          }}
          onComplete={(value) => void submitPin(value)}
          disabled={state === 'verifying' || state === 'success' || blocked}
          state={state}
          hint={
            state === 'verifying' ? (
              <span className="flex items-center justify-center gap-2 text-ink-faint">
                <Spinner /> جارٍ التحقق…
              </span>
            ) : blocked ? (
              <span className="text-danger">
                أعد المحاولة بعد <span className="numeral">{lockedFor}</span> ثانية
              </span>
            ) : state === 'success' ? (
              <span className="text-success">تم التحقق</span>
            ) : null
          }
        />

        {error && !blocked ? (
          <div className="mt-5">
            <Alert tone="error">{error.message}</Alert>
          </div>
        ) : null}

        {error && blocked ? (
          <div className="mt-5">
            <Alert tone="error">
              {error.code === 'account_locked'
                ? 'تم إيقاف الحساب مؤقتاً. راجع المدير إذا تكرر الأمر.'
                : 'تم تجاوز عدد المحاولات المسموح بها.'}
            </Alert>
          </div>
        ) : null}

        <footer className="mt-7 flex items-center justify-between gap-2 border-t border-line-soft pt-5">
          <button type="button" className="btn btn-quiet" onClick={() => setSheet('forgot')}>
            نسيت رمز الدخول؟
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setSheet('methods')}>
            طرق دخول أخرى
          </button>
        </footer>
      </section>

      <p className="max-w-sm text-center text-xs leading-relaxed text-ink-faint/70">
        كل عملية دخول تُسجَّل في سجل التدقيق.
      </p>

      {/* ------------------------------------------------------------------ */}

      <Sheet
        open={sheet === 'methods'}
        onClose={() => setSheet('none')}
        title="طرق دخول أخرى"
        description="اختر الطريقة المناسبة لك"
      >
        <div className="space-y-3">
          <button
            type="button"
            className="btn btn-ghost w-full justify-start gap-3 py-4 text-start"
            onClick={() => setSheet('qr')}
          >
            <QrIcon className="text-xl text-brass" />
            <span className="flex-1">
              <span className="block font-medium text-ink">الدخول باستخدام QR PASSKEY</span>
              <span className="block text-xs text-ink-faint">امسح الرمز بهاتفك ووافق من هناك</span>
            </span>
          </button>

          <button
            type="button"
            className="btn btn-ghost w-full justify-start gap-3 py-4 text-start disabled:opacity-40"
            onClick={() => setSheet('password')}
            disabled={!passwordLoginEnabled}
          >
            <MailIcon className="text-xl text-brass" />
            <span className="flex-1">
              <span className="block font-medium text-ink">البريد وكلمة المرور</span>
              <span className="block text-xs text-ink-faint">
                {passwordLoginEnabled ? 'للحسابات المرتبطة ببريد إلكتروني' : 'غير مفعّلة على هذا النظام'}
              </span>
            </span>
          </button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'qr'}
        onClose={() => setSheet('none')}
        title="الدخول باستخدام QR PASSKEY"
        description="رمز لمرة واحدة، صالح لدقيقتين"
      >
        <QrPanel active={sheet === 'qr'} onAuthenticated={succeed} />
      </Sheet>

      <Sheet
        open={sheet === 'password'}
        onClose={() => setSheet('none')}
        title="الدخول بالبريد وكلمة المرور"
      >
        <PasswordForm onAuthenticated={succeed} />
      </Sheet>

      <Sheet
        open={sheet === 'forgot'}
        onClose={() => setSheet('none')}
        title="نسيت رمز الدخول؟"
        description="سنتحقق من هويتك عبر بريدك الإلكتروني"
      >
        <ForgotPinFlow pinLength={pinLength} onFinished={() => setSheet('none')} />
      </Sheet>

      <Sheet
        open={sheet === 'change-pin'}
        onClose={() => undefined}
        title="عيّن رمز الدخول الخاص بك"
        description="الرمز الحالي مؤقت وأنشأه المدير"
      >
        <ChangePinForm
          pinLength={pinLength}
          knownCurrentPin={usedPin ?? undefined}
          onDone={() => {
            setUsedPin(null);
            router.replace('/dashboard');
            router.refresh();
          }}
        />
      </Sheet>

      {/* Welcome — the first moment a name is ever shown. */}
      {welcome && sheet !== 'change-pin' ? (
        <div className="fixed inset-0 z-40 flex animate-fade items-center justify-center bg-canvas/92 backdrop-blur-md">
          <div className="animate-rise flex flex-col items-center gap-4 px-6 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full border border-brass/40 bg-brass-glow text-brass">
              <LockIcon className="text-2xl" />
            </div>
            <p className="text-2xl font-semibold text-ink">هلا بيك {welcome.employee.fullName} 👋</p>
            <p className="text-sm text-ink-faint">
              {welcome.mustChangePin ? 'قبل أن نبدأ، عيّن رمز دخول خاصاً بك' : 'جارٍ فتح النظام…'}
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
