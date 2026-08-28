'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { QrIcon, RefreshIcon, Spinner } from '@/components/ui/icons';
import { ApiError, apiFetch } from '@/lib/api';
import type { LoginPayload } from '@/lib/session-types';

type Phase = 'generating' | 'waiting' | 'approved' | 'expired' | 'error';

interface Challenge {
  challengeId: string;
  pollSecret: string;
  /** `data:` URI of the server-rendered QR image. */
  image: string;
  expiresAt: string;
}

interface QrPanelProps {
  active: boolean;
  onAuthenticated: (payload: LoginPayload) => void;
}

const POLL_INTERVAL_MS = 1500;

/**
 * Cross-device login.
 *
 * The poll secret is held in a ref for the life of the challenge and never
 * written to storage — losing the tab is meant to invalidate the attempt.
 */
export function QrPanel({ active, onAuthenticated }: QrPanelProps) {
  const [phase, setPhase] = useState<Phase>('generating');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const current = useRef<Challenge | null>(null);
  const cancelled = useRef(false);

  const create = useCallback(async () => {
    try {
      const created = await apiFetch<Challenge>('/api/auth/qr/challenge', { method: 'POST' });
      if (cancelled.current) return;
      current.current = created;
      setChallenge(created);
      setSecondsLeft(Math.max(0, Math.round((Date.parse(created.expiresAt) - Date.now()) / 1000)));
      setPhase('waiting');
    } catch (caught) {
      if (cancelled.current) return;
      setError(caught instanceof ApiError ? caught.message : 'تعذّر إنشاء رمز الدخول.');
      setPhase('error');
    }
  }, []);

  // Create on open; revoke on close so an abandoned code cannot linger.
  // `phase` already starts at 'generating', and the request is deferred one
  // tick so the spinner paints before the round trip begins.
  useEffect(() => {
    if (!active) return;

    cancelled.current = false;
    const timer = window.setTimeout(() => void create(), 0);

    return () => {
      window.clearTimeout(timer);
      cancelled.current = true;
      const pending = current.current;
      current.current = null;
      if (pending) {
        void apiFetch('/api/auth/qr/revoke', {
          method: 'POST',
          body: JSON.stringify({ challengeId: pending.challengeId, pollSecret: pending.pollSecret }),
        }).catch(() => undefined);
      }
    };
  }, [active, create]);

  // Countdown for the visible timer.
  useEffect(() => {
    if (phase !== 'waiting' || !challenge) return;

    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.round((Date.parse(challenge.expiresAt) - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) setPhase('expired');
    }, 500);

    return () => window.clearInterval(timer);
  }, [challenge, phase]);

  // Poll for approval, then redeem exactly once.
  useEffect(() => {
    if (phase !== 'waiting' || !challenge) return;

    let stopped = false;

    const timer = window.setInterval(async () => {
      if (stopped) return;

      try {
        const status = await apiFetch<{ status: string }>('/api/auth/qr/status', {
          method: 'POST',
          body: JSON.stringify({ challengeId: challenge.challengeId, pollSecret: challenge.pollSecret }),
        });

        if (stopped) return;

        if (status.status === 'approved') {
          stopped = true;
          setPhase('approved');

          const payload = await apiFetch<LoginPayload>('/api/auth/qr/consume', {
            method: 'POST',
            body: JSON.stringify({ challengeId: challenge.challengeId, pollSecret: challenge.pollSecret }),
          });
          current.current = null;
          onAuthenticated(payload);
        } else if (status.status === 'expired' || status.status === 'revoked' || status.status === 'consumed') {
          stopped = true;
          current.current = null;
          setPhase('expired');
        }
      } catch (caught) {
        // A transient network blip should not kill the wait; anything the
        // server actively rejects should.
        if (caught instanceof ApiError && caught.status !== 0) {
          stopped = true;
          current.current = null;
          setError(caught.message);
          setPhase(caught.code === 'qr_expired' ? 'expired' : 'error');
        }
      }
    }, POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [challenge, onAuthenticated, phase]);

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-dim">
        امسح الرمز بهاتفك، سجّل الدخول على الهاتف، وسيُفتح النظام على هذا الجهاز تلقائياً.
      </p>

      <div className="relative mx-auto flex aspect-square w-full max-w-[17rem] items-center justify-center overflow-hidden rounded-3xl border border-line-soft bg-sunken p-4">
        {phase === 'generating' ? (
          <div className="flex flex-col items-center gap-3 text-ink-faint">
            <Spinner className="text-2xl" />
            <span className="text-sm">جارٍ إنشاء رمز آمن…</span>
          </div>
        ) : null}

        {phase === 'waiting' && challenge ? (
          <>
            {/* Rendered as an image rather than injected markup: an <img> is an
                inert context, so nothing inside the SVG can ever execute. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={challenge.image}
              alt="رمز الدخول السريع"
              className="animate-fade h-full w-full"
              draggable={false}
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 animate-sweep bg-gradient-to-b from-transparent via-brass/12 to-transparent" />
          </>
        ) : null}

        {phase === 'approved' ? (
          <div className="flex flex-col items-center gap-3 text-success">
            <Spinner className="text-2xl" />
            <span className="text-sm">تمت الموافقة — جارٍ فتح النظام…</span>
          </div>
        ) : null}

        {phase === 'expired' ? (
          <div className="flex flex-col items-center gap-3 text-center text-ink-faint">
            <QrIcon className="text-3xl" />
            <span className="text-sm">انتهت صلاحية الرمز</span>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="flex flex-col items-center gap-3 text-center text-ink-faint">
            <QrIcon className="text-3xl" />
            <span className="text-sm">تعذّر إنشاء الرمز</span>
          </div>
        ) : null}
      </div>

      {phase === 'waiting' ? (
        <p className="flex items-center justify-center gap-2 text-sm text-ink-faint" role="status" aria-live="polite">
          <span className="inline-block h-2 w-2 animate-pulse-ring rounded-full bg-brass" />
          بانتظار الموافقة من الهاتف · <span className="numeral">{secondsLeft}</span> ث
        </p>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}

      {phase === 'expired' || phase === 'error' ? (
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => {
            setPhase('generating');
            setError(null);
            void create();
          }}
        >
          <RefreshIcon />
          إنشاء رمز جديد
        </button>
      ) : null}
    </div>
  );
}
