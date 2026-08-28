import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { loginWithPassword } from '@/server/auth/password';
import { setSessionCookie } from '@/server/auth/session';
import * as permissionsRepo from '@/server/db/repositories/permissions';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';
import { emailSchema, parseBody } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

/** Alternate login, verified by Supabase Auth and exchanged for an ERP session. */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const { email, password } = await parseBody(request, schema);
    const context = await getRequestContext();

    const result = await loginWithPassword(email, password, context);
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
