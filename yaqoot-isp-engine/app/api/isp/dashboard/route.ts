import { NextResponse } from 'next/server';
import { dashboardSnapshot } from '@/lib/isp/providerService';
import { existingSid } from '@/lib/isp/providerSession';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const providerId = new URL(request.url).searchParams.get('providerId');
  if (!providerId) {
    return NextResponse.json({ ok: false, message: 'حدد المزود.' }, { status: 400 });
  }

  const sid = await existingSid();
  if (sid === null) {
    return NextResponse.json({ ok: false, message: 'غير متصل بالمزود.' }, { status: 401 });
  }

  const snapshot = await dashboardSnapshot(sid, providerId);
  if (snapshot === null) {
    // Fail closed: an expired provider session sends the user back to login.
    return NextResponse.json({ ok: false, message: 'انتهت جلسة المزود.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, snapshot });
}
