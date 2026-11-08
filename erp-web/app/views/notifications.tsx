'use client';
import {useCallback, useEffect, useState} from 'react';
import {
  Activity, Bell, BellRing, Wifi, CalendarDays, CheckCheck, HandCoins, Megaphone, Moon, Package, Receipt, Send, Settings2, Smartphone, Users, Wallet, Wrench,
} from 'lucide-react';
import {Row, money, roleLabel, when} from '../data';
import {Badge, Field, FormError, Loader2, Modal, MoneyInput, Segmented, SessionExpired, SubmitRow, act, api, useToast} from '../ui';

export const kindMeta: Record<string, {label: string; icon: any; tone: string; hint: string; perms: string[]}> = {
  activity: {label: 'كل حركات المحل', icon: Activity, tone: 'teal', hint: 'للمدير العام: كل عملية من أي جهاز — دخول، مرتجع، مصروف، خزنة، أسعار، مخزون، موظفون، مشتريات…', perms: ['__admin']},
  invoice: {label: 'فاتورة جديدة', icon: Receipt, tone: 'teal', hint: 'كل فاتورة بيع • أكثر من 3 بالدقيقة تُجمع', perms: ['pos']},
  debt_added: {label: 'دين جديد', icon: Wallet, tone: 'gold', hint: 'عند إضافة دين على زبون', perms: ['customers']},
  debt_paid: {label: 'تسديد دين', icon: HandCoins, tone: 'green', hint: 'عند قبض دفعة أو مسامحة', perms: ['customers']},
  shortage: {label: 'النواقص', icon: Package, tone: 'amber', hint: 'نقص يدوي أو منتج تحت حد التنبيه', perms: ['shortages', 'inventory']},
  isp_expiring: {label: 'اشتراكات الإنترنت', icon: Wifi, tone: 'blue', hint: 'قبل انتهاء الاشتراك بـ3 أيام وعند انتهائه', perms: ['customers']},
  repair_ready: {label: 'صيانة جاهزة', icon: Wrench, tone: 'blue', hint: 'عندما تصبح التذكرة «جاهز للاستلام»', perms: ['repairs']},
  report_daily: {label: 'التقرير اليومي', icon: CalendarDays, tone: 'purple', hint: 'كل يوم 11:00 مساءً', perms: ['dashboard']},
  report_weekly: {label: 'التقرير الأسبوعي', icon: CalendarDays, tone: 'purple', hint: 'الجمعة 11:00 مساءً (السبت ← الجمعة)', perms: ['dashboard']},
  report_monthly: {label: 'التقرير الشهري', icon: CalendarDays, tone: 'purple', hint: 'يوم 1 الساعة 9:00 صباحاً', perms: ['dashboard']},
  report_bimonthly: {label: 'تقرير الشهرين', icon: CalendarDays, tone: 'purple', hint: 'يوم 1 من الأشهر الفردية 9:00 صباحاً', perms: ['dashboard']},
  report_yearly: {label: 'التقرير السنوي', icon: CalendarDays, tone: 'purple', hint: '1 كانون الثاني 9:00 صباحاً', perms: ['dashboard']},
  custom: {label: 'رسالة من الإدارة', icon: Megaphone, tone: 'red', hint: '', perms: []},
};
export const autoKinds = Object.keys(kindMeta).filter(k => k !== 'custom');

export type Prefs = Record<string, boolean | number | string>;

