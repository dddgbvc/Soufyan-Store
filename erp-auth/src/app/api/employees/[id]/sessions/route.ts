import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { requirePermission } from '@/server/authz/guard';
import { AuditEvent } from '@/server/audit/events';
import { listSessions, revokeAllSessions } from '@/server/auth/session';
import * as auditRepo from '@/server/db/repositories/audit';
import { toSessionSummary } from '@/server/api/serialize';
import { assertCsrf } from '@/server/security/csrf';
import { AuthError } from '@/server/security/errors';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, uuidSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function target(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new AuthError('not_found');
  return parsed.data;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requirePermission('employees.view');
    const sessions = await listSessions(await target(params), 50);
    return { sessions: sessions.map(toSessionSummary) };
  });
}

/** Kicks every device belonging to an employee off the system at once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await assertCsrf();
    const actor = await requirePermission('employees.update');
    const id = await target(params);
    const { reason } = await parseBody(request, z.object({ reason: z.string().max(80).optional() }));
    const context = await getRequestContext();

    const revoked = await revokeAllSessions(id, reason ?? 'revoked_by_admin');

    await auditRepo.record({
      event: AuditEvent.sessionRevoked,
      severity: 'warning',
      employeeId: id,
      actorEmployeeId: actor.employee.id,
      sessionId: actor.session.id,
      ip: context.ip,
      userAgent: context.userAgent,
      targetType: 'employee',
      targetId: id,
      metadata: { revoked },
    });

    return { revoked };
  });
}
