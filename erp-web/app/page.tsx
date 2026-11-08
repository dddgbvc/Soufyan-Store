'use client';
import {useCallback, useEffect, useState} from 'react';
import {AlertCircle, Gem, RefreshCw} from 'lucide-react';
import {PinPad, StoreLogin} from './auth-screens';
import ErpApp from './erp-app';
import type {Employee} from './data';

// تسلسل الدخول:
//   unpaired → دخول بحساب المحل (مالك ADMIN) يفعّل هذا المتصفح
//   locked   → شاشة PIN: الرمز يحدد الموظف وصلاحياته
//   active   → التطبيق، والأقسام تظهر حسب صلاحيات الموظف من قاعدة البيانات
type State =
  | {state: 'loading'}
  | {state: 'error'; message: string}
  | {state: 'unpaired'}
  | {state: 'locked'; store_name: string; message?: string}
  | {state: 'active'; store_name: string; employee: Employee; permissions: string[]};

export default function Page() {
  const [s, setS] = useState<State>({state: 'loading'});

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', {cache: 'no-store', credentials: 'same-origin'});
      const r: any = await res.json();
      if (!r.ok) {
        const message = r.reason === 'not_configured' ? 'الخادم غير مهيأ: أضف SUPABASE_URL وSUPABASE_ANON_KEY وSUPABASE_SERVICE_ROLE_KEY.'
          : r.reason === 'migration_missing' ? 'قاعدة البيانات تحتاج تطبيق ملف الترحيل supabase/migrations/20261108120000_web_store_account_pin_login.sql.'
          : 'تعذر الاتصال بالخادم.';
        setS({state: 'error', message});
        return;
      }
      setS(r);
    } catch {
      setS({state: 'error', message: 'تعذر الاتصال بالخادم. تحقق من الإنترنت.'});
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const lock = useCallback(async (message?: string) => {
    await fetch('/api/auth/pin', {method: 'DELETE', credentials: 'same-origin'}).catch(() => null);
    setS(prev => ({state: 'locked', store_name: 'store_name' in prev ? prev.store_name : '', message}));
  }, []);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/store', {method: 'DELETE', credentials: 'same-origin'}).catch(() => null);
    setS({state: 'unpaired'});
  }, []);

  if (s.state === 'loading') return <div className="boot-screen"><Gem size={40}/><h2>ياقوت</h2><p>جارٍ التحقق من الجهاز…</p></div>;
  if (s.state === 'error') {
    return (
      <div className="boot-screen">
        <AlertCircle size={40}/><h2>تعذر البدء</h2><p>{s.message}</p>
        <button className="button secondary" onClick={() => { setS({state: 'loading'}); refresh(); }}><RefreshCw size={16}/>إعادة المحاولة</button>
      </div>
    );
  }
  if (s.state === 'unpaired') return <StoreLogin onDone={store_name => setS({state: 'locked', store_name})}/>;
  if (s.state === 'locked') {
    return (
      <PinPad
        key={s.message || 'pin'}
        storeName={s.store_name}
        message={s.message}
        onSignOut={signOut}
        onDone={r => setS({state: 'active', store_name: r.store_name || s.store_name, employee: r.employee, permissions: r.permissions || []})}
      />
    );
  }
  return <ErpApp key={s.employee.id} storeName={s.store_name} employee={s.employee} permissions={s.permissions} onLock={lock} onSignOut={signOut}/>;
}
