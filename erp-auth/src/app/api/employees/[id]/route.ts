import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { requirePermission } from '@/server/authz/guard';
import { deleteEmployee, getEmployee, updateEmployee } from '@/server/employees/service';
import { assertCsrf } from '@/server/security/csrf';
import { AuthError } from '@/server/security/errors';
import { getRequestContext } from '@/server/security/requestContext';
import { emailSchema, fullNameSchema, parseBody, phoneSchema, uuidSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

async function employeeId(params: Params['params']): Promise<string> {
  const { id } = await params;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new AuthError('not_found');
  return parsed.data;
}

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission('employees.view');
    return getEmployee(await employeeId(params));
  });
}

const updateSchema = z.object({
  fullName: fullNameSchema.optional(),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  jobTitle: z.string().trim().max(80).nullable().optional(),
  status: z.enum(['active', 'disabled', 'suspended']).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await assertCsrf();
    const actor = await requirePermission('employees.update');
    const body = await parseBody(request, updateSchema);
    const context = await getRequestContext();
    return updateEmployee(await employeeId(params), body, actor, context);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    await assertCsrf();
    const actor = await requirePermission('employees.delete');
    const context = await getRequestContext();
    await deleteEmployee(await employeeId(params), actor, context);
    return { ok: true };
  });
}
