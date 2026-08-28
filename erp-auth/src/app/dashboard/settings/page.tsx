import type { Metadata } from 'next';

import { AuditLog } from '@/components/audit/AuditLog';
import { Forbidden } from '@/components/dashboard/Forbidden';
import * as auditRepo from '@/server/db/repositories/audit';
import { guardPage } from '@/server/authz/page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'الإعدادات وسجل التدقيق' };

/** Gated by `settings.view` — the same key the audit RLS policy checks. */
export default async function SettingsPage() {
  const auth = await guardPage('settings.view');
  if (!auth) return <Forbidden permissionKey="settings.view" />;

  const entries = await auditRepo.list({ limit: 100 });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header className="animate-rise">
        <h1 className="text-xl font-semibold text-ink">الإعدادات</h1>
        <p className="mt-1 text-sm text-ink-faint">مراقبة الأحداث الأمنية في النظام.</p>
      </header>

      <AuditLog
        initialEntries={entries.map((entry) => ({
          id: entry.id,
          event: entry.event,
          severity: entry.severity,
          success: entry.success,
          employeeName: entry.employeeName,
          actorName: entry.actorName,
          ip: entry.ip,
          metadata: entry.metadata,
          createdAt: entry.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
