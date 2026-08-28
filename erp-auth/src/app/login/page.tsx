import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginScreen } from '@/components/auth/LoginScreen';
import { config } from '@/server/config';
import { getSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
};

export default async function LoginPage() {
  const session = await getSession();
  if (session && !session.employee.mustChangePin) {
    redirect('/dashboard');
  }

  return (
    <LoginScreen pinLength={config.pin.length} passwordLoginEnabled={config.supabase.passwordLoginEnabled} />
  );
}
