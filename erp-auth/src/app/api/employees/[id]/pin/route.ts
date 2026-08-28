import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { requirePermission } from '@/server/authz/guard';
import { assignPin } from '@/server/employees/service';
import { assertCsrf } from '@/server/security/csrf';
import { AuthError } from '@/server/security/errors';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, pinSchema, uuidSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ pin: pinSchema });

/**
 * Assigns a starting PIN. The employee is forced to replace it at first login,
 * so the value the manager typed is never a lasting credential.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await assertCsrf();
    const actor = await requirePermission('employees.update');

    const { id } = await params;
    const parsed = uuidSchema.safeParse(id);
    if (!parsed.success) throw new AuthError('not_found');

    const { pin } = await parseBody(request, schema);
    const context = await getRequestContext();

    await assignPin(parsed.data, pin, actor, context);
    return { ok: true };
  });
}
