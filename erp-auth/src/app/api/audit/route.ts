import { handle } from '@/server/api/respond';
import { requirePermission } from '@/server/authz/guard';
import * as auditRepo from '@/server/db/repositories/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Security trail. Gated behind `settings.view`, mirroring the RLS policy. */
export async function GET(request: Request) {
  return handle(async () => {
    await requirePermission('settings.view');

    const url = new URL(request.url);
    const entries = await auditRepo.list({
      event: url.searchParams.get('event') ?? undefined,
      employeeId: url.searchParams.get('employeeId') ?? undefined,
      failuresOnly: url.searchParams.get('failures') === 'true',
      limit: Number.parseInt(url.searchParams.get('limit') ?? '80', 10) || 80,
      offset: Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0,
    });

    return { entries };
  });
}
