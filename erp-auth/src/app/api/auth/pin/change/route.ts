import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { changeOwnPin } from '@/server/auth/pin';
import { requireAuth } from '@/server/authz/guard';
import { rotateSession } from '@/server/auth/session';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, pinSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  currentPin: pinSchema,
  newPin: pinSchema,
});

/**
 * Self-service PIN change. Allowed while a forced change is pending, which is
 * exactly the case where the employee has to get through this screen first.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const body = await parseBody(request, schema);
    const context = await getRequestContext();
    const auth = await requireAuth({ allowPendingPinChange: true });

    await changeOwnPin(auth.employee.id, body.currentPin, body.newPin, context, auth.session.id);

    // Fresh token for this device; every other device was already revoked.
    await rotateSession({ session: auth.session, employee: auth.employee }, context);

    return { ok: true };
  });
}
