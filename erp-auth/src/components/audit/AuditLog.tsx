'use client';

import { useCallback, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { RefreshIcon, Spinner } from '@/components/ui/icons';
import { ApiError, apiFetch } from '@/lib/api';

export interface AuditEntry {
  id: string;
  event: string;
  severity: 'info' | 'warning' | 'critical';
  success: boolean;
  employeeName: string | null;
  actorName: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Arabic labels for the canonical event names. */
const EVENT_LABEL: Record<string, string> = {
  'login.pin_success': 'دخول بالرمز',
  'login.pin_failure': 'محاولة دخول فاشلة',
  'login.password_success': 'دخول بالبريد',
  'login.password_failure': 'فشل دخول بالبريد',
  'login.qr_success': 'دخول عبر QR',
  'login.blocked': 'حجب محاولات متكررة',
  'login.account_locked': 'حساب موقوف',
  'login.account_disabled': 'حساب معطّل',
  'session.logout': 'تسجيل خروج',
  'session.revoked': 'إنهاء جلسات',
  'otp.requested': 'طلب رمز تحقق',
  'otp.failed': 'رمز تحقق خاطئ',
  'otp.verified': 'تحقق ناجح',
  'otp.blocked': 'حجب طلبات التحقق',
  'pin.changed': 'تغيير رمز الدخول',
  'pin.reset': 'إعادة تعيين الرمز',
  'pin.assigned': 'إسناد رمز أولي',
  'qr.created': 'إنشاء رمز QR',
  'qr.scanned': 'مسح رمز QR',
  'qr.approved': 'الموافقة على QR',
  'qr.consumed': 'استخدام رمز QR',
  'qr.expired': 'انتهاء صلاحية QR',
  'qr.revoked': 'إلغاء رمز QR',
  'qr.rejected': 'رفض رمز QR',
  'employee.created': 'إضافة موظف',
  'employee.updated': 'تعديل موظف',
  'employee.disabled': 'تعطيل موظف',
  'employee.enabled': 'تفعيل موظف',
  'employee.deleted': 'حذف موظف',
  'employee.permissions_changed': 'تعديل صلاحيات',
  'authz.denied': 'رفض صلاحية',
};

/**
 * The security trail.
 *
 * The first page is rendered on the server so the screen is never empty while
 * it waits; filtering and refreshing then go through the same guarded API.
 */
export function AuditLog({ initialEntries }: { initialEntries: AuditEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (onlyFailures: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ entries: AuditEntry[] }>(
        `/api/audit?limit=100${onlyFailures ? '&failures=true' : ''}`,
      );
      setEntries(result.entries);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'تعذّر تحميل السجل.');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">سجل التدقيق</h2>
          <p className="text-sm text-ink-faint">كل حدث أمني، بلا أي بيانات سرية.</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-dim">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-brass)]"
              checked={failuresOnly}
              onChange={(event) => {
                setFailuresOnly(event.target.checked);
                void load(event.target.checked);
              }}
            />
            الإخفاقات فقط
          </label>
          <button
            type="button"
            className="btn btn-ghost py-2"
            disabled={loading}
            onClick={() => void load(failuresOnly)}
          >
            {loading ? <Spinner /> : <RefreshIcon />}
            تحديث
          </button>
        </div>
      </header>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {entries.length === 0 ? (
        <p className="panel p-8 text-center text-sm text-ink-faint">لا توجد أحداث مسجّلة.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm"
            >
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                  !entry.success
                    ? 'bg-danger'
                    : entry.severity === 'critical'
                      ? 'bg-caution'
                      : entry.severity === 'warning'
                        ? 'bg-brass'
                        : 'bg-ink-faint/50'
                }`}
                aria-hidden="true"
              />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{EVENT_LABEL[entry.event] ?? entry.event}</span>
                <span className="numeral block truncate text-right text-xs text-ink-faint/80">{entry.event}</span>
              </span>

              <span className="min-w-0 text-xs text-ink-faint">
                {entry.employeeName ?? '—'}
                {entry.actorName && entry.actorName !== entry.employeeName ? ` · بواسطة ${entry.actorName}` : ''}
              </span>

              {entry.ip ? <span className="numeral text-xs text-ink-faint/70">{entry.ip}</span> : null}

              <time className="numeral shrink-0 text-xs text-ink-faint" dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
