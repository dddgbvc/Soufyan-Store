import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { inspectChallenge } from '@/server/auth/qr';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, tokenSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ token: tokenSchema });

/**
 * Called by the scanning phone before it shows a login form. POST rather than
 * GET so the challenge token never lands in a URL, a log or a Referer header.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const { token } = await parseBody(request, schema);
    const context = await getRequestContext();
    return inspectChallenge(token, context);
  });
}
