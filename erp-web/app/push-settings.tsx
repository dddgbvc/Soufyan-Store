'use client';
import {useEffect,useRef,useState} from 'react';
import {Bell,BellOff,Check,RefreshCw,Smartphone,AlertCircle,Send} from 'lucide-react';
import {PrefsEditor,type Prefs} from './views/notifications';
type Device={id:string;device_name:string};
type History={id:string;title:string;created_at:number;status:string;accepted:number;failed:number;expired:number};
const messages:Record<string,string>={sign_in_required:'سجّل الدخول إلى التطبيق أولاً.',push_not_configured:'خدمة الإشعارات غير جاهزة بعد.',subscription_save_failed:'تعذر حفظ تسجيل الجهاز. حاول مرة أخرى.',no_registered_devices:'فعّل الإشعارات على جهازك أولاً.',too_many_devices:'وصلت إلى الحد الأقصى للأجهزة المسجلة.',subscription_remove_failed:'تعذر إلغاء التسجيل على الخادم. حاول مرة أخرى.'};
async function api<T=Record<string,unknown>>(path:string,init?:RequestInit){const res=await fetch('/api/push/'+path,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...init?.headers}});if(res.headers.get('content-type')?.includes('application/json')){const d=await res.json() as T&{error?:string};if(!res.ok)throw new Error(messages[d.error||'']||'تعذر إكمال الطلب. أعد المحاولة.');return d}throw new Error('انتهت جلسة الدخول. افتح التطبيق وسجّل الدخول مجدداً.')}
function keyBytes(key:string){return Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(key.length/4)*4,'=')),c=>c.charCodeAt(0))}
async function endpointId(endpoint:string){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint));return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join('')}
function AutoPrefs({permissions}:{permissions:string[]}){
 const [prefs,setPrefs]=useState<Prefs|null>(null),[busy,setBusy]=useState(''),[err,setErr]=useState('');
 useEffect(()=>{api<{prefs:Prefs}>('prefs').then(d=>setPrefs(d.prefs)).catch(e=>setErr((e as Error).message))},[]);
 async function change(patch:Prefs){if(!prefs)return;const before=prefs;const key=Object.keys(patch)[0];setPrefs({...prefs,...patch});setBusy(key);setErr('');
  try{const d=await api<{prefs:Prefs}>('prefs',{method:'PUT',body:JSON.stringify({prefs:patch})});setPrefs(d.prefs)}catch(e){setPrefs(before);setErr((e as Error).message)}finally{setBusy('')}}
 return <div className="auto-prefs"><div className="settings-label"><b>الإشعارات التلقائية</b><span>تصل لصندوقك دائماً، وللهاتف إذا فعّلته • حسب صلاحياتك</span></div>
  {prefs?<PrefsEditor prefs={prefs} permissions={permissions} onChange={change} busyKey={busy}/>:!err&&<p className="muted">جارٍ التحميل…</p>}
  {err&&<div className="form-error" role="alert"><AlertCircle size={16}/>{err}</div>}</div>
}
export function PushSettings({permissions=[]}:{permissions?:string[]}){
 const [supported,setSupported]=useState(false),[installNeeded,setInstallNeeded]=useState(false),[permission,setPermission]=useState<NotificationPermission>('default'),[publicKey,setPublicKey]=useState(''),[busy,setBusy]=useState(true),[registered,setRegistered]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[devices,setDevices]=useState<Device[]>([]),[history,setHistory]=useState<History[]>([]);
 const registration=useRef<ServiceWorkerRegistration|null>(null);
 const [testing,setTesting]=useState(false);
 async function test(){setError('');setNote('');setTesting(true);try{const requestId=Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');const r=await api<{accepted:number}>('send',{method:'POST',body:JSON.stringify({requestId,title:'ياقوت | إشعار تجريبي',body:'وصل إشعار التجربة ✅ الإشعارات التلقائية تعمل على هذا الجهاز.'})});setNote(r.accepted?'أُرسل الإشعار التجريبي. يفترض أن يظهر خلال ثوانٍ.':'لم تقبل خدمة الدفع الإرسال. أعد تفعيل الإشعارات على الجهاز.');await refresh()}catch(e){setError((e as Error).message)}finally{setTesting(false)}}
 async function refresh(){setError('');setBusy(true);try{
  const c=await api<{publicKey:string;configured:boolean}>('config');setPublicKey(c.publicKey||'');if(!c.configured)throw new Error('خدمة الإشعارات غير جاهزة بعد.');
  const s=await api<{devices:Device[];history:History[]}>('status');setDevices(s.devices||[]);setHistory(s.history||[]);
  if('Notification'in window)setPermission(Notification.permission);
  if('serviceWorker'in navigator&&'PushManager'in window){const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});registration.current=reg;const sub=await reg.pushManager.getSubscription();const id=sub?await endpointId(sub.endpoint):null;setRegistered(!!id&&s.devices.some((d:Device)=>d.id===id))}
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 useEffect(()=>{const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;setInstallNeeded(ios&&!standalone);setSupported(window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window);refresh()},[]);
 async function enable(){
  if(!supported||installNeeded||!publicKey||busy)return;
  setError('');setNote('');setBusy(true);
  try{
   // Keep the permission request directly inside the user's tap for iOS.
   const allowed=await Notification.requestPermission();setPermission(allowed);
   if(allowed!=='granted'){setNote(allowed==='denied'?'الإشعارات مرفوضة. اسمح بها من إعدادات الآيفون ← الإشعارات ← ياقوت.':'لم تُمنح الصلاحية بعد. يمكنك المحاولة لاحقاً.');return}
   const reg=registration.current||await navigator.serviceWorker.register('/sw.js',{scope:'/'});
   // Wait for this registration to activate, bounded so the UI never spins forever.
   if(!reg.active)await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('تأخر تجهيز الإشعارات. أعد فتح التطبيق وحاول مجدداً.')),12000))]);
   const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
   const deviceName=/iPhone/.test(navigator.userAgent)?'iPhone':/iPad/.test(navigator.userAgent)?'iPad':/Android/.test(navigator.userAgent)?'Android':'متصفح الكمبيوتر';
   await api('subscription',{method:'POST',body:JSON.stringify({subscription:sub.toJSON(),deviceName})});setRegistered(true);setNote('تم تفعيل الإشعارات على هذا الجهاز. جرّبها بزر «إرسال إشعار تجريبي».');await refresh();
  }catch(e){setError((e as Error).message||'تعذر تفعيل الإشعارات.')}finally{setBusy(false)}
 }
 async function disable(){setError('');setNote('');setBusy(true);try{const reg=registration.current||await navigator.serviceWorker.getRegistration('/');const sub=await reg?.pushManager.getSubscription();if(sub){await api('subscription',{method:'DELETE',body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe()}setRegistered(false);setNote('أُوقفت إشعارات هذا الجهاز.');await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="panel settings-card span-two push-settings"><div className="push-heading"><div className="push-symbol"><Bell size={25}/></div><div><h3>إشعارات ياقوت على جهازك</h3><p>فواتير، نواقص، صيانة جاهزة وتقارير دورية — حتى والتطبيق مغلق.</p></div><span className={'badge '+(registered?'green':'amber')}>{registered?'مفعّلة على هذا الجهاز':'غير مفعّلة'}</span></div>
 {installNeeded&&<div className="info-banner"><Smartphone size={22}/><div><b>أضف ياقوت إلى الشاشة الرئيسية أولاً</b><p>من Safari: مشاركة ← إضافة إلى الشاشة الرئيسية ← فتح كتطبيق ويب. ثم افتح أيقونة ياقوت وارجع إلى هذه الصفحة.</p></div></div>}
 {!supported&&!installNeeded&&<div className="info-banner"><AlertCircle size={20}/><p>هذا المتصفح لا يتيح إشعارات الويب هنا. افتح التطبيق المضاف للشاشة الرئيسية على الآيفون، أو متصفحاً يدعم الإشعارات.</p></div>}
 <div className="push-actions">{registered?<button className="button secondary" disabled={busy} onClick={disable}><BellOff size={17}/>إيقاف إشعارات هذا الجهاز</button>:<button className="button primary" disabled={busy||!supported||installNeeded||!publicKey||permission==='denied'} onClick={enable}><Bell size={17}/>{permission==='denied'?'الإذن مرفوض من إعدادات الجهاز':'تفعيل الإشعارات على هذا الجهاز'}</button>}{registered&&<button className="button secondary" disabled={busy||testing} onClick={test}><Send size={16}/>{testing?'جارٍ الإرسال…':'إرسال إشعار تجريبي'}</button>}<button className="button secondary" disabled={busy} onClick={refresh}><RefreshCw size={16} className={busy?'spin':''}/>تحديث الحالة</button><span className="muted">{devices.length} أجهزة مسجلة</span></div>
 {permission==='denied'&&<p className="push-help">اسمح بالإشعارات من إعدادات الآيفون ← الإشعارات ← ياقوت، ثم اضغط «تحديث الحالة».</p>}
 {error&&<div className="form-error" role="alert"><AlertCircle size={17}/>{error}</div>}{note&&<div className="push-note" role="status"><Check size={17}/>{note}</div>}
 <AutoPrefs permissions={permissions}/>
 <p className="push-help">الفحص كل دقيقة على الخادم. يلزم اتصال بالإنترنت، وقد تؤثر إعدادات التركيز (Focus) على ظهور التنبيه.</p>
 <div className="push-history"><h3>سجل الإشعارات التجريبية</h3>{!history.length?<p>لم تُرسل إشعارات تجريبية بعد.</p>:history.map(h=><div className="push-history-row" key={h.id}><span><b>{h.title}</b><small>{new Date(h.created_at).toLocaleString('ar-IQ',{timeZone:'Asia/Baghdad'})}</small></span><span className={'badge '+(h.accepted?'green':'amber')}>{h.status==='sending'?'قيد الإرسال':h.accepted?`قبلت خدمة الدفع ${h.accepted} إشعار`:'لم تقبل خدمة الدفع الإرسال'}</span></div>)}<p>قبول خدمة الدفع للرسالة لا يؤكد ظهورها أو قراءتها على الجهاز.</p></div></section>
}
