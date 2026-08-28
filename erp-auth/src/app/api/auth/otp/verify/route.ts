import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { verifyOtp } from '@/server/auth/otp';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { emailSchema, otpSchema, parseBody } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ email: emailSchema, code: otpSchema });

/** Step 2. Trades a correct code for a single-use, short-lived reset handle. */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const { email, code } = await parseBody(request, schema);
    const context = await getRequestContext();

    const result = await verifyOtp(email, code, context);
    return { resetToken: result.resetToken, expiresInSeconds: result.expiresInSeconds };
  });
}
