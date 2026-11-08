'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle, AlertTriangle, ArrowLeft, Bell, Boxes, Check, ChevronLeft, Gem, KeyRound, LayoutDashboard, Loader2,
  Lock, LogOut, Menu, Monitor, Moon, Package, Receipt, RefreshCw, RotateCcw, Search, Settings, ShieldCheck,
  Store, Sun, Truck, UserCog, Users, Wallet, Wrench, X, Landmark, Plus,
} from 'lucide-react';
import {PushSettings} from './push-settings';
import {Welcome, fontOptions} from './welcome';
import {
  Employee, Row, SectionKey, can, money, paymentLabel, permissionGroups, roleLabel, sections, when,
} from './data';
import {
  Badge, DataTable, ListPanel, NameCell, SearchBox, Segmented, SessionExpired, ToastProvider, api, cash, useList,
} from './ui';
import Debts from './views/debts';
import NotificationCenter from './views/notifications';
import {Dashboard, InvoiceDetail, NewExpense, RepairDetail, Vault} from './views/ops';

const icons: Record<SectionKey, any> = {
  dashboard: LayoutDashboard, invoices: Receipt, customers: Wallet, vault: Landmark, products: Package, shortages: Boxes,
  repairs: Wrench, returns: RotateCcw, expenses: Receipt, shipping: Truck, employees: Users, sessions: Monitor,
  notifications: Bell, settings: Settings,
};
const groupLabel = {work: 'مساحة العمل', ops: 'العمليات', admin: 'الإدارة'};
const PREFS = 'yaqoot-prefs-v2';

// ======================================================================
export default function ErpApp(props: Parameters<typeof Shell>[0]) {
  return <ToastProvider><Shell {...props}/></ToastProvider>;
}

