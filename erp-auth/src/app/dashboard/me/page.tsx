import type { Metadata } from 'next';

import { MyDevices } from '@/components/dashboard/MyDevices';
import { listSessions } from '@/server/auth/session';
import { toSessionSummary } from '@/server/api/serialize';
import { guardAuthenticated } from '@/server/authz/page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'حسابي' };

/** Available to any signed-in employee, regardless of module permissions. */
export default async function MyAccountPage() {
  const auth = await guardAuthenticated();
  const sessions = await listSessions(auth.employee.id, 50);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <header className="animate-rise">
        <h1 className="text-xl font-semibold text-ink">{auth.employee.fullName}</h1>
        <p className="numeral mt-1 text-right text-sm text-ink-faint">
          {auth.employee.employeeCode}
          {auth.employee.email ? ` · ${auth.employee.email}` : ''}
        </p>
      </header>

      <MyDevices sessions={sessions.map(toSessionSummary)} currentSessionId={auth.session.id} />
    </div>
  );
}
