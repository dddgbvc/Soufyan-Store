'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { OtpInput } from '@/components/auth/OtpInput';
import { PinPad } from '@/components/auth/PinPad';
import { Alert } from '@/components/ui/Alert';
import { MailIcon, Spinner } from '@/components/ui/icons';
import { ApiError, apiFetch } from '@/lib/api';

type Step = 'email' | 'code' | 'new-pin' | 'confirm-pin' | 'done';

interface ForgotPinFlowProps {
  pinLength: number;
  onFinished: () => void;
}

/**
 * Forgot-PIN recovery, start to finish.
 *
 * The reset handle returned after a correct code lives in component state for
 * the few seconds it is needed and is never persisted anywhere.
 */
export function ForgotPinFlow({ pinLength, onFinished }: ForgotPinFlowProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const resetToken = useRef<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const requestCode = useCallback(
    async (address: string) => {
      setBusy(true);
      setError(null);
      try {
        await apiFetch('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ email: address }) });
        // Deliberately non-committal: the server never says whether it matched.
        setNotice('إذا كان هذا البريد مسجّلاً لدينا فقد وصله رمز التحقق.');
        setStep('code');
        setResendIn(60);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'تعذّر إرسال الرمز.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const verifyCode = useCallback(
    async (value: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await apiFetch<{ resetToken: string }>('/api/auth/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ email, code: value }),
        });
        resetToken.current = result.resetToken;
        setNotice(null);
        setStep('new-pin');
      } catch (caught) {
        setCode('');
        setError(caught instanceof ApiError ? caught.message : 'الرمز غير صحيح.');
      } finally {
        setBusy(false);
      }
    },
    [email],
  );

  const submitNewPin = useCallback(async () => {
    if (!resetToken.current) {
      setError('انتهت صلاحية الطلب. ابدأ من جديد.');
      setStep('email');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/auth/otp/reset', {
        method: 'POST',
        body: JSON.stringify({ resetToken: resetToken.current, newPin }),
      });
      resetToken.current = null;
      setStep('done');
    } catch (caught) {
      setConfirmPin('');
      setNewPin('');
      setStep('new-pin');
      setError(caught instanceof ApiError ? caught.message : 'تعذّر حفظ الرمز الجديد.');
    } finally {
      setBusy(false);
    }
  }, [newPin]);

  if (step === 'email') {
    return (
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (email.trim()) void requestCode(email.trim());
        }}
      >
        <p className="text-sm leading-relaxed text-ink-dim">
          اكتب بريدك الإلكتروني المسجّل في النظام، ونرسل لك رمز تحقق مؤقتاً لإنشاء رمز دخول جديد.
        </p>

        <label className="block space-y-2">
          <span className="text-sm text-ink-dim">البريد الإلكتروني</span>
          <input
            type="email"
            required
            autoFocus
            dir="ltr"
            className="field text-start"
            placeholder="name@example.com"
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <button type="submit" className="btn btn-primary w-full" disabled={busy || !email.trim()}>
          {busy ? <Spinner /> : <MailIcon />}
          إرسال رمز التحقق
        </button>
      </form>
    );
  }

  if (step === 'code') {
    return (
      <div className="space-y-5">
        {notice ? <Alert tone="info">{notice}</Alert> : null}

        <div className="space-y-3">
          <p className="text-center text-sm text-ink-dim">أدخل الرمز المكوّن من ٦ أرقام</p>
          <OtpInput
            length={6}
            value={code}
            onChange={setCode}
            onComplete={(value) => void verifyCode(value)}
            disabled={busy}
            invalid={Boolean(error)}
            label="رمز التحقق"
          />
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn btn-quiet"
            disabled={busy || resendIn > 0}
            onClick={() => void requestCode(email)}
          >
            {resendIn > 0 ? (
              <>
                إعادة الإرسال بعد <span className="numeral">{resendIn}</span> ث
              </>
            ) : (
              'إعادة إرسال الرمز'
            )}
          </button>

          <button
            type="button"
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          >
            تغيير البريد
          </button>
        </div>

        {busy ? (
          <p className="flex items-center justify-center gap-2 text-sm text-ink-faint">
            <Spinner /> جارٍ التحقق…
          </p>
        ) : null}
      </div>
    );
  }

  if (step === 'new-pin' || step === 'confirm-pin') {
    const confirming = step === 'confirm-pin';
    const value = confirming ? confirmPin : newPin;

    return (
      <div className="space-y-5">
        <p className="text-center text-sm text-ink-dim">
          {confirming ? 'أعد إدخال الرمز الجديد للتأكيد' : 'اختر رمز دخول جديداً من ٦ أرقام'}
        </p>

        <PinPad
          length={pinLength}
          value={value}
          state={error ? 'error' : busy ? 'verifying' : 'idle'}
          disabled={busy}
          onChange={(next) => {
            setError(null);
            if (confirming) setConfirmPin(next);
            else setNewPin(next);
          }}
          onComplete={(entered) => {
            if (!confirming) {
              setStep('confirm-pin');
              return;
            }
            if (entered !== newPin) {
              setError('الرمزان غير متطابقين. حاول مرة أخرى.');
              setConfirmPin('');
              setNewPin('');
              setStep('new-pin');
              return;
            }
            void submitNewPin();
          }}
          hint={
            !confirming ? (
              <span className="text-ink-faint">تجنّب الأرقام المتسلسلة أو المكرّرة</span>
            ) : null
          }
        />

        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5 text-center">
      <Alert tone="success">تم تعيين رمز الدخول الجديد. سُجّل خروج كل الأجهزة الأخرى.</Alert>
      <button type="button" className="btn btn-primary w-full" onClick={onFinished}>
        الرجوع لتسجيل الدخول
      </button>
    </div>
  );
}
