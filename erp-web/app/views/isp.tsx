'use client';
import {useCallback, useEffect, useState} from 'react';
import {AlertTriangle, Clock, MessageCircle, RefreshCw, Router, Server, Unlink, Wifi, WifiOff} from 'lucide-react';
import {Row, money, when} from '../data';
import {Badge, FormError, Kpi, Loader2, SearchBox, Segmented, SessionExpired, api, cash} from '../ui';
import {waNumber} from './debts';

type State = 'all' | 'expired' | 'soon' | 'active' | 'unlinked';

function renewMessage(s: Row, store: string) {
  const n = waNumber(s.customer_phone);
  if (!n) return '';
  const date = s.expires_at ? new Date(s.expires_at).toLocaleDateString('ar-IQ-u-nu-latn', {timeZone: 'Asia/Baghdad', day: 'numeric', month: 'long'}) : '';
  const text = s.state === 'expired'
    ? `مرحباً ${s.customer_name || s.display_name}،\nانتهى اشتراك الإنترنت (${s.username})${date ? ' بتاريخ ' + date : ''}.\nللتجديد تواصل معنا أو زُرنا في ${store} 🌐`
    : `مرحباً ${s.customer_name || s.display_name}،\nاشتراك الإنترنت (${s.username}) ينتهي ${date ? 'بتاريخ ' + date : 'قريباً'}.\nجدّد مبكراً حتى لا ينقطع الخط — ${store} 🌐`;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export default function Isp({storeName, onExpired}: {storeName: string; onExpired: () => void}) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<State>('all');
  const [d, setD] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setD(await api('isp', {q, status: state, limit: 300})); }
    catch (e) { if (e instanceof SessionExpired) onExpired(); else setError((e as Error).message); }
    finally { setLoading(false); }
  }, [q, state, onExpired]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const s = d?.summary || {};
  const subs: Row[] = d?.subscribers || [];
  const stale = d?.last_sync ? (Date.now() - new Date(d.last_sync).getTime()) / 86400000 : null;

  return <>
    <div className="kpis">
      <Kpi label="المشتركون" value={s.total ?? 0} raw hint={`${s.unlinked ?? 0} غير مربوطين بزبون`} icon={Wifi} color="teal" onClick={() => setState('all')}/>
      <Kpi label="منتهية" value={s.expired ?? 0} raw hint="تحتاج تجديد" icon={WifiOff} color="red" onClick={() => setState('expired')}/>
      <Kpi label="تنتهي خلال 3 أيام" value={s.soon ?? 0} raw hint="ذكّرهم الآن" icon={Clock} color="amber" onClick={() => setState('soon')}/>
      <Kpi label="تجديدات معلّقة" value={d?.unresolved ?? 0} raw hint="نتيجتها غير مؤكدة" icon={AlertTriangle} color="purple"/>
    </div>

    {(d?.accounts || []).map((a: Row) => (
      <div className="info-banner isp-account" key={a.id}>
        <Server size={20}/>
        <div>
          <b>{a.name} • {a.provider} {a.active ? <Badge tone="green">مفعّل</Badge> : <Badge tone="red">موقوف</Badge>}</b>
          <p>{a.subscribers} مشترك محفوظ • آخر دخول للمزود {when(a.last_login_at)}{a.last_error ? ' • آخر خطأ: ' + a.last_error : ''}</p>
        </div>
      </div>
    ))}
    {stale !== null && stale > 2 && (
      <div className="info-banner warn-banner">
        <AlertTriangle size={20}/>
        <div><b>بيانات المشتركين قديمة (آخر مزامنة {when(d?.last_sync)})</b><p>المزامنة والتجديد يتمّان من قسم الإنترنت في برنامج المكتب. افتحه ليُحدَّث تاريخ الانتهاء هنا وتصل الإشعارات بدقة.</p></div>
      </div>
    )}

    <section className="panel module-panel">
      <div className="table-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="اسم المشترك، اسم المستخدم، أو الزبون…"/>
        <div className="table-filters">
          <Segmented value={state} onChange={setState} options={[['all', 'الكل'], ['expired', 'منتهية'], ['soon', 'قريبة'], ['active', 'فعّالة'], ['unlinked', 'غير مربوط']]}/>
          <button className="icon-button" aria-label="تحديث" onClick={load}><RefreshCw size={16} className={loading ? 'spin' : ''}/></button>
        </div>
      </div>
      {error && <FormError error={error}/>}
      <div className="table-scroll">
        <table>
          <thead><tr><th>المشترك</th><th>الباقة</th><th>الانتهاء</th><th>الحالة</th><th>الزبون والرصيد</th><th>آخر تجديد</th><th/></tr></thead>
          <tbody>
            {subs.map(r => {
              const wa = renewMessage(r, storeName);
              return (
                <tr key={r.id}>
                  <td><div className="row-name"><span className="row-avatar"><Router size={16}/></span><span><strong>{r.display_name || r.username}</strong><small dir="ltr">{r.username}</small></span></div></td>
                  <td>{r.package_name || '—'}{r.price ? <small className="muted"> • {money(r.price)}</small> : null}</td>
                  <td><span>{when(r.expires_at)}</span><br/><small className={r.state === 'expired' ? 'warning-text' : 'muted'}>{r.days_left === null ? '' : r.days_left < 0 ? `منذ ${Math.abs(r.days_left)} يوم` : r.days_left === 0 ? 'اليوم' : `بعد ${r.days_left} يوم`}</small></td>
                  <td>{r.state === 'expired' ? <Badge tone="red">منتهي</Badge> : r.state === 'soon' ? <Badge tone="amber">قريب الانتهاء</Badge> : r.state === 'active' ? <Badge tone="green">فعّال</Badge> : <Badge tone="amber">غير معروف</Badge>}</td>
                  <td>{r.customer_id ? <span><b>{r.customer_name}</b><br/><small className={Number(r.customer_balance) > 0 ? 'warning-text' : 'muted'}>{Number(r.customer_balance) > 0 ? 'عليه ' + money(r.customer_balance) : 'لا دين'}</small></span> : <span className="muted"><Unlink size={14}/> غير مربوط</span>}</td>
                  <td>{r.last_renewal ? <span>{cash(r.last_renewal.price)}<br/><small className="muted">{when(r.last_renewal.at)}</small></span> : '—'}</td>
                  <td>{wa ? <a className="icon-button wa" href={wa} target="_blank" rel="noopener noreferrer" aria-label={'تذكير واتساب ' + (r.display_name || r.username)}><MessageCircle size={17}/></a> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && !subs.length && <div className="empty"><Wifi size={30}/><h3>لا يوجد مشتركون هنا</h3><p>المشتركون يُضافون عند ربطهم من قسم الإنترنت في برنامج المكتب.</p></div>}
        {loading && !d && <p className="muted" style={{padding: 20}}><Loader2 size={15} className="spin"/> جارٍ التحميل…</p>}
      </div>
      <div className="table-footer"><span>{subs.length} مشترك</span><span>إشعار تلقائي قبل الانتهاء بـ3 أيام وعند الانتهاء</span></div>
    </section>
  </>;
}
