'use client';

import { useState } from 'react';

import { PinPad } from '@/components/auth/PinPad';
import { Alert } from '@/components/ui/Alert';
import { ApiError, apiFetch } from '@/lib/api';

type Step = 'current' | 'new' | 'confirm';

interface ChangePinFormProps {
  pinLength: number;
  /** Supplied when the employee has just logged in with the PIN being replaced. */
  knownCurrentPin?: string;
  onDone: () => void;
}

/** Forced or voluntary PIN change. Every other device is signed out on success. */
export function ChangePinForm({ pinLength, knownCurrentPin, onDone }: ChangePinFormProps) {
  const [step, setStep] = useState<Step>(knownCurrentPin ? 'new' : 'current');
  const [currentPin, setCurrentPin] = useState(knownCurrentPin ?? '');
  const [entry, setEntry] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(confirmed: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/auth/pin/change', {
        method: 'POST',
        body: JSON.stringify({ currentPin, newPin: confirmed }),
      });
      onDone();
    } catch (caught) {
      setEntry('');
      setNewPin('');
      setStep(caught instanceof ApiError && caught.code === 'invalid_credentials' ? 'current' : 'new');
      setError(caught instanceof ApiError ? caught.message : 'تعذّر تغيير الرمز.');
    } finally {
      setBusy(false);
    }
  }

  const prompt =
    step === 'current' ? 'أدخل رمزك الحالي' : step === 'new' ? 'اختر رمزاً جديداً' : 'أعد إدخال الرمز الجديد';

  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-ink-dim">{prompt}</p>

      <PinPad
        length={pinLength}
        value={entry}
        disabled={busy}
        state={error ? 'error' : busy ? 'verifying' : 'idle'}
        onChange={(next) => {
          setError(null);
          setEntry(next);
        }}
        onComplete={(value) => {
          if (step === 'current') {
            setCurrentPin(value);
            setEntry('');
            setStep('new');
            return;
          }

          if (step === 'new') {
            if (value === currentPin) {
              setError('الرمز الجديد يجب أن يختلف عن الحالي.');
              setEntry('');
              return;
            }
            setNewPin(value);
            setEntry('');
            setStep('confirm');
            return;
          }

          if (value !== newPin) {
            setError('الرمزان غير متطابقين.');
            setEntry('');
            setNewPin('');
            setStep('new');
            return;
          }

          void save(value);
        }}
        hint={step === 'new' ? <span className="text-ink-faint">تجنّب الأرقام المتسلسلة أو المكرّرة</span> : null}
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
