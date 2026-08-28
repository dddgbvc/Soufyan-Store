import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { consumeChallenge } from '@/server/auth/qr';
import { setSessionCookie } from '@/server/auth/session';
import * as permissionsRepo from '@/server/db/repositories/permissions';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, tokenSchema, uuidSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ challengeId: uuidSchema, pollSecret: tokenSchema });

/** Redeems an approved challenge exactly once and issues the session. */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const { challengeId, pollSecret } = await parseBody(request, schema);
    const context = await getRequestContext();

    const result = await consumeChallenge(challengeId, pollSecret, context);
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
