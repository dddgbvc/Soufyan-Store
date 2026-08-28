import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { loginWithPin } from '@/server/auth/pin';
import { setSessionCookie } from '@/server/auth/session';
import * as permissionsRepo from '@/server/db/repositories/permissions';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, pinSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ pin: pinSchema });

/** Primary login: six digits, no employee selection, identification server-side. */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const { pin } = await parseBody(request, schema);
    const context = await getRequestContext();

    const result = await loginWithPin(pin, context);
    await setSessionCookie(result.token);

    const modules = await permissionsRepo.listModules();

    return {
      employee: result.employee,
      permissions: result.permissions,
      modules,
      mustChangePin: result.mustChangePin,
    };
  });
}
