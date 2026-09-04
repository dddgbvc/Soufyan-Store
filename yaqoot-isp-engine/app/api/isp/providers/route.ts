import { NextResponse } from 'next/server';
import { listProviders } from '@/lib/isp/providerService';
import { existingSid } from '@/lib/isp/providerSession';

export const dynamic = 'force-dynamic';

/** Provider list with per-provider auth state and (once discovered) capabilities. */
export async function GET() {
  const sid = await existingSid();
  const providers = await listProviders(sid);
  return NextResponse.json({ providers });
}
