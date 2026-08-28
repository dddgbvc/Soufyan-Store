'use client';

import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { LockIcon, Spinner } from '@/components/ui/icons';
import { ApiError, apiFetch } from '@/lib/api';
import type { LoginPayload } from '@/lib/session-types';

interface PasswordFormProps {
  onAuthenticated: (payload: LoginPayload) => void;
  /** When set, credentials approve a QR challenge instead of opening a session. */
  approveToken?: string;
  onApproved?: () => void;
}

/** Secondary login: verified by Supabase Auth, never stored by this system. */
export function PasswordForm({ onAuthenticated, approveToken, onApproved }: PasswordFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (approveToken) {
        await apiFetch('/api/auth/qr/approve', {
          method: 'POST',
          body: JSON.stringify({ token: approveToken, method: 'password', email, password }),
        });
        onApproved?.();
      } else {
        const payload = await apiFetch<LoginPayload>('/api/auth/password', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        onAuthenticated(payload);
      }
    } catch (caught) {
      setPassword('');
      setError(caught instanceof ApiError ? caught.message : 'تعذّر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block space-y-2">
        <span className="text-sm text-ink-dim">البريد الإلكتروني</span>
        <input
          type="email"
          required
          autoComplete="username"
          dir="ltr"
          className="field text-start"
          placeholder="name@example.com"
          value={email}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-ink-dim">كلمة المرور</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          className="field text-start"
          placeholder="••••••••"
          value={password}
          disabled={busy}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <button type="submit" className="btn btn-primary w-full" disabled={busy || !email || !password}>
        {busy ? <Spinner /> : <LockIcon />}
        {approveToken ? 'تأكيد الدخول' : 'تسجيل الدخول'}
      </button>
    </form>
  );
}
