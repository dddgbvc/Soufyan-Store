import { getSession } from '@/server/auth/session';
import { handle } from '@/server/api/respond';
import * as permissionsRepo from '@/server/db/repositories/permissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The client's single source of truth about who it is. Returns a closed shape
 * for anonymous callers instead of a 401, so the login screen can render
 * without treating "not logged in" as an error.
 */
export async function GET() {
  return handle(async () => {
    const authenticated = await getSession();

    if (!authenticated) {
      return { authenticated: false as const };
    }

    const [permissions, modules] = await Promise.all([
      permissionsRepo.keysForEmployee(authenticated.employee.id),
      permissionsRepo.listModules(),
    ]);

    return {
      authenticated: true as const,
      employee: authenticated.employee,
      permissions,
      modules,
      mustChangePin: authenticated.employee.mustChangePin,
      session: {
        id: authenticated.session.id,
        method: authenticated.session.method,
        expiresAt: authenticated.session.expiresAt,
        absoluteExpiresAt: authenticated.session.absoluteExpiresAt,
      },
    };
  });
}
