import type { Metadata } from 'next';

import { EmployeeManager } from '@/components/employees/EmployeeManager';
import { config } from '@/server/config';
import { Forbidden } from '@/components/dashboard/Forbidden';
import { guardPage } from '@/server/authz/page';
import * as employeesRepo from '@/server/db/repositories/employees';
import * as permissionsRepo from '@/server/db/repositories/permissions';
import { toEmployeeSummary, toModuleSummary } from '@/server/api/serialize';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'الموظفون' };

/**
 * Employee administration.
 *
 * `requirePermission` runs before anything renders, and the individual write
 * capabilities are resolved here too so the screen only offers what this
 * particular manager is actually allowed to do.
 */
export default async function EmployeesPage() {
  const auth = await guardPage('employees.view');
  if (!auth) return <Forbidden permissionKey="employees.view" />;

  const [employees, modules, permissions] = await Promise.all([
    employeesRepo.list({ limit: 200 }),
    permissionsRepo.listModules(),
    permissionsRepo.listPermissions(),
  ]);

  const [create, update, remove, managePermissions] = await Promise.all([
    permissionsRepo.hasPermission(auth.employee.id, 'employees.create'),
    permissionsRepo.hasPermission(auth.employee.id, 'employees.update'),
    permissionsRepo.hasPermission(auth.employee.id, 'employees.delete'),
    permissionsRepo.hasPermission(auth.employee.id, 'employees.permissions'),
  ]);

  return (
    <EmployeeManager
      initialEmployees={employees.map(toEmployeeSummary)}
      modules={modules.map(toModuleSummary)}
      permissions={permissions}
      pinLength={config.pin.length}
      can={{ create, update, remove, permissions: managePermissions }}
      currentEmployeeId={auth.employee.id}
    />
  );
}