function Shell({storeName, employee, permissions, onLock, onSignOut}: {
  storeName: string;
  employee: Employee;
  permissions: string[];
  onLock: (message?: string) => void;
  onSignOut: () => void;
}) {
  const allowed = useMemo(() => sections.filter(s => can(permissions, s.perms)), [permissions]);
  const first = allowed[0]?.key || 'settings';
  const [page, setPage] = useState<SectionKey>(first);
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(false);
  const [font, setFont] = useState('thmanyah');
  const [welcomeEnabled, setWelcomeEnabled] = useState(true);
  const [welcomePlay, setWelcomePlay] = useState(0);
  const [idleMinutes, setIdleMinutes] = useState(10);
  const [detail, setDetail] = useState<{title: string; row: Row} | null>(null);
  const [toast, setToast] = useState('');
  const [unread, setUnread] = useState(0);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [repairId, setRepairId] = useState<string | null>(null);
  const [listKey, setListKey] = useState(0);
  const prefsReady = useRef(false);

  const expired = useCallback(() => onLock('انتهت الجلسة. أدخل رمزك من جديد.'), [onLock]);

  // عدّاد الإشعارات غير المقروءة (الجرس) — كل دقيقة.
  useEffect(() => {
    let stop = false;
    const poll = () => api('inbox', {limit: 1}).then(d => { if (!stop) setUnread(d.unread || 0); }).catch(e => { if (e instanceof SessionExpired) expired(); });
    poll();
    const t = setInterval(poll, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [expired]);

  // التفضيلات محلية لكل جهاز (المظهر والخط والترحيب ومدة القفل التلقائي).
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS) || '{}');
      setDark(!!p.dark);
      setFont(fontOptions.some(f => f.id === p.font) ? p.font : 'thmanyah');
      setWelcomeEnabled(p.welcomeEnabled !== false);
      if ([5, 10, 15, 30].includes(p.idleMinutes)) setIdleMinutes(p.idleMinutes);
    } catch {}
    prefsReady.current = true;
    const go = () => {
      const h = location.hash.slice(1) as SectionKey;
      if (allowed.some(s => s.key === h)) setPage(h);
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, [allowed]);
  useEffect(() => {
    if (!prefsReady.current) return;
    try { localStorage.setItem(PREFS, JSON.stringify({dark, font, welcomeEnabled, idleMinutes})); } catch {}
  }, [dark, font, welcomeEnabled, idleMinutes]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => { document.documentElement.dataset.font = font; }, [font]);
  useEffect(() => { if (welcomeEnabled) setWelcomePlay(p => p + 1); }, [employee.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } }, [toast]);

  // قفل تلقائي عند الخمول — الخادم يفرض 30 دقيقة كحد أقصى على كل حال.
  useEffect(() => {
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach(e => window.addEventListener(e, bump, {passive: true}));
    const timer = setInterval(() => {
      if (Date.now() - last > idleMinutes * 60_000) onLock('قُفلت الشاشة تلقائياً بعد فترة خمول.');
    }, 15_000);
    // نبضة كل 5 دقائق أثناء العمل تُبقي الجلسة حيّة على الخادم.
    const ping = setInterval(async () => {
      if (Date.now() - last > 5 * 60_000) return;
      const r: any = await fetch('/api/auth/status', {cache: 'no-store'}).then(x => x.json()).catch(() => null);
      if (r && r.state !== 'active') expired();
    }, 5 * 60_000);
    return () => { events.forEach(e => window.removeEventListener(e, bump)); clearInterval(timer); clearInterval(ping); };
  }, [idleMinutes, onLock, expired]);

  useEffect(() => {
    if (!detail) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetail(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [detail]);

  function nav(k: SectionKey) {
    setPage(k);
    location.hash = k;
    setMobile(false);
  }

  const section = sections.find(s => s.key === page)!;
  const isOwner = employee.role === 'ADMIN' || permissions.includes('settings.account');
  const open = (title: string) => (row: Row) => setDetail({title, row});

  return (
    <div className={'app ' + (mobile ? 'nav-open' : '')}>
      {mobile && <div className="nav-scrim" onClick={() => setMobile(false)}/>}
      <aside className="sidebar">
        <a href={'#' + first} className="brand" onClick={() => nav(first)}>
          <div className="brand-gem"><Gem size={30}/></div>
          <div><strong>ياقوت<span>ERP</span></strong><small>كل أعمالك، بتناغم.</small></div>
        </a>
        <div className="store-switch" aria-label="المحل الحالي">
          <span className="store-icon"><Store size={20}/></span>
          <span><b>{storeName}</b><small>متصل بقاعدة بيانات المحل</small></span>
        </div>
        <nav>
          {(['work', 'ops', 'admin'] as const).map(g => {
            const items = allowed.filter(s => s.group === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <div className="nav-label">{groupLabel[g]}</div>
                {items.map(s => {
                  const I = icons[s.key];
                  return (
                    <button key={s.key} className={page === s.key ? 'active' : ''} onClick={() => nav(s.key)} aria-current={page === s.key ? 'page' : undefined}>
                      <I size={19}/><span>{s.title}</span>{s.key === 'notifications' && unread > 0 && <em className="alert-count">{unread}</em>}{page === s.key && <span className="active-dot"/>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status"><span className="status-led"/><div><b>{roleLabel[employee.role] || employee.role}</b><small>{permissions.length} صلاحية فعّالة من قاعدة البيانات</small></div><ShieldCheck size={18}/></div>
          <button className="profile" onClick={() => onLock()} title="قفل الشاشة وتبديل الموظف">
            <span className="avatar">{employee.name.slice(0, 1)}</span>
            <span><strong>{employee.name}</strong><small>قفل / تبديل الموظف</small></span>
            <Lock size={18}/>
          </button>
        </div>
      </aside>
      <Welcome play={welcomePlay} enabled={welcomeEnabled} storeName={storeName}/>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-button hamburger" onClick={() => setMobile(!mobile)} aria-label="فتح القائمة"><Menu size={22}/></button>
            <span>{storeName}</span><ChevronLeft size={14}/><strong>{section.title}</strong>
          </div>
          <div className="top-actions">
            <span className="demo-badge"><i className="live"/>بيانات حقيقية</span>
            <span className="top-divider"/>
            <button className="icon-button" onClick={() => setDark(!dark)} aria-label={dark ? 'الوضع النهاري' : 'الوضع الليلي'}>{dark ? <Sun size={20}/> : <Moon size={20}/>}</button>
            <button className="icon-button notification" onClick={() => nav('notifications')} aria-label={`مركز الإشعارات${unread ? ` (${unread} غير مقروء)` : ''}`}><Bell size={20}/>{unread > 0 && <em className="bell-count">{unread > 99 ? '99+' : unread}</em>}</button>
            <button className="icon-button" onClick={() => nav('settings')} aria-label="الإعدادات: الإشعارات والخطوط"><Settings size={19}/></button>
            <button className="icon-button" onClick={() => onLock()} aria-label="قفل الشاشة"><Lock size={19}/></button>
            <span className="avatar small" title={employee.name}>{employee.name.slice(0, 1)}</span>
          </div>
        </header>
        <div className="content" key={page}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">{storeName} / {section.title}</div>
              <h1>{page === 'dashboard' ? `أهلاً ${employee.name}، يوم عمل موفّق` : section.title}</h1>
              <p>{section.desc}</p>
            </div>
          </div>
          {page === 'dashboard' && <Dashboard permissions={permissions} onExpired={expired} nav={nav} openInvoice={r => setInvoiceId(r.id)}/>}
          {page === 'invoices' && <Invoices onExpired={expired} open={r => setInvoiceId(r.id)}/>}
          {page === 'customers' && <Debts permissions={permissions} storeName={storeName} onExpired={expired}/>}
          {page === 'vault' && <Vault permissions={permissions} onExpired={expired}/>}
          {page === 'notifications' && <NotificationCenter permissions={permissions} onExpired={expired} onUnread={setUnread}/>}
          {page === 'products' && <Products onExpired={expired} open={open('منتج')}/>}
          {page === 'shortages' && <Shortages onExpired={expired}/>}
          {page === 'repairs' && <Repairs key={listKey} onExpired={expired} open={r => setRepairId(r.id)}/>}
          {page === 'returns' && <Returns onExpired={expired} open={open('مرتجع')}/>}
          {page === 'expenses' && <Expenses key={listKey} onExpired={expired} open={open('مصروف')} canCreate={permissions.includes('expenses.create')} onNew={() => setDetail({title: '__new_expense', row: {}})}/>}
          {page === 'shipping' && <Shipping onExpired={expired} open={open('شحنة')}/>}
          {page === 'employees' && <Employees onExpired={expired} open={open('موظف')}/>}
          {page === 'sessions' && <Sessions onExpired={expired}/>}
          {page === 'settings' && (
            <div className="settings-grid">
              <PushSettings permissions={employee.role === 'ADMIN' ? [...permissions, '__admin'] : permissions}/>
              <section className="panel settings-card">
                <h3>هويتي في المحل</h3>
                <div className="settings-row"><div><b>{employee.name}</b><p>{roleLabel[employee.role] || employee.role}{employee.department ? ' • ' + employee.department : ''}</p></div><span className="avatar">{employee.name.slice(0, 1)}</span></div>
                <MyPermissions permissions={permissions}/>
              </section>
              <section className="panel settings-card">
                <h3>الخطوط والمظهر</h3>
                <div className="settings-row"><div><b>المظهر الليلي</b><p>واجهة مريحة للعمل في المساء</p></div><button className={'toggle ' + (dark ? 'on' : '')} onClick={() => setDark(!dark)} role="switch" aria-checked={dark} aria-label="تفعيل المظهر الليلي"><i/></button></div>
                <div className="typography-settings">
                  <div className="settings-label"><b>خط الواجهة</b><span>اختر الخط الأقرب لذوقك</span></div>
                  <div className="font-options" role="radiogroup" aria-label="خط الواجهة">
                    {fontOptions.map(f => (
                      <button key={f.id} type="button" role="radio" aria-checked={font === f.id} className={'font-option ' + (font === f.id ? 'chosen' : '')} onClick={() => setFont(f.id)} style={{fontFamily: `'${f.family}',Tahoma,sans-serif`}}>
                        <span className="font-name">{f.name}<span className="font-radio">{font === f.id && <Check size={12}/>}</span></span>
                        <span className="font-example">أعمالك، بكل وضوح.</span><small>{f.description}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-row welcome-settings"><div><b>ترحيب خفيف عند الدخول</b><p>يظهر عند دخول كل موظف</p></div><button className={'toggle ' + (welcomeEnabled ? 'on' : '')} onClick={() => setWelcomeEnabled(!welcomeEnabled)} role="switch" aria-checked={welcomeEnabled} aria-label="تفعيل ترحيب الدخول"><i/></button></div>
              </section>
              <section className="panel settings-card">
                <h3>الأمان على هذا الجهاز</h3>
                <label>القفل التلقائي بعد الخمول
                  <select value={idleMinutes} onChange={e => setIdleMinutes(Number(e.target.value))}>
                    {[5, 10, 15, 30].map(m => <option key={m} value={m}>{m} دقائق</option>)}
                  </select>
                </label>
                <p className="form-note"><ShieldCheck size={15}/>الخادم ينهي أي جلسة بعد 30 دقيقة خمول أو 12 ساعة مهما كان الإعداد.</p>
                <button className="button secondary full" onClick={() => onLock()}><Lock size={17}/>قفل الآن وتبديل الموظف</button>
                {isOwner && <>
                  <hr/>
                  <h3>حساب المحل</h3>
                  <p>هذا الجهاز مفعّل لمحل «{storeName}». الخروج يلغي التفعيل ويحتاج بريد وكلمة مرور المالك من جديد.</p>
                  <button className="button danger" onClick={onSignOut}><LogOut size={17}/>الخروج من حساب المحل</button>
                </>}
              </section>
            </div>
          )}
          <footer><span><Gem size={14}/>ياقوت ERP <i/> {storeName}</span><span>IQD <i/> بتوقيت بغداد</span></footer>
        </div>
      </main>
      {toast && <div className="toast" role="status"><Check size={18}/>{toast}<button aria-label="إغلاق الإشعار" onClick={() => setToast('')}><X size={15}/></button></div>}
      {detail && detail.title === '__new_expense' && <NewExpense onClose={() => setDetail(null)} onExpired={expired} onDone={() => setListKey(k => k + 1)}/>}
      {detail && detail.title !== '__new_expense' && <DetailModal title={detail.title} row={detail.row} onClose={() => setDetail(null)}/>}
      {invoiceId && <InvoiceDetail id={invoiceId} onClose={() => setInvoiceId(null)} onExpired={expired}/>}
      {repairId && <RepairDetail id={repairId} onClose={() => setRepairId(null)} onExpired={expired} onChanged={() => setListKey(k => k + 1)}/>}
    </div>
  );
}

// ======================================================================
const fieldLabels: Record<string, string> = {
  invoice_number: 'رقم الفاتورة', customer_name: 'الزبون', customer_phone: 'هاتف الزبون', total_amount: 'الإجمالي', paid_amount: 'المدفوع',
  delivery_price: 'أجرة التوصيل', payment_type: 'طريقة الدفع', actor: 'بواسطة', created_at: 'التاريخ', updated_at: 'آخر تحديث',
  name: 'الاسم', phone: 'الهاتف', address: 'العنوان', balance: 'الرصيد', credit_limit: 'حد الدين', barcode: 'الباركود', brand: 'الماركة',
  model: 'الموديل', color: 'اللون', storage_gb: 'السعة GB', condition: 'الحالة', category: 'التصنيف', selling_price: 'سعر البيع',
  cost_price: 'التكلفة', wholesale_price: 'سعر الجملة', stock_quantity: 'الكمية', min_stock_alert: 'حد التنبيه', has_imei: 'برقم IMEI',
  is_service: 'خدمة', ticket_no: 'رقم التذكرة', device: 'الجهاز', fault: 'العطل', status_label: 'الحالة', technician_name: 'الفني',
  cost: 'الكلفة', labour: 'أجور العمل', prepaid: 'مدفوع مقدماً', promised_at: 'موعد التسليم', return_number: 'رقم المرتجع',
  refund_method: 'طريقة الإرجاع', reason: 'السبب', description: 'الوصف', amount: 'المبلغ', reversed: 'معكوس', recipient: 'المستلم',
  governorate: 'المحافظة', city: 'المدينة', item_count: 'عدد القطع', cod_amount: 'مبلغ الاستلام', delivery_fee: 'أجرة التوصيل',
  merchant_settlement: 'تسوية التاجر', provider_status_text: 'حالة الشركة', provider_order_id: 'رقم الطلب', provider_id: 'الشركة',
  display_name: 'الاسم الظاهر', role: 'الدور', department: 'القسم', has_pin: 'لديه رمز PIN', linked_account: 'حساب مربوط',
  custom_permissions: 'صلاحيات مخصصة', devices: 'أجهزة مربوطة', last_seen_at: 'آخر ظهور',
};
const moneyFields = new Set(['total_amount', 'paid_amount', 'delivery_price', 'balance', 'credit_limit', 'selling_price', 'cost_price', 'wholesale_price', 'cost', 'labour', 'prepaid', 'amount', 'cod_amount', 'delivery_fee', 'merchant_settlement']);

function DetailModal({title, row, onClose}: {title: string; row: Row; onClose: () => void}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const fmt = (k: string, v: any) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
    if (moneyFields.has(k)) return money(v) + ' د.ع';
    if (k === 'role') return roleLabel[v] || v;
    if (k === 'payment_type') return paymentLabel(v);
    if (/_at$/.test(k)) return when(v);
    if (Array.isArray(v)) return v.length + ' عنصر';
    return String(v);
  };
  const entries = Object.entries(row).filter(([k, v]) => fieldLabels[k] && (v === null || typeof v !== 'object'));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal detail-modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="modal-heading">
          <div><small>{title}</small><h2>{row.invoice_number || row.ticket_no || row.return_number || row.provider_order_id || row.name || row.description || row.customer_name}</h2></div>
          <button ref={ref} className="icon-button" aria-label="إغلاق" onClick={onClose}><X size={21}/></button>
        </div>
        <div className="detail-fields">
          {entries.map(([k, v]) => <div key={k}><small>{fieldLabels[k]}</small><b>{fmt(k, v)}</b></div>)}
        </div>
        {Array.isArray(row.items) && row.items.length > 0 && (
          <DataTable rows={row.items} columns={[
            {label: 'الصنف', cell: r => r.product_name},
            {label: 'الكمية', cell: r => r.quantity},
            {label: 'الحالة', cell: r => r.condition || '—'},
            {label: 'المبلغ', cell: r => cash(r.total), className: 'number'},
          ]}/>
        )}
        {Array.isArray(row.permissions) && <MyPermissions permissions={row.permissions} title="صلاحياته"/>}
        <div className="modal-actions"><button className="button secondary" onClick={onClose}>إغلاق</button></div>
      </section>
    </div>
  );
}

function MyPermissions({permissions, title = 'صلاحياتي'}: {permissions: string[]; title?: string}) {
  const groups = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const p of permissions) {
      const g = p.split('.')[0];
      (m[g] ||= []).push(p);
    }
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
  }, [permissions]);
  return (
    <div className="perm-list">
      <div className="settings-label"><b>{title}</b><span>{permissions.length} صلاحية • مصدرها قاعدة البيانات</span></div>
      {groups.map(([g, list]) => (
        <details key={g}>
          <summary><KeyRound size={14}/>{permissionGroups[g] || g}<em>{list.length}</em></summary>
          <div className="perm-chips">{list.map(p => <code key={p}>{p}</code>)}</div>
        </details>
      ))}
    </div>
  );
}

// ======================================================================
type PageProps = {onExpired: () => void; open: (r: Row) => void};

function Invoices({onExpired, open}: PageProps) {
  const [q, setQ] = useState('');
  const [debt, setDebt] = useState<'all' | 'debt'>('all');
  const list = useList('invoices', 'invoices', {q, debt_only: debt === 'debt'}, onExpired);
  return (
    <ListPanel list={list} cursor={last => ({before: last.created_at})}
      toolbar={<><SearchBox value={q} onChange={setQ} placeholder="رقم الفاتورة، اسم الزبون أو هاتفه…"/><div className="table-filters"><Segmented value={debt} onChange={setDebt} options={[['all', 'الكل'], ['debt', 'غير مسددة']]}/></div></>}>
      <DataTable rows={list.rows} onOpen={open} columns={[
        {label: 'الفاتورة', cell: r => <bdi>{r.invoice_number}</bdi>},
        {label: 'الزبون', cell: r => <NameCell title={r.customer_name || 'زبون نقدي'} sub={r.customer_phone}/>},
        {label: 'التاريخ', cell: r => when(r.created_at)},
        {label: 'الإجمالي', cell: r => cash(r.total_amount), className: 'number'},
        {label: 'المتبقي', cell: r => { const rem = Number(r.total_amount) - Number(r.paid_amount); return rem > 0 ? <span className="warning-text">{cash(rem)}</span> : '—'; }, className: 'number'},
        {label: 'الدفع', cell: r => <Badge tone={Number(r.total_amount) > Number(r.paid_amount) ? 'amber' : 'green'}>{paymentLabel(r.payment_type)}</Badge>},
        {label: 'الموظف', cell: r => r.actor || '—'},
      ]}/>
    </ListPanel>
  );
}

function Products({onExpired, open}: PageProps) {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'all' | 'low'>('all');
  const list = useList('products', 'products', {q, low_only: mode === 'low'}, onExpired);
  const cost = !!list.meta.can_see_cost;
  return (
    <ListPanel list={list} cursor={(_, n) => ({offset: n})}
      toolbar={<><SearchBox value={q} onChange={setQ} placeholder="اسم المنتج، الماركة، الموديل أو الباركود…"/><div className="table-filters"><Segmented value={mode} onChange={setMode} options={[['all', 'الكل'], ['low', 'تحت الحد']]}/></div></>}>
      {!cost && list.rows.length > 0 && <div className="info-banner"><ShieldCheck size={20}/><p>التكلفة مخفية: صلاحية inventory.cost غير ممنوحة لك.</p></div>}
      <DataTable rows={list.rows} onOpen={open} columns={[
        {label: 'المنتج', cell: r => <NameCell title={r.name} sub={[r.brand, r.model, r.storage_gb ? r.storage_gb + 'GB' : '', r.color].filter(Boolean).join(' • ') || r.category} avatar={<Package size={17}/>}/>},
        {label: 'التصنيف', cell: r => r.category || '—'},
        {label: 'الكمية', cell: r => r.is_service ? 'خدمة' : <span className={r.low ? 'warning-text' : ''}>{r.stock_quantity} قطعة</span>},
        {label: 'سعر البيع', cell: r => cash(r.selling_price), className: 'number'},
        ...(cost ? [{label: 'التكلفة', cell: (r: Row) => cash(r.cost_price), className: 'number'}] : []),
        {label: 'الحالة', cell: r => r.is_service ? <Badge tone="green">خدمة</Badge> : r.low ? <Badge tone="amber">تحت الحد</Badge> : <Badge tone="green">متوفر</Badge>},
      ]}/>
    </ListPanel>
  );
}

function Shortages({onExpired}: {onExpired: () => void}) {
  const manual = useList('shortages', 'manual', {}, onExpired);
  const low = (manual.meta.low_stock || []) as Row[];
  return <>
    <ListPanel list={manual}>
      <div className="panel-head"><div><h3>نواقص مسجلة يدوياً</h3><p>غير محلولة</p></div></div>
      <DataTable rows={manual.rows} empty="لا توجد نواقص يدوية" columns={[
        {label: 'الصنف', cell: r => <NameCell title={r.name} sub={r.category}/>},
        {label: 'الحالي', cell: r => r.current_qty ?? '—'},
        {label: 'الحد', cell: r => r.limit_qty ?? '—'},
        {label: 'الحالة', cell: r => <Badge tone="amber">{r.status || 'مفتوح'}</Badge>},
        {label: 'التاريخ', cell: r => when(r.created_at)},
      ]}/>
    </ListPanel>
    <section className="panel module-panel">
      <div className="panel-head"><div><h3>منتجات تحت حد التنبيه</h3><p>{low.length} منتج</p></div><AlertTriangle size={18}/></div>
      <DataTable rows={low} empty="كل المنتجات فوق حد التنبيه" columns={[
        {label: 'المنتج', cell: r => <NameCell title={r.name} avatar={<Package size={17}/>}/>},
        {label: 'الكمية', cell: r => <span className="warning-text">{r.stock_quantity}</span>},
        {label: 'حد التنبيه', cell: r => r.min_stock_alert},
      ]}/>
    </section>
  </>;
}

function Repairs({onExpired, open}: PageProps) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'OPEN' | 'READY' | 'ALL'>('OPEN');
  const [mine, setMine] = useState(false);
  const list = useList('repairs', 'repairs', {q, status, mine}, onExpired);
  return (
    <ListPanel list={list}
      toolbar={<><SearchBox value={q} onChange={setQ} placeholder="رقم التذكرة، الزبون، الجهاز أو IMEI…"/><div className="table-filters"><Segmented value={status} onChange={setStatus} options={[['OPEN', 'مفتوحة'], ['READY', 'جاهزة'], ['ALL', 'الكل']]}/><button className={'toggle ' + (mine ? 'on' : '')} role="switch" aria-checked={mine} aria-label="تذاكري فقط" onClick={() => setMine(!mine)}><i/></button><small>تذاكري</small></div></>}>
      <DataTable rows={list.rows} onOpen={open} columns={[
        {label: 'التذكرة', cell: r => <bdi>{r.ticket_no}</bdi>},
        {label: 'الزبون', cell: r => <NameCell title={r.customer_name} sub={r.customer_phone}/>},
        {label: 'الجهاز / العطل', cell: r => <span><b>{r.device}</b><br/><small className="muted">{r.fault}</small></span>},
        {label: 'الحالة', cell: r => <Badge tone={r.status === 'READY' || r.status === 'DELIVERED' ? 'green' : r.status === 'CANCELLED' || r.status === 'UNREPAIRABLE' ? 'red' : 'amber'}>{r.status_label || r.status}</Badge>},
        {label: 'الفني', cell: r => r.technician_name || '—'},
        {label: 'الكلفة', cell: r => cash(Number(r.cost || 0) + Number(r.labour || 0)), className: 'number'},
        {label: 'الموعد', cell: r => (r.promised_at ? when(r.promised_at) : '—')},
      ]}/>
    </ListPanel>
  );
}

function Returns({onExpired, open}: PageProps) {
  const [q, setQ] = useState('');
  const list = useList('returns', 'returns', {q}, onExpired);
  return (
    <ListPanel list={list} toolbar={<SearchBox value={q} onChange={setQ} placeholder="رقم المرتجع أو الفاتورة أو الزبون…"/>}>
      <DataTable rows={list.rows} onOpen={open} columns={[
        {label: 'المرتجع', cell: r => <bdi>{r.return_number}</bdi>},
        {label: 'الفاتورة', cell: r => <bdi>{r.invoice_number || '—'}</bdi>},
        {label: 'الزبون', cell: r => <NameCell title={r.customer_name || '—'} sub={r.reason}/>},
        {label: 'المبلغ', cell: r => cash(r.total_amount), className: 'number'},
        {label: 'الإرجاع', cell: r => paymentLabel(r.refund_method)},
        {label: 'التاريخ', cell: r => when(r.created_at)},
      ]}/>
    </ListPanel>
  );
}

function Expenses({onExpired, open, canCreate, onNew}: PageProps & {canCreate: boolean; onNew: () => void}) {
  const list = useList('expenses', 'expenses', {}, onExpired);
  return <>
    {canCreate && <div className="action-bar"><button className="button primary" onClick={onNew}><Plus size={17}/>مصروف جديد</button></div>}
    {list.meta.ok && !list.meta.can_see_payroll && <div className="info-banner"><ShieldCheck size={20}/><p>سندات الرواتب مخفية: صلاحية expenses.payroll_view غير ممنوحة لك.</p></div>}
    <ListPanel list={list} cursor={last => ({before: last.created_at})}>
      <DataTable rows={list.rows} onOpen={open} columns={[
        {label: 'الوصف', cell: r => <NameCell title={r.description} sub={r.category}/>},
        {label: 'المبلغ', cell: r => cash(r.amount), className: 'number'},
        {label: 'بواسطة', cell: r => r.actor || '—'},
        {label: 'التاريخ', cell: r => when(r.created_at)},
        {label: 'الحالة', cell: r => r.reversed ? <Badge tone="red">معكوس</Badge> : r.is_reversal ? <Badge tone="amber">قيد عكسي</Badge> : <Badge tone="green">مسجل</Badge>},
      ]}/>
    </ListPanel>
  </>;
}

function Shipping({onExpired, open}: PageProps) {
  const list = useList('shipping', 'orders', {}, onExpired);
  return (
    <ListPanel list={list}>
      <DataTable rows={list.rows} onOpen={open} empty="لا توجد شحنات بعد" columns={[
        {label: 'الطلب', cell: r => <bdi>{r.provider_order_id || '—'}</bdi>},
        {label: 'المستلم', cell: r => <NameCell title={r.recipient} sub={r.phone}/>},
        {label: 'العنوان', cell: r => [r.governorate, r.city].filter(Boolean).join(' • ') || '—'},
        {label: 'مبلغ الاستلام', cell: r => cash(r.cod_amount), className: 'number'},
        {label: 'الحالة', cell: r => <Badge tone={/deliver/i.test(r.status) ? 'green' : /return|cancel/i.test(r.status) ? 'red' : 'amber'}>{r.provider_status_text || r.status}</Badge>},
        {label: 'التاريخ', cell: r => when(r.created_at)},
      ]}/>
    </ListPanel>
  );
}

function Employees({onExpired, open}: PageProps) {
  const list = useList('employees', 'employees', {}, onExpired);
  return (
    <ListPanel list={list}>
      <DataTable rows={list.rows} onOpen={open} columns={[
        {label: 'الموظف', cell: r => <NameCell title={r.display_name || r.name} sub={r.department} avatar={<UserCog size={17}/>}/>},
        {label: 'الدور', cell: r => roleLabel[r.role] || r.role},
        {label: 'رمز PIN', cell: r => r.has_pin ? <Badge tone="green">مضبوط</Badge> : <Badge tone="red">بدون رمز</Badge>},
        {label: 'الصلاحيات', cell: r => r.custom_permissions ? 'مخصصة' : 'حسب الدور'},
        {label: 'آخر ظهور', cell: r => when(r.last_seen_at)},
        {label: 'الحالة', cell: r => <Badge tone={r.status === 'active' ? 'green' : 'red'}>{r.status === 'active' ? 'نشط' : 'موقوف'}</Badge>},
      ]}/>
    </ListPanel>
  );
}

function Sessions({onExpired}: {onExpired: () => void}) {
  const list = useList('sessions', 'sessions', {}, onExpired);
  return (
    <ListPanel list={list}>
      <DataTable rows={list.rows} columns={[
        {label: 'الموظف', cell: r => <NameCell title={r.employee_name || '—'} sub={roleLabel[r.role] || r.role}/>},
        {label: 'الجهاز', cell: r => <span>{r.kind === 'web' ? 'ويب' : 'برنامج المكتب'}<br/><small className="muted">{r.device_name || r.os || '—'}</small></span>},
        {label: 'IP', cell: r => <bdi dir="ltr">{r.ip || '—'}</bdi>},
        {label: 'بدأت', cell: r => when(r.opened_at)},
        {label: 'آخر نشاط', cell: r => when(r.last_seen_at)},
        {label: 'الحالة', cell: r => r.is_current ? <Badge tone="green">جلستك</Badge> : r.closed_at ? <Badge tone="red">مغلقة</Badge> : <Badge tone="amber">نشطة</Badge>},
      ]}/>
    </ListPanel>
  );
}
