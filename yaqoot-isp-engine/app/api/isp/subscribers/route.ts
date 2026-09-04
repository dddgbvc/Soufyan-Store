import { NextResponse } from 'next/server';
import { searchSubscribers } from '@/lib/isp/providerService';
import { existingSid } from '@/lib/isp/providerSession';
import type { SubscriberQuery } from '@/modules/isp/providers/core/adapter';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const providerId = params.get('providerId');
  if (!providerId) {
    return NextResponse.json({ ok: false, message: 'حدد المزود.' }, { status: 400 });
  }

  const sid = await existingSid();
  if (sid === null) {
    return NextResponse.json({ ok: false, message: 'غير متصل بالمزود.' }, { status: 401 });
  }

  const query: SubscriberQuery = {
    text: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    technology: params.get('technology') ?? undefined,
    cursor: params.get('cursor') ?? undefined,
    limit: Number(params.get('limit') ?? 25),
  };

  const result = await searchSubscribers(sid, providerId, query);
  if (result === null) {
    return NextResponse.json({ ok: false, message: 'انتهت جلسة المزود.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, ...result });
}