/** مفاتيح تفضيلات قابلة لإعادة الاستخدام: للموظف نفسه أو للمدير على موظف آخر. */
export function PrefsEditor({prefs, permissions, onChange, busyKey}: {prefs: Prefs; permissions: string[]; onChange: (patch: Prefs) => void; busyKey?: string}) {
  const visible = autoKinds.filter(k => kindMeta[k].perms.some(p => permissions.includes(p)));
  const [min, setMin] = useState(String(prefs.invoice_min ?? 0));
  useEffect(() => setMin(String(prefs.invoice_min ?? 0)), [prefs.invoice_min]);
  return (
    <div className="prefs-editor">
      {visible.map(k => {
        const m = kindMeta[k]; const I = m.icon; const on = prefs[k] !== false;
        return (
          <div className="settings-row" key={k}>
            <span className={'auto-icon tone-' + m.tone}><I size={17}/></span>
            <div><b>{m.label}</b><p>{m.hint}</p></div>
            <button className={'toggle ' + (on ? 'on' : '')} role="switch" aria-checked={on} aria-label={m.label} disabled={busyKey === k} onClick={() => onChange({[k]: !on})}><i/></button>
          </div>
        );
      })}
      {visible.includes('invoice') && prefs.invoice !== false && (
        <div className="settings-row sub-row">
          <span className="auto-icon"><Receipt size={17}/></span>
          <div><b>أقل مبلغ لإشعار الفاتورة</b><p>تجاهل الفواتير الأصغر من هذا المبلغ (0 = كل الفواتير)</p></div>
          <div className="inline-money">
            <MoneyInput value={min} onChange={setMin}/>
            {Number(min) !== Number(prefs.invoice_min || 0) && <button className="small-btn" onClick={() => onChange({invoice_min: Number(min || 0)})}>حفظ</button>}
          </div>
        </div>
      )}
      <div className="settings-row">
        <span className="auto-icon"><Moon size={17}/></span>
        <div><b>ساعات الهدوء</b><p>لا يرنّ الجهاز خلالها؛ الإشعار يُحفظ في الصندوق</p></div>
        <button className={'toggle ' + (prefs.quiet ? 'on' : '')} role="switch" aria-checked={!!prefs.quiet} aria-label="ساعات الهدوء" disabled={busyKey === 'quiet'} onClick={() => onChange({quiet: !prefs.quiet})}><i/></button>
      </div>
      {!!prefs.quiet && (
        <div className="settings-row sub-row quiet-times">
          <label>من<input type="time" value={String(prefs.quiet_from || '23:30')} onChange={e => onChange({quiet_from: e.target.value})}/></label>
          <label>إلى<input type="time" value={String(prefs.quiet_to || '08:00')} onChange={e => onChange({quiet_to: e.target.value})}/></label>
          <small className="muted">بتوقيت بغداد</small>
        </div>
      )}
    </div>
  );
}

// ======================================================================
export default function NotificationCenter({permissions, onExpired, onUnread}: {permissions: string[]; onExpired: () => void; onUnread: (n: number) => void}) {
  const isAdmin = permissions.includes('employees.permissions');
  const [tab, setTab] = useState<'inbox' | 'admin'>('inbox');
  return <>
    {isAdmin && <div className="tabs page-tabs"><button className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}><Bell size={15}/>صندوقي</button><button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}><Settings2 size={15}/>إدارة إشعارات المحل</button></div>}
    {tab === 'inbox' ? <Inbox onExpired={onExpired} onUnread={onUnread}/> : <Admin onExpired={onExpired}/>}
  </>;
}

function Inbox({onExpired, onUnread}: {onExpired: () => void; onUnread: (n: number) => void}) {
  const toast = useToast();
  const [kind, setKind] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (before?: number) => {
    setLoading(true); setError('');
    try {
      const d = await api('inbox', {kind: kind === 'all' ? undefined : kind, unread_only: unreadOnly, before, limit: 40});
      setItems(prev => (before ? [...prev, ...d.items] : d.items));
      setUnread(d.unread); onUnread(d.unread); setMore(d.items.length === 40);
    } catch (e) {
      if (e instanceof SessionExpired) { onExpired(); return; }
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, [kind, unreadOnly, onExpired, onUnread]);
  useEffect(() => { load(); }, [load]);

  async function mark(payload: {all?: boolean; ids?: number[]}) {
    try {
      const d = await act('notify_mark', payload);
      setUnread(d.unread); onUnread(d.unread);
      setItems(prev => prev.map(i => (payload.all || payload.ids?.includes(i.id) ? {...i, read: true} : i)));
    } catch (e) { if (e instanceof SessionExpired) onExpired(); else toast((e as Error).message, 'err'); }
  }

  function open(n: Row) {
    if (!n.read) mark({ids: [n.id]});
    if (n.url && /^\/#[a-z]+$/.test(n.url)) location.hash = n.url.slice(2);
  }

  return (
    <section className="panel module-panel">
      <div className="table-toolbar">
        <Segmented value={kind} onChange={setKind} options={[['all', 'الكل'], ['activity', 'الحركات'], ['invoice', 'الفواتير'], ['debt', 'الديون'], ['shortage', 'النواقص'], ['repair_ready', 'الصيانة'], ['isp_expiring', 'الإنترنت'], ['report', 'التقارير'], ['custom', 'الإدارة']]}/>
        <div className="table-filters">
          <label className="check"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)}/>غير المقروءة فقط</label>
          <button className="button secondary" disabled={!unread} onClick={() => mark({all: true})}><CheckCheck size={16}/>تعليم الكل كمقروء ({unread})</button>
        </div>
      </div>
      {error && <FormError error={error}/>}
      <ul className="inbox">
        {items.map(n => {
          const m = kindMeta[n.kind] || kindMeta.custom; const I = m.icon;
          return (
            <li key={n.id} className={n.read ? 'read' : 'unread'}>
              <button onClick={() => open(n)}>
                <span className={'auto-icon tone-' + m.tone}><I size={17}/></span>
                <span className="inbox-text"><b>{n.title}</b><span>{n.body}</span><small>{m.label} • {when(n.created_at)}</small></span>
                {!n.read && <i className="unread-dot" aria-label="غير مقروء"/>}
              </button>
            </li>
          );
        })}
        {!loading && !items.length && <li className="empty"><BellRing size={28}/><h3>لا توجد إشعارات</h3><p>ستظهر هنا الفواتير والديون والنواقص والتقارير حسب صلاحياتك.</p></li>}
      </ul>
      <div className="table-footer">
        <span>{loading ? <><Loader2 size={14} className="spin"/> جارٍ التحميل…</> : `${items.length} إشعار`}</span>
        {more && !loading && <button className="text-button" onClick={() => load(items[items.length - 1].id)}>تحميل الأقدم</button>}
      </div>
    </section>
  );
}

