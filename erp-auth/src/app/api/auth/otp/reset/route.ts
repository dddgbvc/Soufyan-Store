import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { resetPinWithToken } from '@/server/auth/otp';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, pinSchema, tokenSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ resetToken: tokenSchema, newPin: pinSchema });

/** Step 3. Burns the handle, installs the new PIN, drops every live session. */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const { resetToken, newPin } = await parseBody(request, schema);
    const context = await getRequestContext();

    await resetPinWithToken(resetToken, newPin, context);
    return { ok: true };
  });
}
