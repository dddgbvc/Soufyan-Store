import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authRequirements,
  discoverCapabilities,
  login,
  logout,
  submitSecondFactor,
} from '@/lib/isp/providerService';
import { currentSid } from '@/lib/isp/providerSession';

export const dynamic = 'force-dynamic';

/**
 * Provider authentication endpoint (§41–§46).
 *
 * Credentials arrive here and go straight to the adapter. They are never
 * stored, never logged and never echoed back — not even on failure.
 */
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('requirements'), providerId: z.string().min(1) }),
  z.object({
    action: z.literal('login'),
    providerId: z.string().min(1),
    methodId: z.string().min(1),
    credentials: z.record(z.string()),
    persistence: z.enum(['session_only', 'remember', 'always_ask']).default('session_only'),
  }),
  z.object({
    action: z.literal('mfa'),
    challengeId: z.string().min(1),
    answers: z.record(z.string()),
  }),
  z.object({ action: z.literal('logout'), providerId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // The validation detail is not returned: it can echo submitted values.
    return NextResponse.json({ ok: false, message: 'طلب غير صالح.' }, { status: 400 });
  }

  const sid = await currentSid();
  const body = parsed.data;

  switch (body.action) {
    case 'requirements': {
      const requirements = await authRequirements(body.providerId);
      return NextResponse.json({ ok: true, requirements });
    }

    case 'login': {
      const result = await login(
        sid,
        body.providerId,
        body.methodId,
        body.credentials,
        body.persistence,
      );
      if (result.kind === 'error') {
        return NextResponse.json(
          { ok: false, kind: 'error', message: result.message },
          { status: 401 },
        );
      }
      if (result.kind === 'mfa') {
        return NextResponse.json({ ok: true, kind: 'mfa', challenge: result.challenge });
      }
      // Discovery must complete before the dashboard renders (§43).
      const discovery = await discoverCapabilities(sid, body.providerId);
      return NextResponse.json({ ok: true, kind: 'authenticated', discovery });
    }

    case 'mfa': {
      const result = await submitSecondFactor(body.challengeId, body.answers);
      if (result.kind === 'error') {
        return NextResponse.json(
          { ok: false, kind: 'error', message: result.message },
          { status: 401 },
        );
      }
      if (result.kind === 'mfa') {
        return NextResponse.json({ ok: true, kind: 'mfa', challenge: result.challenge });
      }
      return NextResponse.json({ ok: true, kind: 'authenticated' });
    }

    case 'logout': {
      await logout(sid, body.providerId);
      return NextResponse.json({ ok: true });
    }

    default: {
      const never: never = body;
      throw new Error(`Unhandled action: ${JSON.stringify(never)}`);
    }
  }
}
