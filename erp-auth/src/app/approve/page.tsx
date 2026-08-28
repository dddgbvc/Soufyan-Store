import type { Metadata } from 'next';

import { ApproveScreen } from '@/components/auth/ApproveScreen';
import { config } from '@/server/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'الموافقة على الدخول',
  robots: { index: false, follow: false },
};

/**
 * Landing page for a scanned QR.
 *
 * The challenge token travels in the URL *fragment*, which browsers never send
 * to the server — so it stays out of access logs, referrers and this render.
 * The client component reads it from `location.hash` and posts it back.
 */
export default function ApprovePage() {
  return (
    <ApproveScreen pinLength={config.pin.length} passwordLoginEnabled={config.supabase.passwordLoginEnabled} />
  );
}
