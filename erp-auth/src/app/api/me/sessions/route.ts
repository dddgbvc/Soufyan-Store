import { z } from 'zod';

import { handle } from '@/server/api/respond';
import { requireAuth } from '@/server/authz/guard';
import { AuditEvent } from '@/server/audit/events';
import { listSessions, revokeOtherSessions } from '@/server/auth/session';
import * as auditRepo from '@/server/db/repositories/audit';
import * as sessionsRepo from '@/server/db/repositories/sessions';
import { toSessionSummary } from '@/server/api/serialize';
import { assertCsrf } from '@/server/security/csrf';
import { AuthError } from '@/server/security/errors';
import { getRequestContext } from '@/server/security/requestContext';
import { parseBody, uuidSchema } from '@/server/security/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The employee's own device list, so they can spot a session they don't know. */
export async function GET() {
  return handle(async () => {
    const auth = await requireAuth();
    const sessions = await listSessions(auth.employee.id, 50);
    return { sessions: sessions.map(toSessionSummary), currentSessionId: auth.session.id };
  });
}

const schema = z.object({ sessionId: uuidSchema.optional(), all: z.boolean().optional() });

/** Revokes one of the caller's own sessions, or every other one at once. */
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const auth = await requireAuth();
    const body = await parseBody(request, schema);
    const context = await getRequestContext();

    let revoked = 0;

    if (body.all) {
      revoked = await revokeOtherSessions(auth.employee.id, auth.session.id, 'revoked_by_owner');
    } else if (body.sessionId) {
      if (body.sessionId === auth.session.id) {
        throw new AuthError('invalid_request', { details: { reason: 'use_logout_for_current_session' } });
      }
      // Scoped to the caller's own sessions: the id alone grants nothing.
      const owned = await listSessions(auth.employee.id, 100);
      if (!owned.some((session) => session.id === body.sessionId)) {
        throw new AuthError('not_found');
      }
      revoked = (await sessionsRepo.revokeById(body.sessionId, 'revoked_by_owner')) ? 1 : 0;
    } else {
      throw new AuthError('invalid_request');
    }

    await auditRepo.record({
      event: AuditEvent.sessionRevoked,
      employeeId: auth.employee.id,
      actorEmployeeId: auth.employee.id,
      sessionId: auth.session.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { revoked, scope: body.all ? 'others' : 'single' },
    });

    return { revoked };
  });
}
