import 'server-only';

import { sql, type Db } from '@/server/db/client';
import type { AuditEntry, AuditSeverity } from '@/server/db/types';

export interface AuditInput {
  event: string;
  severity?: AuditSeverity;
  success?: boolean;
  employeeId?: string | null;
  actorEmployeeId?: string | null;
  sessionId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Last line of defence for "no secrets in logs": any key whose name hints at
 * credential material is dropped before the row is written, no matter what the
 * caller passed in.
 */
const FORBIDDEN_METADATA = /(pin|password|passwd|secret|token|otp|code|hash|pepper|key|authorization|cookie)/i;

type Json = null | string | number | boolean | Json[] | { [key: string]: Json | undefined };

export function sanitizeMetadata(metadata: Record<string, unknown> | undefined): { [key: string]: Json } {
  if (!metadata) return {};

  const clean: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA.test(key)) {
      clean[key] = '[redacted]';
      continue;
    }
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      clean[key] = value.map((item) => (typeof item === 'object' && item !== null ? '[object]' : (item as Json)));
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else if (value instanceof Date) {
      clean[key] = (value as Date).toISOString();
    } else {
      clean[key] = value as Json;
    }
  }
  return clean;
}

export async function record(input: AuditInput, db: Db = sql): Promise<void> {
  await db`
    insert into erp_auth.audit_logs
      (event, severity, success, employee_id, actor_employee_id, session_id,
       target_type, target_id, ip, user_agent, metadata)
    values
      (${input.event}, ${input.severity ?? 'info'}::erp_auth.audit_severity, ${input.success ?? true},
       ${input.employeeId ?? null}, ${input.actorEmployeeId ?? null}, ${input.sessionId ?? null},
       ${input.targetType ?? null}, ${input.targetId ?? null}, ${input.ip ?? null}::inet,
       ${input.userAgent ?? null}, ${db.json(sanitizeMetadata(input.metadata))})
  `;
}

export interface AuditFilter {
  event?: string;
  employeeId?: string;
  successOnly?: boolean;
  failuresOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditEntryWithNames extends AuditEntry {
  employeeName: string | null;
  actorName: string | null;
}

export async function list(filter: AuditFilter = {}, db: Db = sql): Promise<AuditEntryWithNames[]> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  return db<AuditEntryWithNames[]>`
    select a.id::text as id, a.event, a.severity, a.success, a.employee_id, a.actor_employee_id,
           a.target_type, a.target_id, host(a.ip) as ip, a.user_agent, a.metadata, a.created_at,
           e.full_name as employee_name,
           actor.full_name as actor_name
    from erp_auth.audit_logs a
    left join erp_auth.employees e     on e.id = a.employee_id
    left join erp_auth.employees actor on actor.id = a.actor_employee_id
    where (${filter.event ?? null}::text is null or a.event = ${filter.event ?? null})
      and (${filter.employeeId ?? null}::uuid is null or a.employee_id = ${filter.employeeId ?? null}::uuid)
      and (${filter.failuresOnly ?? false} = false or a.success = false)
      and (${filter.successOnly ?? false} = false or a.success = true)
    order by a.created_at desc, a.id desc
    limit ${limit} offset ${offset}
  `;
}
