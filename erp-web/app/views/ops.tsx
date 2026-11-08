'use client';
import {useCallback, useEffect, useState} from 'react';
import {
  ArrowDownLeft, ArrowLeft, ArrowUpLeft, Bell, ChevronLeft, Coins, HandCoins, Landmark, Monitor, Package, Plus, Receipt,
  RefreshCw, RotateCcw, TrendingUp, Wallet, Wrench,
} from 'lucide-react';
import {Row, SectionKey, money, paymentLabel, when} from '../data';
import {
  Badge, DataTable, Field, FormError, Kpi, Loader2, Modal, MoneyInput, NameCell, SessionExpired, SubmitRow, act, api, cash, clientId, useToast,
} from '../ui';

// ====================================================================== لوحة اليوم
export function Dashboard({permissions, onExpired, nav, openInvoice}: {permissions: string[]; onExpired: () => void; nav: (k: SectionKey) => void; openInvoice: (r: Row) => void}) {
  const has = (p: string) => permissions.includes(p);
  const [d, setD] = useState<Record<string, any> | null>(null);
  const [extra, setExtra] = useState<{latest: Row[]; low: Row[]; debtors: Row[]}>({latest: [], low: [], debtors: []});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [dash, inv, low, deb] = await Promise.all([
        api('dashboard'),
        has('pos') ? api('invoices', {limit: 6}) : Promise.resolve({invoices: []}),
        has('inventory') ? api('products', {low_only: true, limit: 4}) : Promise.resolve({products: []}),
        has('customers') ? api('customers', {debtors_only: true, limit: 4}) : Promise.resolve({customers: []}),
      ]);
      setD(dash); setExtra({latest: inv.invoices || [], low: low.products || [], debtors: deb.customers || []});
    } catch (e) {
      if (e instanceof SessionExpired) { onExpired(); return; }
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, [permissions.join(','), onExpired]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const s = d?.sales, p = d?.profit;
  const series: {day: string; total: number}[] = d?.series || [];
  const max = Math.max(1, ...series.map(x => Number(x.total)));
  const tiles = [
    s && {label: 'مبيعات اليوم', value: s.today_total, hint: `${s.today_count} فاتورة • المقبوض ${money(s.today_paid)}`, icon: Receipt, color: 'teal', go: 'invoices'},
    s && {label: 'مبيعات الشهر', value: s.month_total, hint: `${s.month_count} فاتورة`, icon: TrendingUp, color: 'blue', go: 'invoices'},
    p && {label: 'ربح اليوم', value: Number(p.today_revenue) - Number(p.today_cost), hint: `الشهر ${money(Number(p.month_revenue) - Number(p.month_cost))}`, icon: Coins, color: 'green'},
    d?.debts && {label: 'ديون الزبائن', value: d.debts.total, hint: `${d.debts.debtors} زبون • المحصّل اليوم ${money(d?.collected?.today || 0)}`, icon: Wallet, color: 'gold', go: 'customers'},
    d?.vault_balance !== undefined && {label: 'رصيد الخزنة', value: d.vault_balance, hint: 'الخزنة الرئيسية', icon: Landmark, color: 'purple', go: 'vault'},
    d?.expenses && {label: 'مصروفات اليوم', value: d.expenses.today, hint: `الشهر ${money(d.expenses.month)}`, icon: ArrowUpLeft, color: 'red', go: 'expenses'},
    d?.returns && {label: 'مرتجعات اليوم', value: d.returns.today, hint: `الشهر ${money(d.returns.month)}`, icon: RotateCcw, color: 'amber', go: 'returns'},
    d?.my_sales && !s && {label: 'مبيعاتي اليوم', value: d.my_sales.total, hint: `${d.my_sales.count} فاتورة`, icon: Receipt, color: 'teal', go: 'invoices'},
    d?.repairs && {label: 'صيانة مفتوحة', value: d.repairs.open, raw: true, hint: `${d.repairs.ready} جاهزة • ${d.repairs.mine} لي`, icon: Wrench, color: 'blue', go: 'repairs'},
    d?.stock && {label: 'تحت حد التنبيه', value: d.stock.low, raw: true, hint: `${d.stock.out} نفدت • ${d.stock.products} منتج`, icon: Package, color: 'amber', go: has('shortages') ? 'shortages' : 'products'},
    d?.active_sessions !== undefined && {label: 'جلسات نشطة', value: d.active_sessions, raw: true, hint: 'آخر 10 دقائق', icon: Monitor, color: 'blue', go: 'sessions'},
  ].filter(Boolean) as any[];

  return <>
    <div className="overview-tools">
      <div className="overview-label"><span className="status-led"/>أداء المحل الآن <span className="muted">• بتوقيت بغداد</span></div>
      <div className="action-bar tight">
        {has('customers.debt_addition') && <button className="button secondary" onClick={() => nav('customers')}><Plus size={16}/>دين</button>}
        {has('expenses.create') && <button className="button secondary" onClick={() => nav('expenses')}><ArrowUpLeft size={16}/>مصروف</button>}
        <button className="button secondary" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/>تحديث</button>
      </div>
    </div>
    {error && <FormError error={error}/>}
    {loading && !d ? <div className="kpis">{[0, 1, 2, 3].map(i => <div className="kpi skeleton" key={i}/>)}</div> : (
      <div className="kpis">{tiles.map(t => <Kpi key={t.label} label={t.label} value={t.value} raw={t.raw} hint={t.hint} icon={t.icon} color={t.color} onClick={t.go ? () => nav(t.go) : undefined}/>)}</div>
    )}
    <div className="dashboard-grid">
      {series.length > 0 && (
        <section className="panel chart-panel">
          <div className="panel-head"><div><h3>مبيعات آخر 7 أيام</h3><p>إجمالي الفواتير لكل يوم • د.ع</p></div></div>
          <div className="bars" role="img" aria-label="مبيعات آخر سبعة أيام">
            {series.map(x => (
              <div className="bar-col" key={x.day} title={`${x.day}: ${money(x.total)} د.ع`}>
                <small>{Number(x.total) ? money(Math.round(Number(x.total) / 1000)) + 'k' : ''}</small>
                <i style={{height: Math.max(3, (Number(x.total) / max) * 100) + '%'}} className={x.day === d?.today ? 'today' : ''}/>
                <span>{new Date(x.day + 'T12:00:00').toLocaleDateString('ar-IQ-u-nu-latn', {weekday: 'short'})}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="panel attention">
        <div className="panel-head"><div><h3>تحتاج انتباهك</h3><p>من بيانات المحل الآن</p></div><Bell size={18}/></div>
        {extra.low.map(r => (
          <button className="attention-item" key={r.id} onClick={() => nav(has('shortages') ? 'shortages' : 'products')}>
            <span className="attention-icon amber-bg"><Package size={18}/></span><span><b>{r.name}</b><small>{r.stock_quantity} متبقية • الحد {r.min_stock_alert}</small></span><ChevronLeft size={15}/>
          </button>
        ))}
        {extra.debtors.map(r => (
          <button className="attention-item" key={r.id} onClick={() => nav('customers')}>
            <span className="attention-icon red-bg"><Wallet size={18}/></span><span><b>{r.name}</b><small>عليه {money(r.balance)} د.ع</small></span><ChevronLeft size={15}/>
          </button>
        ))}
        {d?.repairs?.ready > 0 && (
          <button className="attention-item" onClick={() => nav('repairs')}>
            <span className="attention-icon blue-bg"><Wrench size={18}/></span><span><b>صيانة جاهزة</b><small>{d?.repairs?.ready} أجهزة بانتظار التسليم</small></span><ChevronLeft size={15}/>
          </button>
        )}
        {!loading && !extra.low.length && !extra.debtors.length && !d?.repairs?.ready && <div className="empty"><h3>لا شيء عاجل الآن ✨</h3></div>}
      </section>
    </div>
    {has('pos') && (
      <section className="panel">
        <div className="panel-head"><div><h3>آخر الفواتير</h3><p>اضغط الفاتورة لعرض أصنافها</p></div><button className="text-button" onClick={() => nav('invoices')}>عرض الكل <ArrowLeft size={15}/></button></div>
        <DataTable rows={extra.latest} onOpen={openInvoice} columns={[
          {label: 'الفاتورة', cell: r => <bdi>{r.invoice_number}</bdi>},
          {label: 'الزبون', cell: r => <NameCell title={r.customer_name || 'زبون نقدي'} sub={r.actor}/>},
          {label: 'الوقت', cell: r => when(r.created_at)},
          {label: 'المبلغ', cell: r => cash(r.total_amount), className: 'number'},
          {label: 'الدفع', cell: r => <Badge tone={Number(r.total_amount) > Number(r.paid_amount) ? 'amber' : 'green'}>{paymentLabel(r.payment_type)}</Badge>},
        ]}/>
      </section>
    )}
  </>;
}

// ====================================================================== تفاصيل فاتورة
export function InvoiceDetail({id, onClose, onExpired}: {id: string; onClose: () => void; onExpired: () => void}) {
  const [d, setD] = useState<{invoice: Row; items: Row[]; payments: Row[]} | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api('invoice', {id}).then(setD).catch(e => { if (e instanceof SessionExpired) onExpired(); else setError(e.message); }); }, [id, onExpired]);
  const inv = d?.invoice;
  const rest = inv ? Number(inv.total_amount) - Number(inv.paid_amount) : 0;
  return (
    <Modal title={inv ? 'فاتورة ' + inv.invoice_number : 'فاتورة'} eyebrow="المبيعات" onClose={onClose} wide>
      {error && <FormError error={error}/>}
      {!d && !error && <p className="muted"><Loader2 size={15} className="spin"/> جارٍ التحميل…</p>}
      {inv && <>
        <div className="statement-head">
          <div><small>الزبون</small><b>{inv.customer_name || 'زبون نقدي'}</b>{inv.customer_phone && <small><bdi dir="ltr">{inv.customer_phone}</bdi></small>}</div>
          <div><small>الإجمالي</small><b>{cash(inv.total_amount)}</b></div>
          <div><small>{rest > 0 ? 'المتبقي (آجل)' : 'الدفع'}</small><b className={rest > 0 ? 'warning-text' : 'ok-text'}>{rest > 0 ? cash(rest) : paymentLabel(inv.payment_type)}</b></div>
        </div>
        <DataTable rows={d!.items} empty="لا توجد أصناف" columns={[
          {label: 'الصنف', cell: r => <span><b>{r.product_name}</b>{Array.isArray(r.serials) && r.serials.length ? <><br/><small className="muted" dir="ltr">{r.serials.join(', ')}</small></> : null}</span>},
          {label: 'الكمية', cell: r => r.quantity},
          {label: 'السعر', cell: r => cash(r.unit_price), className: 'number'},
          {label: 'الخصم', cell: r => (Number(r.discount) ? cash(r.discount) : '—'), className: 'number'},
          {label: 'المجموع', cell: r => cash(r.total), className: 'number'},
        ]}/>
        <p className="muted statement-foot">{when(inv.created_at)} • بواسطة {inv.actor || '—'}{Number(inv.delivery_price) ? ` • توصيل ${money(inv.delivery_price)} د.ع ${inv.province_name || ''}` : ''}{inv.notes ? ' • ' + inv.notes : ''}</p>
      </>}
    </Modal>
  );
}

// ====================================================================== تفاصيل صيانة + تغيير الحالة
export function RepairDetail({id, onClose, onExpired, onChanged}: {id: string; onClose: () => void; onExpired: () => void; onChanged: () => void}) {
  const toast = useToast();
  const [d, setD] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(() => { api('repair', {id}).then(setD).catch(e => { if (e instanceof SessionExpired) onExpired(); else setError(e.message); }); }, [id, onExpired]);
  useEffect(() => { load(); }, [load]);
  const r = d?.repair;

  async function move(code: string, label: string) {
    let reason = '';
    if (code === 'UNREPAIRABLE') { reason = prompt('سبب عدم إمكانية الإصلاح؟') || ''; if (!reason) return; }
    setBusy(code);
    try { await act('repair_status', {repair_id: id, to_status: code, reason}); toast(`حُدّثت الحالة إلى «${label}»`); load(); onChanged(); }
    catch (e) { if (e instanceof SessionExpired) onExpired(); else toast((e as Error).message, 'err'); }
    finally { setBusy(''); }
  }

  return (
    <Modal title={r ? `${r.ticket_no} • ${r.device || ''}` : 'تذكرة صيانة'} eyebrow="الصيانة" onClose={onClose} wide>
      {error && <FormError error={error}/>}
      {!d && !error && <p className="muted"><Loader2 size={15} className="spin"/> جارٍ التحميل…</p>}
      {r && <>
        <div className="statement-head">
          <div><small>الزبون</small><b>{r.customer_name}</b>{r.customer_phone && <small><bdi dir="ltr">{r.customer_phone}</bdi></small>}</div>
          <div><small>الحالة</small><b><Badge tone={r.status === 'READY' ? 'green' : 'amber'}>{r.status_label || r.status}</Badge></b></div>
          <div><small>الكلفة • المدفوع مقدماً</small><b>{cash(Number(r.cost || 0) + Number(r.labour || 0))}</b><small>{money(r.prepaid || 0)} د.ع</small></div>
        </div>
        <div className="detail-fields">
          <div><small>العطل</small><b>{r.fault || '—'}</b></div>
          <div><small>التشخيص</small><b>{r.diagnosis || '—'}</b></div>
          <div><small>الفني</small><b>{r.technician_name || '—'}</b></div>
          <div><small>موعد التسليم</small><b>{when(r.promised_at)}</b></div>
          {r.imei && <div><small>IMEI</small><b dir="ltr">{r.imei}</b></div>}
          {r.accessories && <div><small>الملحقات</small><b>{r.accessories}</b></div>}
        </div>
        {d!.next_statuses?.length > 0 && (
          <div className="status-actions">
            <small className="muted">نقل إلى:</small>
            {d!.next_statuses.map((s: Row) => <button key={s.code} className={'button ' + (s.code === 'READY' ? 'primary' : 'secondary')} disabled={!!busy} onClick={() => move(s.code, s.label)}>{busy === s.code ? <Loader2 size={15} className="spin"/> : null}{s.label}</button>)}
          </div>
        )}
        {d!.desktop_only_statuses?.length > 0 && <p className="form-note">{d!.desktop_only_statuses.join(' و')}: من برنامج المكتب لأنها تحرّك المال.</p>}
        <h3 className="sub-head">السجل</h3>
        <ol className="timeline">
          {d!.history.map((h: Row, i: number) => (
            <li key={i}><span className="tl-icon"><Wrench size={14}/></span><div className="tl-body"><div className="tl-top"><b>{h.to_label || h.to}</b></div><small>{when(h.at)}{h.actor ? ' • ' + h.actor : ''}</small>{h.reason && <p>{h.reason}</p>}</div></li>
          ))}
        </ol>
      </>}
    </Modal>
  );
}

// ====================================================================== الخزنة
export function Vault({permissions, onExpired}: {permissions: string[]; onExpired: () => void}) {
  const [d, setD] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [txn, setTxn] = useState<null | 'deposit' | 'withdraw'>(null);
  const load = useCallback(() => { api('vault', {limit: 100}).then(setD).catch(e => { if (e instanceof SessionExpired) onExpired(); else setError(e.message); }); }, [onExpired]);
  useEffect(() => { load(); }, [load]);
  const kindLabel: Record<string, string> = {sale: 'بيع', deposit: 'إيداع', withdraw: 'سحب', expense: 'مصروف', debt_payment: 'تسديد دين', reversal: 'عكس قيد', opening: 'رصيد افتتاحي', refund: 'إرجاع', purchase: 'شراء', supplier_payment: 'دفعة مورد'};
  return <>
    {error && <FormError error={error}/>}
    <div className="kpis kpis-3">
      <Kpi label="رصيد الخزنة" value={d?.balance ?? 0} hint="الخزنة الرئيسية" icon={Landmark} color="purple"/>
      <Kpi label="وارد اليوم" value={d?.today?.in ?? 0} icon={ArrowDownLeft} color="green"/>
      <Kpi label="صادر اليوم" value={d?.today?.out ?? 0} icon={ArrowUpLeft} color="red"/>
    </div>
    <div className="action-bar">
      {permissions.includes('vaults.deposit') && <button className="button primary" onClick={() => setTxn('deposit')}><ArrowDownLeft size={17}/>إيداع</button>}
      {permissions.includes('vaults.withdraw') && <button className="button secondary" onClick={() => setTxn('withdraw')}><ArrowUpLeft size={17}/>سحب</button>}
    </div>
    <section className="panel module-panel">
      <DataTable rows={d?.entries || []} empty="لا توجد حركات" columns={[
        {label: '#', cell: r => <bdi>{r.seq}</bdi>},
        {label: 'الحركة', cell: r => <NameCell title={kindLabel[r.kind] || r.kind} sub={r.note} avatar={r.direction === 'in' ? <ArrowDownLeft size={16}/> : <ArrowUpLeft size={16}/>}/>},
        {label: 'المبلغ', className: 'number', cell: r => <span className={r.direction === 'in' ? 'ok-text' : r.direction === 'out' ? 'warning-text' : ''}>{r.direction === 'out' ? '−' : '+'}{cash(r.amount)}</span>},
        {label: 'بواسطة', cell: r => r.actor || '—'},
        {label: 'الوقت', cell: r => when(r.created_at)},
      ]}/>
    </section>
    {txn && <VaultTxn kind={txn} balance={Number(d?.balance || 0)} onClose={() => setTxn(null)} onExpired={onExpired} onDone={load}/>}
  </>;
}

function VaultTxn({kind, balance, onClose, onExpired, onDone}: {kind: 'deposit' | 'withdraw'; balance: number; onClose: () => void; onExpired: () => void; onDone: () => void}) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cid] = useState(clientId);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === 'withdraw' && Number(amount) > balance) { setError('المبلغ أكبر من رصيد الخزنة'); return; }
    setBusy(true); setError('');
    try { await act('vault_txn', {kind, amount: Number(amount), note: note.trim(), client_id: cid}); toast(kind === 'deposit' ? 'تم الإيداع' : 'تم السحب'); onDone(); onClose(); }
    catch (err) { if (err instanceof SessionExpired) onExpired(); else setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modal title={kind === 'deposit' ? 'إيداع في الخزنة' : 'سحب من الخزنة'} eyebrow={`الرصيد الحالي ${money(balance)} د.ع`} onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <Field label="المبلغ"><MoneyInput value={amount} onChange={setAmount} required autoFocus/></Field>
        <Field label="البيان" hint="يظهر في سجل الخزنة"><input value={note} onChange={e => setNote(e.target.value)} maxLength={500} required/></Field>
        <FormError error={error}/>
        <SubmitRow busy={busy} label={kind === 'deposit' ? 'إيداع' : 'سحب'} onCancel={onClose} danger={kind === 'withdraw'}/>
      </form>
    </Modal>
  );
}

