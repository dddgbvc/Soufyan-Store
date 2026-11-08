'use client';
import {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {AlertCircle, Check, Loader2, RefreshCw, Search, X} from 'lucide-react';
import {Row, money} from './data';

export const cash = (n: unknown) => <><bdi>{money(n)}</bdi> <small>د.ع</small></>;
export function Badge({tone, children}: {tone: 'green' | 'red' | 'amber'; children: React.ReactNode}) {
  return <span className={'badge ' + tone}><i/>{children}</span>;
}

export class SessionExpired extends Error {}

export async function api(resource: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<any> {
  const qs = new URLSearchParams({r: resource});
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) qs.set(k, String(v === true ? 1 : v));
  const res = await fetch('/api/erp?' + qs, {credentials: 'same-origin', cache: 'no-store'});
  const data: any = await res.json().catch(() => ({ok: false, reason: 'server_error'}));
  if (res.status === 401) throw new SessionExpired();
  if (!res.ok || !data.ok) {
    throw new Error(data.reason === 'forbidden' ? 'ليست لديك صلاحية لهذا القسم.'
      : data.reason === 'migration_missing' ? 'قاعدة البيانات لم تُحدَّث بعد: شغّل ملف supabase/run-in-sql-editor-v8.sql في Supabase ← SQL Editor.'
      : data.message || 'تعذر تحميل البيانات.');
  }
  return data;
}

export type Column = {label: string; cell: (r: Row) => React.ReactNode; className?: string};

export function DataTable({rows, columns, onOpen, empty = 'لا توجد سجلات'}: {rows: Row[]; columns: Column[]; onOpen?: (r: Row) => void; empty?: string}) {
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

export function NameCell({title, sub, avatar}: {title: string; sub?: string | null; avatar?: React.ReactNode}) {
  return (
    <div className="row-name">
      <span className="row-avatar">{avatar ?? (title || '؟').slice(0, 1)}</span>
      <span><strong>{title || '—'}</strong>{sub ? <small>{sub}</small> : null}</span>
    </div>
  );
}

/** تحميل قائمة من الخادم مع بحث مؤجل وتحميل المزيد. */
export function useList(resource: string, key: string, params: Record<string, any>, onExpired: () => void, enabled = true) {
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

export function ListPanel({list, toolbar, children, cursor}: {
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

export function SearchBox({value, onChange, placeholder}: {value: string; onChange: (v: string) => void; placeholder: string}) {
  return (
    <div className="search-field">
      <Search size={18}/>
      <input aria-label="بحث" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} maxLength={100}/>
      {value && <button className="icon-button" onClick={() => onChange('')} aria-label="مسح البحث"><X size={14}/></button>}
    </div>
  );
}

export function Segmented<T extends string>({value, options, onChange}: {value: T; options: [T, string][]; onChange: (v: T) => void}) {
  return (
    <div className="segmented">
      {options.map(([k, l]) => <button key={k} className={value === k ? 'selected' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}


// ---------------------------------------------------------------- كتابة
/** معرّف عملية فريد لمنع التكرار عند إعادة الإرسال (client_id في قاعدة البيانات). */
export const clientId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');

export async function act(action: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/erp/action', {
    method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, payload}),
  });
  const data: any = await res.json().catch(() => ({ok: false, reason: 'server_error'}));
  if (res.status === 401) throw new SessionExpired();
  if (!res.ok || data.ok === false && data.reason !== 'duplicate') {
    throw new Error(data.reason === 'forbidden' ? (data.message || 'ليست لديك صلاحية لهذا الإجراء.')
      : data.reason === 'migration_missing' ? 'قاعدة البيانات لم تُحدَّث بعد: شغّل ملف supabase/run-in-sql-editor-v8.sql في Supabase ← SQL Editor.'
      : data.message || 'تعذر حفظ العملية. حاول مجدداً.');
  }
  return data;
}

// ---------------------------------------------------------------- إشعارات داخل التطبيق
const ToastCtx = createContext<(msg: string, tone?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({children}: {children: React.ReactNode}) {
  const [toast, setToast] = useState<{msg: string; tone: 'ok' | 'err'} | null>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);
  const show = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => setToast({msg, tone}), []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={'toast ' + (toast.tone === 'err' ? 'toast-err' : '')} role="status">{toast.tone === 'err' ? <AlertCircle size={18}/> : <Check size={18}/>}{toast.msg}<button aria-label="إغلاق الإشعار" onClick={() => setToast(null)}><X size={15}/></button></div>}
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- نوافذ ونماذج
export function Modal({title, eyebrow, onClose, children, wide}: {title: React.ReactNode; eyebrow?: string; onClose: () => void; children: React.ReactNode; wide?: boolean}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not(.modal-close)');
    (first || ref.current?.querySelector<HTMLElement>('button'))?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => { document.removeEventListener('keydown', h); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section ref={ref} className={'modal' + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : eyebrow} onClick={e => e.stopPropagation()}>
        <div className="modal-heading">
          <div>{eyebrow && <small>{eyebrow}</small>}<h2>{title}</h2></div>
          <button className="icon-button modal-close" aria-label="إغلاق" onClick={onClose}><X size={21}/></button>
        </div>
        {children}
      </section>
    </div>
  );
}

/** حقل مبلغ بالدينار: أرقام فقط مع فواصل أثناء الكتابة. */
export function MoneyInput({value, onChange, id, required, autoFocus}: {value: string; onChange: (v: string) => void; id?: string; required?: boolean; autoFocus?: boolean}) {
  return (
    <div className="money-input">
      <input id={id} inputMode="numeric" dir="ltr" required={required} autoFocus={autoFocus} autoComplete="off"
        value={value ? money(Number(value)) : ''}
        onChange={e => onChange(e.target.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 13))}/>
      <span>د.ع</span>
    </div>
  );
}

export function Field({label, hint, children, full}: {label: string; hint?: string; children: React.ReactNode; full?: boolean}) {
  return <label className={'field' + (full ? ' full-field' : '')}><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
}

export function FormError({error}: {error: string}) {
  return error ? <div className="form-error" role="alert"><AlertCircle size={16}/>{error}</div> : null;
}

export function SubmitRow({busy, label, onCancel, danger}: {busy: boolean; label: string; onCancel: () => void; danger?: boolean}) {
  return (
    <div className="modal-actions">
      <button className={'button ' + (danger ? 'danger' : 'primary')} type="submit" disabled={busy}>{busy ? <Loader2 size={17} className="spin"/> : <Check size={17}/>}{label}</button>
      <button type="button" className="button secondary" onClick={onCancel}>إلغاء</button>
    </div>
  );
}

export function Kpi({label, value, hint, icon: I, color, onClick, raw}: {label: string; value: unknown; hint?: string; icon: any; color: string; onClick?: () => void; raw?: boolean}) {
  return (
    <button className="kpi" onClick={onClick} disabled={!onClick}>
      <div className="kpi-top"><span>{label}</span><span className={'iconbox ' + color}><I size={19}/></span></div>
      <div className="kpi-value">{raw ? <bdi>{money(value)}</bdi> : cash(value)}</div>
      {hint && <div className="kpi-bottom"><span className={color}><i className="mini-dot"/>{hint}</span></div>}
    </button>
  );
}


export {Loader2};
