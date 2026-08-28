import 'server-only';

import { sql, type Db } from '@/server/db/client';
import type { Module, Permission } from '@/server/db/types';

export async function listModules(db: Db = sql): Promise<Module[]> {
  return db<Module[]>`
    select key, name, description, icon, route, sort_order, is_admin
    from erp_auth.modules
    order by sort_order, key
  `;
}

export async function listPermissions(db: Db = sql): Promise<Permission[]> {
  return db<Permission[]>`
    select id, key, module, action, name, description, is_dangerous, sort_order
    from erp_auth.permissions
    order by module, sort_order, key
  `;
}

/** The employee's effective capability keys. Owners implicitly hold everything. */
export async function keysForEmployee(employeeId: string, db: Db = sql): Promise<string[]> {
  const rows = await db<{ keys: string[] }[]>`
    select case
             when e.is_owner and e.status = 'active'
               then (select coalesce(array_agg(p.key order by p.key), array[]::text[]) from erp_auth.permissions p)
             else erp_auth.employee_permission_keys(e.id)
           end as keys
    from erp_auth.employees e
    where e.id = ${employeeId}
  `;
  return rows[0]?.keys ?? [];
}

/** Keys explicitly granted to this employee, ignoring the owner short-circuit. */
export async function explicitKeysForEmployee(employeeId: string, db: Db = sql): Promise<string[]> {
  const rows = await db<{ keys: string[] }[]>`
    select erp_auth.employee_permission_keys(${employeeId}::uuid) as keys
  `;
  return rows[0]?.keys ?? [];
}

/**
 * Authoritative single-permission check, evaluated in the database so that the
 * same logic backs both the API layer and any RLS policy.
 */
export async function hasPermission(employeeId: string, key: string, db: Db = sql): Promise<boolean> {
  const rows = await db<{ allowed: boolean }[]>`
    select erp_auth.has_permission(${employeeId}::uuid, ${key}) as allowed
  `;
  return rows[0]?.allowed === true;
}

/**
 * Replaces an employee's grants with exactly `keys`. Unknown keys are rejected
 * so a typo can never silently widen or narrow access.
 */
export async function replaceForEmployee(
  employeeId: string,
  keys: string[],
  grantedBy: string | null,
  db: Db = sql,
): Promise<{ added: string[]; removed: string[] }> {
  const unique = [...new Set(keys)];

  const known = await db<{ id: string; key: string }[]>`
    select id, key from erp_auth.permissions where key = any(${unique}::text[])
  `;
  if (known.length !== unique.length) {
    const knownKeys = new Set(known.map((row) => row.key));
    const unknown = unique.filter((key) => !knownKeys.has(key));
    throw new Error(`Unknown permission keys: ${unknown.join(', ')}`);
  }

  const before = await explicitKeysForEmployee(employeeId, db);

  await db`
    delete from erp_auth.employee_permissions
    where employee_id = ${employeeId}::uuid
      and permission_id not in (
        select id from erp_auth.permissions where key = any(${unique}::text[])
      )
  `;

  if (unique.length > 0) {
    await db`
      insert into erp_auth.employee_permissions (employee_id, permission_id, granted_by)
      select ${employeeId}::uuid, p.id, ${grantedBy}::uuid
      from erp_auth.permissions p
      where p.key = any(${unique}::text[])
      on conflict (employee_id, permission_id) do nothing
    `;
  }

  const beforeSet = new Set(before);
  const afterSet = new Set(unique);
  return {
    added: unique.filter((key) => !beforeSet.has(key)),
    removed: before.filter((key) => !afterSet.has(key)),
  };
}