// ======================================================================
function Admin({onExpired}: {onExpired: () => void}) {
  const toast = useToast();
  const [data, setData] = useState<{employees: Row[]; stats: Record<string, number>; recent: Row[]} | null>(null);
  const [edit, setEdit] = useState<Row | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api('notify_admin')); }
    catch (e) { if (e instanceof SessionExpired) onExpired(); else setError((e as Error).message); }
  }, [onExpired]);
  useEffect(() => { load(); }, [load]);

  const total = Object.values(data?.stats || {}).reduce((a, b) => a + Number(b), 0);
  const withDevices = data?.employees.filter(e => e.devices > 0).length || 0;

  return <>
    {error && <FormError error={error}/>}
    <div className="kpis kpis-3">
      <div className="kpi static"><div className="kpi-top"><span>إشعارات آخر 7 أيام</span><span className="iconbox teal"><BellRing size={19}/></span></div><div className="kpi-value"><bdi>{money(total)}</bdi></div><div className="kpi-bottom"><span>لكل الموظفين</span></div></div>
      <div className="kpi static"><div className="kpi-top"><span>موظفون بأجهزة مفعّلة</span><span className="iconbox blue"><Smartphone size={19}/></span></div><div className="kpi-value"><bdi>{withDevices}</bdi> <small>من {data?.employees.length ?? 0}</small></div><div className="kpi-bottom"><span>يستلمون Push على الهاتف</span></div></div>
      <button className="kpi" onClick={() => setBroadcast(true)}><div className="kpi-top"><span>إشعار مخصص</span><span className="iconbox red"><Megaphone size={19}/></span></div><div className="kpi-value small-value">أرسل رسالة الآن</div><div className="kpi-bottom"><span>للكل أو لموظفين محددين</span></div></button>
    </div>

    <section className="panel module-panel">
      <div className="panel-head"><div><h3>الموظفون والإشعارات</h3><p>من يستلم ماذا، وعلى أي جهاز. اضغط «تخصيص» لتعديل إشعارات أي موظف.</p></div><Users size={18}/></div>
      <div className="table-scroll"><table>
        <thead><tr><th>الموظف</th><th>الأجهزة</th><th>الأنواع المفعّلة</th><th>الهدوء</th><th>غير مقروءة</th><th>آخر إشعار</th><th/></tr></thead>
        <tbody>
          {(data?.employees || []).map(e => {
            const eperms = e.role === 'ADMIN' ? [...e.permissions, '__admin'] : e.permissions;
            const enabled = autoKinds.filter(k => kindMeta[k].perms.some(p => eperms.includes(p)));
            const on = enabled.filter(k => e.prefs[k] !== false).length;
            return (
              <tr key={e.id}>
                <td><div className="row-name"><span className="row-avatar">{e.name.slice(0, 1)}</span><span><strong>{e.name}</strong><small>{roleLabel[e.role] || e.role}</small></span></div></td>
                <td>{e.devices ? <Badge tone="green">{e.device_names.join('، ')}</Badge> : <Badge tone="amber">لا يوجد</Badge>}</td>
                <td>{on} من {enabled.length}{Number(e.prefs.invoice_min) > 0 ? <small className="muted"> • فواتير ≥ {money(e.prefs.invoice_min)}</small> : null}</td>
                <td>{e.prefs.quiet ? <small><bdi>{e.prefs.quiet_from}–{e.prefs.quiet_to}</bdi></small> : '—'}</td>
                <td>{e.unread || '—'}</td>
                <td>{when(e.last_at)}</td>
                <td><button className="small-btn" onClick={() => setEdit(e)}>تخصيص</button></td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </section>

    <section className="panel module-panel">
      <div className="panel-head"><div><h3>سجل الإشعارات (7 أيام)</h3><p>كل إشعار أُرسل وعدد مستلميه</p></div></div>
      <ul className="inbox compact">
        {(data?.recent || []).map((n, i) => {
          const m = kindMeta[n.kind] || kindMeta.custom; const I = m.icon;
          return <li key={i} className="read"><div className="inbox-row"><span className={'auto-icon tone-' + m.tone}><I size={16}/></span><span className="inbox-text"><b>{n.title}</b><span>{n.body}</span><small>{when(n.created_at)} • {n.recipients} مستلم</small></span></div></li>;
        })}
        {data && !data.recent.length && <li className="empty"><p>لم تُرسل إشعارات خلال 7 أيام.</p></li>}
      </ul>
    </section>

    {edit && <EmployeePrefs employee={edit} onClose={() => setEdit(null)} onExpired={onExpired} onSaved={load}/>}
    {broadcast && data && <Broadcast employees={data.employees} onClose={() => setBroadcast(false)} onExpired={onExpired} onSent={() => { load(); toast('أُرسل الإشعار'); }}/>}
  </>;
}

function EmployeePrefs({employee, onClose, onExpired, onSaved}: {employee: Row; onClose: () => void; onExpired: () => void; onSaved: () => void}) {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs>(employee.prefs);
  const [busy, setBusy] = useState('');
  async function change(patch: Prefs) {
    const key = Object.keys(patch)[0];
    setBusy(key); setPrefs(p => ({...p, ...patch}));
    try {
      const d = await act('notify_admin_set', {employee_id: employee.id, prefs: patch});
      setPrefs(d.prefs); onSaved();
    } catch (e) {
      if (e instanceof SessionExpired) { onExpired(); return; }
      setPrefs(employee.prefs); toast((e as Error).message, 'err');
    } finally { setBusy(''); }
  }
  return (
    <Modal title={'إشعارات ' + employee.name} eyebrow={roleLabel[employee.role] || employee.role} onClose={onClose}>
      <p className="muted">تظهر فقط الأنواع التي تسمح بها صلاحيات الموظف. التعديل يُحفظ فوراً ويُسجَّل في سجل الأمان.</p>
      <PrefsEditor prefs={prefs} permissions={employee.role === 'ADMIN' ? [...employee.permissions, '__admin'] : employee.permissions} onChange={change} busyKey={busy}/>
      <div className="modal-actions"><button className="button secondary" onClick={onClose}>تم</button></div>
    </Modal>
  );
}

function Broadcast({employees, onClose, onExpired, onSent}: {employees: Row[]; onClose: () => void; onExpired: () => void; onSent: () => void}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{recipients: number; pushed: number; devices: number} | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!all && !picked.length) { setError('اختر موظفاً واحداً على الأقل'); return; }
    setBusy(true); setError('');
    try {
      const r = await act('notify_broadcast', {title: title.trim(), body: body.trim(), urgent, employee_ids: all ? [] : picked});
      setResult(r); onSent();
    } catch (err) {
      if (err instanceof SessionExpired) { onExpired(); return; }
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Modal title="إشعار مخصص" eyebrow="مركز الإشعارات" onClose={onClose}>
      {result ? (
        <div className="form-stack">
          <div className="info-banner"><Send size={20}/><div><b>وصل إلى {result.recipients} موظف</b><p>قبلت خدمة الدفع {result.pushed} من {result.devices} جهاز. الباقون يجدونه في صندوق الإشعارات.</p></div></div>
          <div className="modal-actions"><button className="button primary" onClick={onClose}>تم</button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack">
          <Field label="العنوان"><input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} required autoFocus placeholder="مثلاً: جرد آخر الشهر"/></Field>
          <Field label="النص" hint={`${body.length}/300 • يُضاف اسمك في آخره`}><textarea value={body} onChange={e => setBody(e.target.value)} maxLength={300} rows={3} required/></Field>
          <div className="field"><span>المستلمون</span>
            <Segmented value={all ? 'all' : 'some'} onChange={v => setAll(v === 'all')} options={[['all', 'كل الموظفين'], ['some', 'موظفون محددون']]}/>
            {!all && <div className="pick-grid">{employees.map(e => (
              <label key={e.id} className="check"><input type="checkbox" checked={picked.includes(e.id)} onChange={ev => setPicked(p => ev.target.checked ? [...p, e.id] : p.filter(x => x !== e.id))}/>{e.name}{!e.devices && <small className="muted"> (صندوق فقط)</small>}</label>
            ))}</div>}
          </div>
          <label className="check"><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)}/>عاجل — يتجاوز ساعات الهدوء</label>
          <FormError error={error}/>
          <SubmitRow busy={busy} label="إرسال الآن" onCancel={onClose}/>
        </form>
      )}
    </Modal>
  );
}
