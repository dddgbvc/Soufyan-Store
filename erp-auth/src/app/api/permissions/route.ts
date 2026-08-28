import { handle } from '@/server/api/respond';
import { requireAuth } from '@/server/authz/guard';
import * as permissionsRepo from '@/server/db/repositories/permissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The full capability vocabulary, for the permission editor. */
export async function GET() {
  return handle(async () => {
    await requireAuth();
    const [modules, permissions] = await Promise.all([
      permissionsRepo.listModules(),
      permissionsRepo.listPermissions(),
    ]);
    return { modules, permissions };
  });
}
