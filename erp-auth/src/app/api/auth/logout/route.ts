import { AuditEvent } from '@/server/audit/events';
import { handle } from '@/server/api/respond';
import { destroySession, getSession } from '@/server/auth/session';
import * as auditRepo from '@/server/db/repositories/audit';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  return handle(async () => {
    await assertCsrf();

    const current = await getSession();
    const context = await getRequestContext();
    const sessionId = await destroySession('logout');

    if (current) {
      await auditRepo.record({
        event: AuditEvent.logout,
        employeeId: current.employee.id,
        sessionId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: {},
      });
    }

    return { ok: true };
  });
}
