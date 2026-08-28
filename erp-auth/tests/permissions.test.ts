import { afterAll, describe, expect, it } from 'vitest';

import { sql } from '@/server/db/client';
import * as permissionsRepo from '@/server/db/repositories/permissions';
import { deleteEmployee, setPermissions, updateEmployee } from '@/server/employees/service';
import { authContextFor, cleanupFixtures, createTestEmployee, testContext } from './helpers/fixtures';

afterAll(cleanupFixtures);

describe('per-employee capabilities', () => {
  it('gives two employees genuinely different access', async () => {
    const ahmed = await createTestEmployee({
      permissions: ['cashier.view', 'cashier.create_sale', 'inventory.view', 'inventory.adjust', 'customers.view'],
    });
    const ali = await createTestEmployee({
      permissions: ['inventory.view', 'inventory.create', 'inventory.delete', 'reports.view'],
    });

    await expect(permissionsRepo.hasPermission(ahmed.id, 'cashier.create_sale')).resolves.toBe(true);
    await expect(permissionsRepo.hasPermission(ali.id, 'cashier.create_sale')).resolves.toBe(false);

    await expect(permissionsRepo.hasPermission(ahmed.id, 'inventory.delete')).resolves.toBe(false);
    await expect(permissionsRepo.hasPermission(ali.id, 'inventory.delete')).resolves.toBe(true);
  });

  it('allows the read but refuses the delete for the same module', async () => {
    const employee = await createTestEmployee({ permissions: ['inventory.view'] });

    // This is the database's own answer — the same function every RLS policy
    // and every API guard consults. It is not a UI-level check.
    await expect(permissionsRepo.hasPermission(employee.id, 'inventory.view')).resolves.toBe(true);
    await expect(permissionsRepo.hasPermission(employee.id, 'inventory.delete')).resolves.toBe(false);
  });

  it('grants an owner every capability implicitly', async () => {
    const owner = await createTestEmployee({ isOwner: true });

    await expect(permissionsRepo.hasPermission(owner.id, 'employees.permissions')).resolves.toBe(true);
    await expect(permissionsRepo.hasPermission(owner.id, 'inventory.delete')).resolves.toBe(true);

    const keys = await permissionsRepo.keysForEmployee(owner.id);
    const catalogue = await permissionsRepo.listPermissions();
    expect(keys).toHaveLength(catalogue.length);
  });

  it('revokes access the moment an employee is disabled', async () => {
    const employee = await createTestEmployee({ permissions: ['inventory.view'] });
    await expect(permissionsRepo.hasPermission(employee.id, 'inventory.view')).resolves.toBe(true);

    await sql`update erp_auth.employees set status = 'disabled' where id = ${employee.id}`;

    await expect(permissionsRepo.hasPermission(employee.id, 'inventory.view')).resolves.toBe(false);
  });

  it('rejects unknown permission keys instead of silently ignoring them', async () => {
    const employee = await createTestEmployee();

    await expect(
      permissionsRepo.replaceForEmployee(employee.id, ['inventory.view', 'not_a.real_key'], null),
    ).rejects.toThrow(/Unknown permission keys/);

    // Nothing was written.
    await expect(permissionsRepo.explicitKeysForEmployee(employee.id)).resolves.toEqual([]);
  });

  it('reports exactly what changed when grants are replaced', async () => {
    const employee = await createTestEmployee({ permissions: ['inventory.view', 'reports.view'] });

    const diff = await permissionsRepo.replaceForEmployee(
      employee.id,
      ['inventory.view', 'cashier.view'],
      null,
    );

    expect(diff.added).toEqual(['cashier.view']);
    expect(diff.removed).toEqual(['reports.view']);
    await expect(permissionsRepo.explicitKeysForEmployee(employee.id)).resolves.toEqual([
      'cashier.view',
      'inventory.view',
    ]);
  });
});

describe('privilege escalation guards', () => {
  it('refuses to let an admin edit their own permissions', async () => {
    const admin = await createTestEmployee({ permissions: ['employees.view', 'employees.permissions'] });
    const actor = await authContextFor(admin);

    await expect(
      setPermissions(admin.id, ['employees.permissions', 'inventory.delete'], actor, testContext()),
    ).rejects.toMatchObject({ code: 'forbidden', details: { reason: 'cannot_edit_own_permissions' } });
  });

  it('refuses to let a non-owner touch an owner', async () => {
    const owner = await createTestEmployee({ isOwner: true });
    const admin = await createTestEmployee({ permissions: ['employees.update', 'employees.permissions'] });
    const actor = await authContextFor(admin);

    await expect(
      updateEmployee(owner.id, { status: 'disabled' }, actor, testContext()),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await expect(setPermissions(owner.id, [], actor, testContext())).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses to let an employee disable or delete themselves', async () => {
    const admin = await createTestEmployee({ permissions: ['employees.update', 'employees.delete'] });
    const actor = await authContextFor(admin);

    await expect(updateEmployee(admin.id, { status: 'disabled' }, actor, testContext())).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'cannot_disable_self' },
    });
    await expect(deleteEmployee(admin.id, actor, testContext())).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'cannot_delete_self' },
    });
  });

  it('lets an owner grant and revoke another employee capabilities', async () => {
    const owner = await createTestEmployee({ isOwner: true });
    const staff = await createTestEmployee();
    const actor = await authContextFor(owner);

    const granted = await setPermissions(staff.id, ['inventory.view', 'inventory.adjust'], actor, testContext());
    expect(granted.permissions).toEqual(['inventory.adjust', 'inventory.view']);

    const revoked = await setPermissions(staff.id, [], actor, testContext());
    expect(revoked.permissions).toEqual([]);
    await expect(permissionsRepo.hasPermission(staff.id, 'inventory.view')).resolves.toBe(false);
  });
});

describe('database level isolation', () => {
  it('keeps the credential tables unreachable from an unprivileged role', async () => {
    const roleName = `erp_auth_test_role_${Date.now().toString(36)}`;

    try {
      await sql.unsafe(`create role ${roleName} nologin`);
    } catch {
      // Managed environments may forbid role creation; the grants are still
      // asserted by the migration itself.
      return;
    }

    try {
      for (const table of ['employees', 'sessions', 'otp_requests', 'qr_login_challenges', 'rate_limits']) {
        // Each probe gets its own transaction: the first denial aborts the
        // one it runs in, which would mask the checks that follow.
        const attempt = sql.begin(async (tx) => {
          await tx.unsafe(`set local role ${roleName}`);
          await tx.unsafe(`select 1 from erp_auth.${table} limit 1`);
        });

        await expect(attempt, `erp_auth.${table} must not be readable`).rejects.toThrow(/permission denied/i);
      }
    } finally {
      await sql.unsafe(`drop role if exists ${roleName}`);
    }
  });

  it('refuses to rewrite or erase the audit trail', async () => {
    const employee = await createTestEmployee();
    await sql`
      insert into erp_auth.audit_logs (event, employee_id, metadata)
      values ('login.pin_success', ${employee.id}, '{}'::jsonb)
    `;

    await expect(
      sql`update erp_auth.audit_logs set event = 'login.pin_failure' where employee_id = ${employee.id}`,
    ).rejects.toThrow(/append-only/);

    await expect(
      sql`delete from erp_auth.audit_logs where employee_id = ${employee.id}`,
    ).rejects.toThrow(/append-only/);
  });
});
