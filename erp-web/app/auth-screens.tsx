'use client';
import {useEffect, useRef, useState} from 'react';
import {AlertCircle, ArrowLeft, Delete, Gem, KeyRound, Loader2, LogOut, Store} from 'lucide-react';

const storeErrors: Record<string, string> = {
  bad_credentials: 'البريد أو كلمة المرور غير صحيحة.',
  not_owner: 'هذا الحساب ليس حساب مالك محل. استخدم حساب المدير العام للمحل.',
  email_not_confirmed: 'البريد غير مؤكد بعد. أكّده من الرسالة المرسلة إليك.',
  rate_limited: 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.',
  invalid_input: 'أدخل بريداً صحيحاً وكلمة المرور.',
  not_configured: 'الخادم غير مهيأ بعد: أضف مفاتيح Supabase في متغيرات البيئة.',
  migration_missing: 'قاعدة البيانات تحتاج تحديث الدخول الجديد (ملف الترحيل في supabase/migrations).',
  upstream_unreachable: 'تعذر الوصول إلى الخادم. تحقق من الاتصال.',
};

const pinErrors: Record<string, string> = {
  wrong: 'الرمز غير صحيح.',
  invalid: 'الرمز من 4 إلى 8 أرقام.',
  locked: 'محاولات خاطئة كثيرة. انتظر دقيقتين ثم أعد المحاولة.',
  ambiguous: 'هذا الرمز مسجّل لأكثر من موظف. غيّر أحدهما من برنامج المكتب.',
  disabled: 'المحل أو الحساب موقوف.',
  migration_missing: storeErrors.migration_missing,
  not_configured: storeErrors.not_configured,
  upstream_unreachable: storeErrors.upstream_unreachable,
};

async function post(url: string, body?: unknown, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: body ? {'Content-Type': 'application/json'} : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({ok: false, reason: 'server_error'}));
  return data as {ok: boolean; reason?: string; [k: string]: any};
}

function Brand() {
  return (
    <div className="auth-brand">
      <span className="brand-gem"><Gem size={28}/></span>
      <div><strong>ياقوت<span>ERP</span></strong><small>كل أعمالك، بتناغم.</small></div>
    </div>
  );
}

export function StoreLogin({onDone}: {onDone: (storeName: string) => void}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const r = await post('/api/auth/store', {email, password});
    setBusy(false);
    if (r.ok) {
      setPassword('');
      onDone(r.store_name || '');
    } else setError(storeErrors[r.reason || ''] || 'تعذر تسجيل الدخول. حاول مجدداً.');
  }

  return (
    <div className="auth-screen">
      <section className="auth-card" aria-labelledby="store-login-title">
        <Brand/>
        <div className="auth-step"><span className="auth-step-num">1</span><span>حساب المحل</span><i/><span className="muted">2</span><span className="muted">رمز الموظف</span></div>
        <h1 id="store-login-title">دخول المحل</h1>
        <p className="auth-lead">سجّل بحساب مالك المحل مرة واحدة على هذا الجهاز. بعدها يدخل كل موظف برمزه PIN فقط.</p>
        <form onSubmit={submit} className="auth-form">
          <label>البريد الإلكتروني
            <input type="email" dir="ltr" autoComplete="username" inputMode="email" required value={email} onChange={e => setEmail(e.target.value)} maxLength={200}/>
          </label>
          <label>كلمة المرور
            <input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} maxLength={200}/>
          </label>
          {error && <div className="form-error" role="alert"><AlertCircle size={16}/>{error}</div>}
          <button className="button primary full" type="submit" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin"/> : <Store size={18}/>}
            {busy ? 'جارٍ التحقق…' : 'تفعيل هذا الجهاز للمحل'}
          </button>
        </form>
        <p className="auth-note"><KeyRound size={14}/>كلمة المرور لا تُحفظ. يُحفظ على الجهاز مفتاح تفعيل مشفّر فقط، ويمكن إلغاؤه من الإعدادات.</p>
      </section>
    </div>
  );
}

export function PinPad({storeName, message, onDone, onSignOut}: {
  storeName: string;
  message?: string;
  onDone: (data: any) => void;
  onSignOut: () => void;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(message || '');
  const [shake, setShake] = useState(0);
  const [confirmOut, setConfirmOut] = useState(false);
  const hidden = useRef<HTMLInputElement>(null);

  useEffect(() => { hidden.current?.focus(); }, []);

  async function submit(value = pin) {
    if (busy || !/^\d{4,8}$/.test(value)) {
      if (!busy) setError(pinErrors.invalid);
      return;
    }
    setBusy(true);
    setError('');
    const r = await post('/api/auth/pin', {pin: value});
    setBusy(false);
    if (r.ok) { onDone(r); return; }
    setPin('');
    setShake(s => s + 1);
    if (r.reason === 'unpaired') { onSignOut(); return; }
    setError(pinErrors[r.reason || ''] || 'تعذر الدخول. حاول مجدداً.');
    hidden.current?.focus();
  }

  const press = (d: string) => { if (!busy) { setError(''); setPin(p => (p.length < 8 ? p + d : p)); } };
  const back = () => setPin(p => p.slice(0, -1));

  function onKey(e: React.KeyboardEvent) {
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    else if (e.key === 'Enter') { e.preventDefault(); submit(); }
  }

  return (
    <div className="auth-screen" onClick={() => hidden.current?.focus()}>
      <section className="auth-card pin-card" aria-labelledby="pin-title">
        <Brand/>
        <div className="auth-store"><Store size={16}/>{storeName}</div>
        <h1 id="pin-title">أدخل رمزك</h1>
        <p className="auth-lead">رمز PIN يحدد هويتك وصلاحياتك في المحل.</p>
        <input
          ref={hidden}
          className="pin-capture"
          aria-label="رمز PIN"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={pin}
          onKeyDown={onKey}
          onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 8); setPin(v); }}
        />
        <div key={shake} className={'pin-dots' + (shake ? ' shake' : '')} aria-hidden="true">
          {Array.from({length: Math.max(4, pin.length)}, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''}/>)}
        </div>
        <div className="pin-error" role="alert">{error && <><AlertCircle size={15}/>{error}</>}</div>
        <div className="pin-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
            <button key={d} type="button" onClick={() => press(d)} disabled={busy}>{d}</button>
          ))}
          <button type="button" className="pin-aux" onClick={back} disabled={busy || !pin} aria-label="حذف رقم"><Delete size={20}/></button>
          <button type="button" onClick={() => press('0')} disabled={busy}>0</button>
          <button type="button" className="pin-go" onClick={() => submit()} disabled={busy || pin.length < 4} aria-label="دخول">
            {busy ? <Loader2 size={20} className="spin"/> : <ArrowLeft size={22}/>}
          </button>
        </div>
        {confirmOut ? (
          <div className="auth-confirm">
            <span>سيُلغى تفعيل هذا الجهاز ويحتاج حساب المحل من جديد.</span>
            <div><button className="button danger" onClick={onSignOut}>تأكيد الخروج</button><button className="button secondary" onClick={() => setConfirmOut(false)}>إلغاء</button></div>
          </div>
        ) : (
          <button className="text-button auth-out" onClick={() => setConfirmOut(true)}><LogOut size={15}/>الخروج من حساب المحل</button>
        )}
      </section>
    </div>
  );
}
