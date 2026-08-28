import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { approveChallenge } from '@/server/auth/qr';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { emailSchema, parseBody, pinSchema, tokenSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.intersection(
  z.object({ token: tokenSchema }),
  z.union([
    z.object({ method: z.literal('pin'), pin: pinSchema }),
    z.object({ method: z.literal('password'), email: emailSchema, password: z.string().min(1).max(256) }),
  ]),
);

/**
 * The phone proves who it belongs to and, with that, releases the challenge.
 * Approval requires real credentials every time — scanning alone proves nothing.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const body = await parseBody(request, schema);
    const context = await getRequestContext();

    await approveChallenge(
      body.token,
      body.method === 'pin'
        ? { method: 'pin', pin: body.pin }
        : { method: 'password', email: body.email, password: body.password },
      context,
    );

    // The phone learns only that it worked — never who was approved or where.
    return { ok: true };
  });
}
