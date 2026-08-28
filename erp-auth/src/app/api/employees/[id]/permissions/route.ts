import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { requirePermission } from '@/server/authz/guard';
import { setPermissions } from '@/server/employees/service';
import { assertCsrf } from '@/server/security/csrf';
import { AuthError } from '@/server/security/errors';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, permissionKeySchema, uuidSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ permissions: z.array(permissionKeySchema).max(200) });

/** Replaces the employee's grants with exactly the list provided. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await assertCsrf();
    const actor = await requirePermission('employees.permissions');

    const { id } = await params;
    const parsed = uuidSchema.safeParse(id);
    if (!parsed.success) throw new AuthError('not_found');

    const { permissions } = await parseBody(request, schema);
    const context = await getRequestContext();

    return setPermissions(parsed.data, permissions, actor, context);
  });
}
