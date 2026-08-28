import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { getChallengeStatus } from '@/server/auth/qr';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, tokenSchema, uuidSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ challengeId: uuidSchema, pollSecret: tokenSchema });

/** Poll for the waiting screen. Needs the poll secret AND the device cookie. */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const { challengeId, pollSecret } = await parseBody(request, schema);
    const context = await getRequestContext();
    return getChallengeStatus(challengeId, pollSecret, context);
  });
}