// ====================================================================== مصروف جديد
export function NewExpense({onClose, onExpired, onDone}: {onClose: () => void; onExpired: () => void; onDone: () => void}) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('مصاريف تشغيلية');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cid] = useState(clientId);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await act('expense_create', {amount: Number(amount), description: description.trim(), category, client_id: cid}); toast('سُجّل المصروف وخُصم من الخزنة'); onDone(); onClose(); }
    catch (err) { if (err instanceof SessionExpired) onExpired(); else setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modal title="مصروف جديد" eyebrow="المصروفات" onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <Field label="المبلغ"><MoneyInput value={amount} onChange={setAmount} required autoFocus/></Field>
        <Field label="الوصف"><input value={description} onChange={e => setDescription(e.target.value)} maxLength={200} required placeholder="مثلاً: فاتورة كهرباء المولدة"/></Field>
        <Field label="التصنيف">
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {['مصاريف تشغيلية', 'إيجار', 'كهرباء ومولدة', 'إنترنت واتصالات', 'نقل وتوصيل', 'صيانة المحل', 'ضيافة', 'أخرى'].map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <p className="form-note"><HandCoins size={15}/>سندات الرواتب تصدر من كشف الرواتب في برنامج المكتب.</p>
        <FormError error={error}/>
        <SubmitRow busy={busy} label="تسجيل المصروف" onCancel={onClose}/>
      </form>
    </Modal>
  );
}
