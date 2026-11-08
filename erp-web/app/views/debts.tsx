'use client';
import {useCallback, useEffect, useState} from 'react';
import {
  ArrowDownLeft, ArrowUpLeft, FileText, HandCoins, Loader2, MessageCircle, Phone, Plus, Receipt, Search, UserPlus, Users, Wallet,
} from 'lucide-react';
import {Row, money, when} from '../data';
import {
  Badge, DataTable, Field, FormError, Kpi, ListPanel, Modal, MoneyInput, NameCell, SearchBox, Segmented, SessionExpired,
  SubmitRow, act, api, cash, clientId, useList, useToast,
} from '../ui';

type Customer = {id: string; name: string; phone?: string | null; address?: string | null; balance: number; credit_limit?: number};
type Props = {permissions: string[]; storeName: string; onExpired: () => void};

/** رقم عراقي بصيغة واتساب الدولية. */
export function waNumber(phone?: string | null) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('964')) return d;
  if (d.startsWith('0')) d = d.slice(1);
  return d.length === 10 && d.startsWith('7') ? '964' + d : d;
}

function waReminder(c: Customer, store: string) {
  const n = waNumber(c.phone);
  if (!n) return '';
  const text = `مرحباً ${c.name}،\nنود تذكيرك بأن رصيدك المستحق لدى ${store} هو ${money(c.balance)} د.ع.\nشكراً لتعاملك معنا 🌷`;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export default function Debts({permissions, storeName, onExpired}: Props) {
  const can = (p: string) => permissions.includes(p);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'debt' | 'all'>('debt');
  const [summary, setSummary] = useState<{total: number; debtors: number} | null>(null);
  const [modal, setModal] = useState<null | {kind: 'add' | 'pay' | 'new' | 'statement'; customer?: Customer}>(null);
  const list = useList('customers', 'customers', {q, debtors_only: mode === 'debt'}, onExpired);

  const loadSummary = useCallback(() => {
    api('dashboard').then(d => setSummary(d.debts || null)).catch(e => { if (e instanceof SessionExpired) onExpired(); });
  }, [onExpired]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const refresh = () => { list.load(false); loadSummary(); };
  const close = () => setModal(null);

  return <>
    <div className="kpis kpis-3">
      <Kpi label="إجمالي الديون" value={summary?.total ?? 0} hint={`${summary?.debtors ?? 0} زبون عليهم رصيد`} icon={Wallet} color="gold"/>
      <Kpi label="الزبائن المعروضون" value={list.rows.length} raw hint={mode === 'debt' ? 'عليهم ديون' : 'كل الزبائن'} icon={Users} color="blue"/>
      <Kpi label="رصيد المعروض" value={list.rows.reduce((a, r) => a + Math.max(0, Number(r.balance || 0)), 0)} hint="مجموع أرصدة القائمة" icon={HandCoins} color="teal"/>
    </div>
    <div className="action-bar">
      {can('customers.edit') && <button className="button primary" onClick={() => setModal({kind: 'new'})}><UserPlus size={17}/>زبون جديد</button>}
      {can('customers.debt_addition') && <button className="button secondary" onClick={() => setModal({kind: 'add'})}><Plus size={17}/>دين جديد</button>}
    </div>
    <ListPanel list={list} cursor={(_, n) => ({offset: n})}
      toolbar={<><SearchBox value={q} onChange={setQ} placeholder="اسم الزبون أو رقم الهاتف…"/><div className="table-filters"><Segmented value={mode} onChange={setMode} options={[['debt', 'عليهم ديون'], ['all', 'كل الزبائن']]}/></div></>}>
      <DataTable rows={list.rows} empty={mode === 'debt' ? 'لا توجد ديون مستحقة 🎉' : 'لا يوجد زبائن'} columns={[
        {label: 'الزبون', cell: r => <button className="link-cell" onClick={() => setModal({kind: 'statement', customer: r as Customer})}><NameCell title={r.name} sub={r.address}/></button>},
        {label: 'الهاتف', cell: r => r.phone ? <bdi dir="ltr">{r.phone}</bdi> : '—'},
        {label: 'الرصيد', className: 'number', cell: r => Number(r.balance) > 0 ? <span className="warning-text">{cash(r.balance)}</span> : cash(r.balance)},
        {label: 'من السقف', cell: r => <LimitBar balance={Number(r.balance)} limit={Number(r.credit_limit)}/>},
        {label: 'آخر حركة', cell: r => when(r.updated_at)},
        {label: '', cell: r => (
          <div className="row-actions">
            {can('customers.payment') && Number(r.balance) > 0 && <button className="small-btn" onClick={() => setModal({kind: 'pay', customer: r as Customer})}>تسديد</button>}
            {can('customers.debt_addition') && <button className="small-btn" onClick={() => setModal({kind: 'add', customer: r as Customer})}>+ دين</button>}
            {waReminder(r as Customer, storeName) && Number(r.balance) > 0 && <a className="icon-button wa" href={waReminder(r as Customer, storeName)} target="_blank" rel="noopener noreferrer" aria-label={'تذكير واتساب ' + r.name}><MessageCircle size={17}/></a>}
          </div>
        )},
      ]}/>
    </ListPanel>

    {modal?.kind === 'new' && <NewCustomer permissions={permissions} onClose={close} onExpired={onExpired} onDone={(c, withDebt) => { refresh(); setModal(withDebt ? null : {kind: 'statement', customer: c}); }} onUseExisting={c => setModal({kind: 'add', customer: c})}/>}
    {modal?.kind === 'add' && <AddDebt customer={modal.customer} onClose={close} onExpired={onExpired} onDone={refresh}/>}
    {modal?.kind === 'pay' && modal.customer && <PayDebt customer={modal.customer} canWaive={can('customers.waiver')} onClose={close} onExpired={onExpired} onDone={refresh}/>}
    {modal?.kind === 'statement' && modal.customer && (
      <Statement customer={modal.customer} storeName={storeName} permissions={permissions} onClose={close} onExpired={onExpired}
        onAction={(kind, c) => setModal({kind, customer: c})}/>
    )}
  </>;
}

function LimitBar({balance, limit}: {balance: number; limit: number}) {
  if (!limit) return <small className="muted">بلا سقف</small>;
  const pct = Math.min(100, Math.max(0, (balance / limit) * 100));
  return (
    <div className="limit-bar" title={`${money(balance)} من ${money(limit)}`}>
      <i style={{width: pct + '%'}} className={pct >= 90 ? 'hot' : pct >= 60 ? 'warm' : ''}/>
      <small>{Math.round(pct)}%</small>
    </div>
  );
}

// ---------------------------------------------------------------- اختيار زبون
function CustomerPicker({onPick, onExpired}: {onPick: (c: Customer) => void; onExpired: () => void}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Customer[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try { setRows((await api('customers', {q, limit: 8})).customers || []); }
      catch (e) { if (e instanceof SessionExpired) onExpired(); }
      finally { setBusy(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, onExpired]);
  return (
    <div className="picker">
      <div className="search-field"><Search size={18}/><input autoFocus placeholder="ابحث باسم الزبون أو رقمه…" value={q} onChange={e => setQ(e.target.value)} aria-label="بحث عن زبون"/>{busy && <Loader2 size={16} className="spin"/>}</div>
      <div className="picker-list">
        {rows.map(c => (
          <button type="button" key={c.id} onClick={() => onPick(c)}>
            <NameCell title={c.name} sub={c.phone}/><span className={Number(c.balance) > 0 ? 'warning-text' : 'muted'}>{cash(c.balance)}</span>
          </button>
        ))}
        {q.trim().length >= 2 && !busy && !rows.length && <p className="muted">لا نتائج. أضف الزبون من «زبون جديد».</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- إضافة دين
function AddDebt({customer: initial, onClose, onDone, onExpired}: {customer?: Customer; onClose: () => void; onDone: () => void; onExpired: () => void}) {
  const toast = useToast();
  const [customer, setCustomer] = useState<Customer | undefined>(initial);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cid] = useState(clientId);
  const next = Number(customer?.balance || 0) + Number(amount || 0);
  const limit = Number(customer?.credit_limit || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    if (!Number(amount)) { setError('أدخل مبلغ الدين'); return; }
    if (!notes.trim()) { setError('اذكر سبب الدين (مثلاً: جهاز iPhone 13 بالأقساط)'); return; }
    setBusy(true); setError('');
    try {
      const r = await act('debt_add', {customer_id: customer.id, amount: Number(amount), notes: notes.trim(), client_id: cid});
      toast(`أُضيف دين ${money(r.amount ?? amount)} د.ع على ${customer.name} • الرصيد ${money(r.remaining_debt ?? next)} د.ع`);
      onDone(); onClose();
    } catch (err) {
      if (err instanceof SessionExpired) { onExpired(); return; }
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Modal title={customer ? 'إضافة دين • ' + customer.name : 'دين جديد'} eyebrow="الديون" onClose={onClose}>
      {!customer ? <CustomerPicker onPick={setCustomer} onExpired={onExpired}/> : (
        <form onSubmit={submit} className="form-stack">
          <div className="balance-preview">
            <div><small>الرصيد الحالي</small><b>{cash(customer.balance)}</b></div>
            <ArrowUpLeft size={18}/>
            <div><small>بعد الإضافة</small><b className={limit && next > limit ? 'warning-text' : ''}>{cash(next)}</b></div>
          </div>
          {limit > 0 && next > limit && <p className="form-note warn">سيتجاوز سقف الدين ({money(limit)} د.ع) وسترفضه قاعدة البيانات. ارفع السقف من البرنامج أولاً.</p>}
          <Field label="مبلغ الدين"><MoneyInput value={amount} onChange={setAmount} required autoFocus/></Field>
          <Field label="السبب" hint="يظهر في كشف الحساب وفي إشعار المالك"><textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={2} required/></Field>
          <FormError error={error}/>
          <SubmitRow busy={busy} label="تسجيل الدين" onCancel={onClose}/>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- تسديد
function PayDebt({customer, canWaive, onClose, onDone, onExpired}: {customer: Customer; canWaive: boolean; onClose: () => void; onDone: () => void; onExpired: () => void}) {
  const toast = useToast();
  const balance = Number(customer.balance || 0);
  const [paid, setPaid] = useState('');
  const [waived, setWaived] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cid] = useState(clientId);
  const remaining = balance - Number(paid || 0) - Number(waived || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number(paid) && !Number(waived)) { setError('أدخل المبلغ المقبوض'); return; }
    if (remaining < 0) { setError('المجموع أكبر من الرصيد المستحق'); return; }
    if (Number(waived) > 0 && !reason.trim()) { setError('اذكر سبب المسامحة'); return; }
    setBusy(true); setError('');
    try {
      const r = await act('debt_pay', {customer_id: customer.id, amount_paid: Number(paid || 0), waived_amount: Number(waived || 0), waiver_reason: reason.trim(), notes: notes.trim(), client_id: cid});
      toast(`قُبض ${money(paid || 0)} د.ع من ${customer.name} • المتبقي ${money(r.remaining_debt ?? remaining)} د.ع`);
      onDone(); onClose();
    } catch (err) {
      if (err instanceof SessionExpired) { onExpired(); return; }
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Modal title={'تسديد • ' + customer.name} eyebrow="الديون" onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <div className="balance-preview">
          <div><small>المستحق</small><b>{cash(balance)}</b></div>
          <ArrowDownLeft size={18}/>
          <div><small>المتبقي بعد التسديد</small><b className={remaining < 0 ? 'warning-text' : remaining === 0 ? 'ok-text' : ''}>{cash(Math.max(remaining, 0))}</b></div>
        </div>
        <Field label="المبلغ المقبوض نقداً">
          <MoneyInput value={paid} onChange={setPaid} autoFocus/>
        </Field>
        <div className="chips">
          <button type="button" className="chip" onClick={() => setPaid(String(balance - Number(waived || 0)))}>كامل المبلغ</button>
          <button type="button" className="chip" onClick={() => setPaid(String(Math.round(balance / 2)))}>النصف</button>
          {[50000, 100000, 250000].filter(v => v < balance).map(v => <button type="button" className="chip" key={v} onClick={() => setPaid(String(v))}>{money(v)}</button>)}
        </div>
        {canWaive && <>
          <Field label="مسامحة (اختياري)" hint="مبلغ يُشطب من الدين دون قبض"><MoneyInput value={waived} onChange={setWaived}/></Field>
          {Number(waived) > 0 && <Field label="سبب المسامحة"><input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} required/></Field>}
        </>}
        <Field label="ملاحظات (اختياري)"><input value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000}/></Field>
        <p className="form-note">يُسجّل المقبوض في الخزنة تلقائياً، ويصل إشعار «تسديد دين» للمسؤولين.</p>
        <FormError error={error}/>
        <SubmitRow busy={busy} label="تسجيل التسديد" onCancel={onClose}/>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- زبون جديد
function NewCustomer({permissions, onClose, onDone, onUseExisting, onExpired}: {
  permissions: string[]; onClose: () => void; onDone: (c: Customer, withDebt: boolean) => void; onUseExisting: (c: Customer) => void; onExpired: () => void;
}) {
  const toast = useToast();
  const canDebt = permissions.includes('customers.debt_addition');
  const [f, setF] = useState({name: '', phone: '', address: '', limit: '500000', debt: '', notes: ''});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dup, setDup] = useState<Customer | null>(null);
  const [cid] = useState(clientId);
  const set = (k: keyof typeof f) => (v: string) => setF(p => ({...p, [k]: v}));

  async function submit(e: React.FormEvent, allowDuplicate = false) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await act('customer_create', {
        name: f.name.trim(), phone: f.phone.trim(), address: f.address.trim(),
        credit_limit: Number(f.limit || 0), opening_debt: canDebt && Number(f.debt) ? Number(f.debt) : 0,
        notes: f.notes.trim(), allow_duplicate: allowDuplicate, client_id: cid,
      });
      if (r.reason === 'duplicate') { setDup(r.existing); return; }
      toast(`أُضيف الزبون ${r.customer.name}${r.debt ? ` بدين ${money(f.debt)} د.ع` : ''}`);
      onDone(r.customer, !!r.debt);
    } catch (err) {
      if (err instanceof SessionExpired) { onExpired(); return; }
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Modal title="زبون جديد" eyebrow="الديون والزبائن" onClose={onClose}>
      {dup ? (
        <div className="form-stack">
          <div className="info-banner"><Users size={20}/><div><b>يوجد زبون بنفس الرقم</b><p>{dup.name} • {dup.phone} • الرصيد {money(dup.balance)} د.ع</p></div></div>
          <div className="modal-actions">
            <button className="button primary" onClick={() => onUseExisting(dup)}>إضافة الدين على {dup.name}</button>
            <button className="button secondary" disabled={busy} onClick={e => submit(e as unknown as React.FormEvent, true)}>إنشاء زبون منفصل</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="form-grid">
          <Field label="الاسم"><input value={f.name} onChange={e => set('name')(e.target.value)} required minLength={2} maxLength={120} autoFocus/></Field>
          <Field label="الهاتف"><input value={f.phone} onChange={e => set('phone')(e.target.value)} inputMode="tel" dir="ltr" placeholder="07xx xxx xxxx"/></Field>
          <Field label="العنوان" full><input value={f.address} onChange={e => set('address')(e.target.value)} maxLength={300}/></Field>
          <Field label="سقف الدين" hint="0 = بلا سقف"><MoneyInput value={f.limit} onChange={set('limit')}/></Field>
          {canDebt && <Field label="دين افتتاحي (اختياري)"><MoneyInput value={f.debt} onChange={set('debt')}/></Field>}
          {canDebt && Number(f.debt) > 0 && <Field label="سبب الدين" full><input value={f.notes} onChange={e => set('notes')(e.target.value)} placeholder="رصيد افتتاحي" maxLength={1000}/></Field>}
          <div className="full-field"><FormError error={error}/></div>
          <div className="full-field"><SubmitRow busy={busy} label="حفظ الزبون" onCancel={onClose}/></div>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- كشف حساب
function Statement({customer, storeName, permissions, onClose, onExpired, onAction}: {
  customer: Customer; storeName: string; permissions: string[]; onClose: () => void; onExpired: () => void; onAction: (k: 'add' | 'pay', c: Customer) => void;
}) {
  const [data, setData] = useState<{customer: Customer; movements: Row[]} | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('statement', {id: customer.id}).then(setData).catch(e => { if (e instanceof SessionExpired) onExpired(); else setError(e.message); });
  }, [customer.id, onExpired]);
  const c = data?.customer || customer;
  const wa = waReminder(c, storeName);

  return (
    <Modal title={c.name} eyebrow="كشف حساب" onClose={onClose} wide>
      <div className="statement-head">
        <div><small>الرصيد المستحق</small><b className={Number(c.balance) > 0 ? 'warning-text' : 'ok-text'}>{cash(c.balance)}</b></div>
        <div><small>سقف الدين</small><b>{Number(c.credit_limit) ? cash(c.credit_limit) : 'بلا سقف'}</b></div>
        <div><small>الهاتف</small><b>{c.phone ? <bdi dir="ltr">{c.phone}</bdi> : '—'}</b></div>
      </div>
      <div className="action-bar">
        {permissions.includes('customers.payment') && Number(c.balance) > 0 && <button className="button primary" onClick={() => onAction('pay', c)}><HandCoins size={17}/>تسديد</button>}
        {permissions.includes('customers.debt_addition') && <button className="button secondary" onClick={() => onAction('add', c)}><Plus size={17}/>إضافة دين</button>}
        {wa && Number(c.balance) > 0 && <a className="button secondary wa-btn" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={17}/>تذكير واتساب</a>}
        {c.phone && <a className="button secondary" href={'tel:' + c.phone}><Phone size={16}/>اتصال</a>}
      </div>
      {error && <FormError error={error}/>}
      {!data && !error && <p className="muted"><Loader2 size={15} className="spin"/> جارٍ تحميل الحركات…</p>}
      {data && (
        <ol className="timeline">
          {data.movements.map(m => (
            <li key={m.kind + m.id} className={'tl-' + m.kind}>
              <span className="tl-icon">{m.kind === 'invoice' ? <Receipt size={15}/> : m.kind === 'payment' ? <ArrowDownLeft size={15}/> : <ArrowUpLeft size={15}/>}</span>
              <div className="tl-body">
                <div className="tl-top">
                  <b>{m.kind === 'invoice' ? 'فاتورة ' + (m.ref || '') : m.kind === 'payment' ? 'تسديد' : 'إضافة دين'}</b>
                  <span className="tl-amount">
                    {m.kind === 'invoice' ? cash(m.total) : m.kind === 'payment' ? <>−{cash(m.amount)}</> : <>+{cash(m.amount)}</>}
                  </span>
                </div>
                <small>
                  {when(m.at)}{m.actor ? ' • ' + m.actor : ''}
                  {m.kind === 'invoice' && Number(m.total) > Number(m.paid) ? ` • آجل ${money(Number(m.total) - Number(m.paid))}` : ''}
                  {m.kind !== 'invoice' && m.remaining !== undefined ? ` • الرصيد بعدها ${money(m.remaining)}` : ''}
                  {Number(m.waived) > 0 ? ` • مسامحة ${money(m.waived)}${m.waiver_reason ? ' (' + m.waiver_reason + ')' : ''}` : ''}
                </small>
                {m.notes && <p>{m.notes}</p>}
              </div>
            </li>
          ))}
          {!data.movements.length && <li className="muted"><FileText size={16}/> لا توجد حركات بعد.</li>}
        </ol>
      )}
      {data && <p className="muted statement-foot">يعرض آخر 150 فاتورة و150 حركة دين • <Badge tone={Number(c.balance) > 0 ? 'amber' : 'green'}>{Number(c.balance) > 0 ? 'عليه رصيد' : 'مسدد'}</Badge></p>}
    </Modal>
  );
}
