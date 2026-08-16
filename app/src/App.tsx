import { AnimatePresence } from 'framer-motion';
import { useCallback, useState } from 'react';
import { AuthPortal } from './components/AuthPortal';
import { DashboardGateway } from './components/DashboardGateway';
import { AuthProvider, useAuth } from './state/AuthProvider';

/**
 * جذر التطبيق: يفصل بوابة المصادقة عن وجهة ما بعد الدخول.
 * حالة المصادقة كلها داخل `AuthProvider` — هنا نقرّر فقط أي سطح يُعرض.
 */
export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const { reset } = useAuth();
  const [authenticated, setAuthenticated] = useState(false);

  const handleAuthenticated = useCallback(() => setAuthenticated(true), []);

  const handleSignOut = useCallback(() => {
    setAuthenticated(false);
    // إعادة الحالة لنقطة الصفر حتى لا تبقى بيانات الجلسة السابقة في النماذج.
    reset();
  }, [reset]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {authenticated ? (
        <DashboardGateway key="dashboard" onSignOut={handleSignOut} />
      ) : (
        <AuthPortal key="portal" onAuthenticated={handleAuthenticated} />
      )}
    </AnimatePresence>
  );
}
