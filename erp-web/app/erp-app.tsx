'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle, AlertTriangle, ArrowLeft, Bell, Boxes, Check, ChevronLeft, Gem, KeyRound, LayoutDashboard, Loader2,
  Lock, LogOut, Menu, Monitor, Moon, Package, Receipt, RefreshCw, RotateCcw, Search, Settings, ShieldCheck,
  Store, Sun, Truck, UserCog, Users, Wallet, Wrench, X,
} from 'lucide-react';
import {PushSettings} from './push-settings';
import {Welcome, fontOptions} from './welcome';
import {
  Employee, Row, SectionKey, can, dateOnly, dayOf, money, paymentLabel, permissionGroups, roleLabel,
  sections, today, when,
} from './data';

const icons: Record<SectionKey, any> = {
  dashboard: LayoutDashboard, invoices: Receipt, customers: Wallet, products: Package, shortages: Boxes,
  repairs: Wrench, returns: RotateCcw, expenses: Receipt, shipping: Truck, employees: Users, sessions: Monitor, settings: Settings,
};
const groupLabel = {work: 'مساحة العمل', ops: 'العمليات', admin: 'الإدارة'};
const PREFS = 'yaqoot-prefs-v2';

const cash = (n: unknown) => <><bdi>{money(n)}</bdi> <small>د.ع</small></>;
function Badge({tone, children}: {tone: 'green' | 'red' | 'amber'; children: React.ReactNode}) {
  return <span className={'badge ' + tone}><i/>{children}</span>;
}

export class SessionExpired extends Error {}

async function api(resource: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<any> {
  const qs = new URLSearchParams({r: resource});
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) qs.set(k, String(v === true ? 1 : v));
  const res = await fetch('/api/erp?' + qs, {credentials: 'same-origin', cache: 'no-store'});
  const data: any = await res.json().catch(() => ({ok: false, reason: 'server_error'}));
  if (res.status === 401) throw new SessionExpired();
  if (!res.ok || !data.ok) {
    throw new Error(data.reason === 'forbidden' ? 'ليست لديك صلاحية لهذا القسم.' : data.message || 'تعذر تحميل البيانات.');
  }
  return data;
}

type Column = {label: string; cell: (r: Row) => React.ReactNode; className?: string};

function DataTable({rows, columns, onOpen, empty = 'لا توجد سجلات'}: {rows: Row[]; columns: Column[]; onOpen?: (r: Row) => void; empty?: string}) {
  return (
    <div className="table-scroll">
      <table>
        <thead><tr>{columns.map(c => <th key={c.label}>{c.label}</th>)}{onOpen && <th/>}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {columns.map(c => <td key={c.label} className={c.className}>{c.cell(r)}</td>)}
              {onOpen && <td><button className="small-btn" onClick={() => onOpen(r)}>التفاصيل</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="empty"><Search size={30}/><h3>{empty}</h3></div>}
    </div>
  );
}

function NameCell({title, sub, avatar}: {title: string; sub?: string | null; avatar?: React.ReactNode}) {
  return (
    <div className="row-name">
      <span className="row-avatar">{avatar ?? (title || '؟').slice(0, 1)}</span>
      <span><strong>{title || '—'}</strong>{sub ? <small>{sub}</small> : null}</span>
    </div>
  );
}

