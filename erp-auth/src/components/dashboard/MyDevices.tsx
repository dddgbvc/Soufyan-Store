'use client';

import { useCallback, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { DeviceIcon, RefreshIcon, Spinner } from '@/components/ui/icons';
import { ApiError, apiFetch } from '@/lib/api';

export interface SessionRow {
  id: string;
  method: 'pin' | 'password' | 'qr';
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ip: string | null;
  deviceLabel: string | null;
  isLive: boolean;
}

const METHOD_LABEL: Record<SessionRow['method'], string> = {
  pin: 'رمز الدخول',
  password: 'البريد وكلمة المرور',
  qr: 'QR PASSKEY',
};

function shortTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Lets an employee see — and cut off — every device holding their session.
 *
 * The first list is rendered on the server, so the screen arrives populated;
 * afterwards it refreshes only in response to something the person did.
 */
export function MyDevices({
  sessions: initialSessions,
  currentSessionId,
}: {
  sessions: SessionRow[];
  currentSessionId: string;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await apiFetch<{ sessions: SessionRow[] }>('/api/me/sessions');
    setSessions(result.sessions);
  }, []);

  async function act(body: Record<string, unknown> | null, message: string) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      if (body) await apiFetch('/api/me/sessions', { method: 'POST', body: JSON.stringify(body) });
      await reload();
      if (body) setNotice(message);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'تعذّر تنفيذ العملية.');
    } finally {
      setBusy(false);
    }
  }

  const live = sessions.filter((session) => session.isLive);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">أجهزتي</h2>
          <p className="text-sm text-ink-faint">
            <span className="numeral">{live.length}</span> جلسة نشطة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost py-2"
            disabled={busy}
            onClick={() => void act(null, '')}
          >
            {busy ? <Spinner /> : <RefreshIcon />}
            تحديث
          </button>

          {live.length > 1 ? (
            <button
              type="button"
              className="btn btn-ghost py-2"
              disabled={busy}
              onClick={() => void act({ all: true }, 'تم إنهاء بقية الجلسات.')}
            >
              إنهاء بقية الجلسات
            </button>
          ) : null}
        </div>
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <ul className="space-y-2">
        {sessions.map((session) => {
          const isCurrent = session.id === currentSessionId;

          return (
            <li key={session.id} className="panel flex items-center gap-4 px-4 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line-soft bg-sunken text-ink-faint">
                <DeviceIcon />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm text-ink">{session.deviceLabel ?? 'جهاز غير معروف'}</span>
                  {isCurrent ? <span className="chip border-success/40 text-success">هذا الجهاز</span> : null}
                  {!session.isLive ? <span className="chip">منتهية</span> : null}
                </span>
                <span className="block truncate text-xs text-ink-faint">
                  {METHOD_LABEL[session.method]}
                  {session.ip ? <span className="numeral"> · {session.ip}</span> : null}
                  <span className="numeral"> · آخر نشاط {shortTime(session.lastSeenAt)}</span>
                </span>
              </span>

              {session.isLive && !isCurrent ? (
                <button
                  type="button"
                  className="btn btn-quiet shrink-0"
                  disabled={busy}
                  onClick={() => void act({ sessionId: session.id }, 'تم إنهاء الجلسة.')}
                >
                  إنهاء
                </button>
              ) : null}
            </li>
          );
        })}

        {sessions.length === 0 ? (
          <li className="panel p-8 text-center text-sm text-ink-faint">لا توجد جلسات مسجّلة.</li>
        ) : null}
      </ul>
    </section>
  );
}
