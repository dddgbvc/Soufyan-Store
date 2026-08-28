import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { requirePermission } from '@/server/authz/guard';
import * as employeesRepo from '@/server/db/repositories/employees';
import { createEmployee } from '@/server/employees/service';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import {
  employeeCodeSchema,
  emailSchema,
  fullNameSchema,
  parseBody,
  permissionKeySchema,
  phoneSchema,
  pinSchema,
} from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  return handle(async () => {
    await requirePermission('employees.view');

    const url = new URL(request.url);
    const employees = await employeesRepo.list({
      search: url.searchParams.get('search') ?? undefined,
      status: (url.searchParams.get('status') as 'active' | 'disabled' | 'suspended' | null) ?? undefined,
      limit: Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100,
      offset: Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0,
    });

    return { employees };
  });
}

const createSchema = z.object({
  fullName: fullNameSchema,
  employeeCode: employeeCodeSchema.optional(),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  jobTitle: z.string().trim().max(80).nullable().optional(),
  status: z.enum(['active', 'disabled', 'suspended']).optional(),
  initialPin: pinSchema.nullable().optional(),
  permissions: z.array(permissionKeySchema).max(200).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const actor = await requirePermission('employees.create');
    const body = await parseBody(request, createSchema);
    const context = await getRequestContext();

    // Granting capabilities at creation time needs the capability to grant.
    if (body.permissions?.length) {
      await requirePermission('employees.permissions');
    }

    return createEmployee(body, actor, context);
  });
}
