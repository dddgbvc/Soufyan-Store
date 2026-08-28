import { redirect } from 'next/navigation';

import { Shell } from '@/components/dashboard/Shell';
import { getSession } from '@/server/auth/session';
import * as permissionsRepo from '@/server/db/repositories/permissions';
import { toEmployeeSummary, toModuleSummary } from '@/server/api/serialize';
import { canAccessModule } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * Every dashboard route passes through here first.
 *
 * The navigation is assembled server-side from the employee's actual grants:
 * an unauthorised module is not rendered *and* its route refuses to load, which
 * is the part that matters.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.employee.mustChangePin) redirect('/login');

  const [permissions, modules] = await Promise.all([
    permissionsRepo.keysForEmployee(session.employee.id),
    permissionsRepo.listModules(),
  ]);

  const visible = modules.filter((module) => canAccessModule(permissions, module.key));

  return (
    <Shell
      employee={toEmployeeSummary(session.employee)}
      modules={visible.map(toModuleSummary)}
      permissionCount={permissions.length}
    >
      {children}
    </Shell>
  );
}
