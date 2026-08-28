import { redirect } from 'next/navigation';

import { getSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

/** The entry point simply routes to wherever the caller belongs. */
export default async function RootPage() {
  const session = await getSession();
  redirect(session ? '/dashboard' : '/login');
}
