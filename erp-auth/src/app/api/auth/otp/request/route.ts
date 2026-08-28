import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { requestOtp } from '@/server/auth/otp';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { emailSchema, parseBody } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ email: emailSchema });

/**
 * Step 1 of PIN recovery. Always answers the same way, so the endpoint cannot
 * be used to find out which addresses belong to employees.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const { email } = await parseBody(request, schema);
    const context = await getRequestContext();

    const result = await requestOtp(email, context);
    return { ok: true, expiresInSeconds: result.expiresInSeconds };
  });
}
