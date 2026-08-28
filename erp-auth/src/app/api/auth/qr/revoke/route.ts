import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { revokeChallenge } from '@/server/auth/qr';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, tokenSchema, uuidSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ challengeId: uuidSchema, pollSecret: tokenSchema });

/** Cancels a challenge early, e.g. when the login screen is closed. */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const { challengeId, pollSecret } = await parseBody(request, schema);
    const context = await getRequestContext();

    await revokeChallenge(challengeId, pollSecret, context);
    return { ok: true };
  });
}