/** تحميل قائمة من الخادم مع بحث مؤجل وتحميل المزيد. */
function useList(resource: string, key: string, params: Record<string, any>, onExpired: () => void, enabled = true) {
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const paramsKey = JSON.stringify(params);
  const seq = useRef(0);

  const load = useCallback(async (append = false, cursor?: Record<string, any>) => {
    if (!enabled) return;
    const n = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const data = await api(resource, {...JSON.parse(paramsKey), limit: 50, ...(cursor || {})});
      if (n !== seq.current) return;
      const list: Row[] = data[key] || [];
      setRows(prev => (append ? [...prev, ...list] : list));
      setMeta(data);
      setMore(list.length === 50);
    } catch (e) {
      if (e instanceof SessionExpired) { onExpired(); return; }
      if (n === seq.current) setError((e as Error).message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [resource, key, paramsKey, onExpired, enabled]);

  useEffect(() => {
    const t = setTimeout(() => load(false), 250);
    return () => clearTimeout(t);
  }, [load]);

  return {rows, meta, loading, error, more, load};
}

function ListPanel({list, toolbar, children, cursor}: {
  list: ReturnType<typeof useList>;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  cursor?: (last: Row, count: number) => Record<string, any>;
}) {
  return (
    <section className="panel module-panel">
      {toolbar && <div className="table-toolbar">{toolbar}</div>}
      {list.error ? <div className="form-error" role="alert"><AlertCircle size={16}/>{list.error}</div> : children}
      <div className="table-footer">
        <span>{list.loading ? <><Loader2 size={14} className="spin"/> جارٍ التحميل…</> : `عرض ${list.rows.length} سجل`}</span>
        <span>
          {list.more && cursor && !list.loading && (
            <button className="text-button" onClick={() => list.load(true, cursor(list.rows[list.rows.length - 1], list.rows.length))}>تحميل المزيد</button>
          )}
          <button className="icon-button" aria-label="تحديث" onClick={() => list.load(false)}><RefreshCw size={15} className={list.loading ? 'spin' : ''}/></button>
        </span>
      </div>
    </section>
  );
}

function SearchBox({value, onChange, placeholder}: {value: string; onChange: (v: string) => void; placeholder: string}) {
  return (
    <div className="search-field">
      <Search size={18}/>
      <input aria-label="بحث" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} maxLength={100}/>
      {value && <button className="icon-button" onClick={() => onChange('')} aria-label="مسح البحث"><X size={14}/></button>}
    </div>
  );
}

function Segmented<T extends string>({value, options, onChange}: {value: T; options: [T, string][]; onChange: (v: T) => void}) {
  return (
    <div className="segmented">
      {options.map(([k, l]) => <button key={k} className={value === k ? 'selected' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

// ======================================================================
export default function ErpApp({storeName, employee, permissions, onLock, onSignOut}: {
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
  const prefsReady = useRef(false);

  const expired = useCallback(() => onLock('انتهت الجلسة. أدخل رمزك من جديد.'), [onLock]);

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
                      <I size={19}/><span>{s.title}</span>{page === s.key && <span className="active-dot"/>}
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
          {page === 'dashboard' && <Dashboard permissions={permissions} onExpired={expired} nav={nav} open={open}/>}
          {page === 'invoices' && <Invoices onExpired={expired} open={open('فاتورة')}/>}
          {page === 'customers' && <Customers onExpired={expired} open={open('زبون')}/>}
          {page === 'products' && <Products onExpired={expired} open={open('منتج')}/>}
          {page === 'shortages' && <Shortages onExpired={expired}/>}
          {page === 'repairs' && <Repairs onExpired={expired} open={open('تذكرة صيانة')}/>}
          {page === 'returns' && <Returns onExpired={expired} open={open('مرتجع')}/>}
          {page === 'expenses' && <Expenses onExpired={expired} open={open('مصروف')}/>}
          {page === 'shipping' && <Shipping onExpired={expired} open={open('شحنة')}/>}
          {page === 'employees' && <Employees onExpired={expired} open={open('موظف')}/>}
          {page === 'sessions' && <Sessions onExpired={expired}/>}
          {page === 'settings' && (
            <div className="settings-grid">
              <PushSettings permissions={permissions}/>
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
      {detail && <DetailModal title={detail.title} row={detail.row} onClose={() => setDetail(null)}/>}
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

function Dashboard({permissions, onExpired, nav, open}: {permissions: string[]; onExpired: () => void; nav: (k: SectionKey) => void; open: (t: string) => (r: Row) => void}) {
  const [stats, setStats] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const permKey = permissions.join(',');
  const has = useCallback((p: string) => permKey.split(',').includes(p), [permKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const s: Record<string, any> = {};
    try {
      const tasks: Promise<void>[] = [];
      if (has('pos')) tasks.push((async () => {
        // نقلب صفحات الفواتير حتى نتجاوز بداية اليوم لحساب مبيعات اليوم بدقة.
        const t = today();
        let all: Row[] = [], before: string | undefined;
        for (let i = 0; i < 5; i++) {
          const d = await api('invoices', {limit: 100, before});
          const list: Row[] = d.invoices || [];
          all = all.concat(list);
          if (list.length < 100 || dayOf(list[list.length - 1].created_at) < t) break;
          before = list[list.length - 1].created_at;
        }
        const todays = all.filter(r => dayOf(r.created_at) === t);
        s.latest = all.slice(0, 6);
        s.todayTotal = todays.reduce((a, r) => a + Number(r.total_amount || 0), 0);
        s.todayCount = todays.length;
        s.todayDebt = todays.reduce((a, r) => a + Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0)), 0);
      })());
      if (has('customers')) tasks.push(api('customers', {debtors_only: true, limit: 100}).then(d => {
        const list: Row[] = d.customers || [];
        s.debtTotal = list.reduce((a, r) => a + Number(r.balance || 0), 0);
        s.debtors = list.length;
        s.topDebtors = list.slice(0, 3);
      }));
      if (has('inventory')) tasks.push(api('products', {low_only: true, limit: 100}).then(d => {
        s.low = d.products || [];
      }));
      if (has('repairs')) tasks.push(api('repairs', {status: 'OPEN', limit: 100}).then(d => {
        const list: Row[] = d.repairs || [];
        s.openRepairs = list.length;
        s.readyRepairs = list.filter(r => r.status === 'READY').length;
      }));
      await Promise.all(tasks);
      setStats(s);
    } catch (e) {
      if (e instanceof SessionExpired) { onExpired(); return; }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [has, onExpired]);

  useEffect(() => { load(); }, [load]);

  const tiles = [
    has('pos') && {label: 'مبيعات اليوم', value: stats.todayTotal, hint: `${stats.todayCount ?? 0} فاتورة • منها آجل ${money(stats.todayDebt)}`, key: 'invoices' as SectionKey, icon: Receipt, color: 'teal'},
    has('customers') && {label: 'ديون الزبائن', value: stats.debtTotal, hint: `${stats.debtors ?? 0} زبون عليهم رصيد`, key: 'customers' as SectionKey, icon: Wallet, color: 'gold'},
    has('inventory') && {label: 'منتجات تحت الحد', value: null, count: stats.low?.length ?? 0, hint: 'تحتاج إعادة طلب', key: (has('shortages') ? 'shortages' : 'products') as SectionKey, icon: Package, color: 'blue'},
    has('repairs') && {label: 'صيانة مفتوحة', value: null, count: stats.openRepairs ?? 0, hint: `${stats.readyRepairs ?? 0} جاهزة للتسليم`, key: 'repairs' as SectionKey, icon: Wrench, color: 'purple'},
  ].filter(Boolean) as any[];

  return <>
    <div className="overview-tools">
      <div className="overview-label"><span className="status-led"/>نظرة على أداء المحل <span className="muted">• {dateOnly(new Date().toISOString())}</span></div>
      <button className="button secondary" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/>تحديث</button>
    </div>
    {error && <div className="form-error" role="alert"><AlertCircle size={16}/>{error}</div>}
    {tiles.length > 0 && (
      <div className="kpis">
        {tiles.map(t => (
          <button className="kpi" key={t.key + t.label} onClick={() => nav(t.key)}>
            <div className="kpi-top"><span>{t.label}</span><span className={'iconbox ' + t.color}><t.icon size={19}/></span></div>
            <div className="kpi-value">{loading ? <Loader2 size={22} className="spin"/> : t.value === null ? <bdi>{money(t.count)}</bdi> : cash(t.value)}</div>
            <div className="kpi-bottom"><span className={t.color}><i className="mini-dot"/>{t.hint}</span></div>
          </button>
        ))}
      </div>
    )}
    <div className="dashboard-grid lower">
      {has('pos') && (
        <section className="panel">
          <div className="panel-head"><div><h3>آخر الفواتير</h3><p>أحدث عمليات البيع من برنامج المكتب</p></div><button className="text-button" onClick={() => nav('invoices')}>عرض الكل <ArrowLeft size={15}/></button></div>
          <DataTable rows={stats.latest || []} onOpen={open('فاتورة')} columns={[
            {label: 'الفاتورة', cell: r => <bdi>{r.invoice_number}</bdi>},
            {label: 'الزبون', cell: r => <NameCell title={r.customer_name || 'زبون نقدي'} sub={r.actor}/>},
            {label: 'الوقت', cell: r => when(r.created_at)},
            {label: 'المبلغ', cell: r => cash(r.total_amount), className: 'number'},
            {label: 'الدفع', cell: r => <Badge tone={Number(r.total_amount) > Number(r.paid_amount) ? 'amber' : 'green'}>{paymentLabel(r.payment_type)}</Badge>},
          ]}/>
        </section>
      )}
      <section className="panel attention">
        <div className="panel-head"><div><h3>تحتاج انتباهك</h3><p>متابعات من بيانات المحل الآن</p></div><Bell size={18}/></div>
        {(stats.low || []).slice(0, 3).map((r: Row) => (
          <button className="attention-item" key={r.id} onClick={() => nav(has('shortages') ? 'shortages' : 'products')}>
            <span className="attention-icon amber-bg"><Package size={18}/></span><span><b>مخزون منخفض</b><small>{r.name} • {r.stock_quantity} متبقية</small></span><ChevronLeft size={15}/>
          </button>
        ))}
        {(stats.topDebtors || []).map((r: Row) => (
          <button className="attention-item" key={r.id} onClick={() => nav('customers')}>
            <span className="attention-icon red-bg"><Wallet size={18}/></span><span><b>{r.name}</b><small>عليه {money(r.balance)} د.ع</small></span><ChevronLeft size={15}/>
          </button>
        ))}
        {stats.readyRepairs > 0 && (
          <button className="attention-item" onClick={() => nav('repairs')}>
            <span className="attention-icon blue-bg"><Wrench size={18}/></span><span><b>صيانة جاهزة</b><small>{stats.readyRepairs} أجهزة بانتظار التسليم</small></span><ChevronLeft size={15}/>
          </button>
        )}
        {!loading && !stats.low?.length && !stats.topDebtors?.length && !stats.readyRepairs && <div className="empty"><Check size={26}/><h3>لا شيء عاجل الآن</h3></div>}
      </section>
    </div>
  </>;
}

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

function Customers({onExpired, open}: PageProps) {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'debt' | 'all'>('debt');
  const list = useList('customers', 'customers', {q, debtors_only: mode === 'debt'}, onExpired);
  const total = list.rows.reduce((a, r) => a + Math.max(0, Number(r.balance || 0)), 0);
  return <>
    <div className="module-summary"><div><small>مجموع الأرصدة المعروضة</small><b>{cash(total)}</b></div><div><small>عدد الزبائن المعروضين</small><b>{list.rows.length}</b></div></div>
    <ListPanel list={list} cursor={(_, n) => ({offset: n})}
      toolbar={<><SearchBox value={q} onChange={setQ} placeholder="اسم الزبون أو رقم الهاتف…"/><div className="table-filters"><Segmented value={mode} onChange={setMode} options={[['debt', 'عليهم ديون'], ['all', 'كل الزبائن']]}/></div></>}>
      <DataTable rows={list.rows} onOpen={open} columns={[
        {label: 'الزبون', cell: r => <NameCell title={r.name} sub={r.address}/>},
        {label: 'الهاتف', cell: r => <bdi dir="ltr">{r.phone || '—'}</bdi>},
        {label: 'الرصيد', cell: r => Number(r.balance) > 0 ? <span className="warning-text">{cash(r.balance)}</span> : cash(r.balance), className: 'number'},
        {label: 'حد الدين', cell: r => (r.credit_limit ? cash(r.credit_limit) : '—'), className: 'number'},
        {label: 'آخر تحديث', cell: r => when(r.updated_at)},
      ]}/>
    </ListPanel>
  </>;
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

function Expenses({onExpired, open}: PageProps) {
  const list = useList('expenses', 'expenses', {}, onExpired);
  return <>
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
