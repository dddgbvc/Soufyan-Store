'use client';
import {useEffect,useRef,useState} from 'react';
import {Bell,BellOff,Check,RefreshCw,Smartphone,AlertCircle} from 'lucide-react';
type Device={id:string;device_name:string};
type History={id:string;title:string;created_at:number;status:string;accepted:number;failed:number;expired:number};
const messages:Record<string,string>={sign_in_required:'سجّل الدخول إلى التطبيق أولاً.',push_not_configured:'خدمة الإشعارات غير جاهزة بعد.',subscription_save_failed:'تعذر حفظ تسجيل الجهاز. حاول مرة أخرى.',no_registered_devices:'فعّل الإشعارات على جهازك أولاً.',too_many_devices:'وصلت إلى الحد الأقصى للأجهزة المسجلة.',subscription_remove_failed:'تعذر إلغاء التسجيل على الخادم. حاول مرة أخرى.'};
async function api<T=Record<string,unknown>>(path:string,init?:RequestInit){const res=await fetch('/api/push/'+path,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...init?.headers}});if(res.headers.get('content-type')?.includes('application/json')){const d=await res.json() as T&{error?:string};if(!res.ok)throw new Error(messages[d.error||'']||'تعذر إكمال الطلب. أعد المحاولة.');return d}throw new Error('انتهت جلسة الدخول. افتح التطبيق وسجّل الدخول مجدداً.')}
function keyBytes(key:string){return Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(key.length/4)*4,'=')),c=>c.charCodeAt(0))}
async function endpointId(endpoint:string){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint));return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join('')}
export function PushSettings(){
 const [supported,setSupported]=useState(false),[installNeeded,setInstallNeeded]=useState(false),[permission,setPermission]=useState<NotificationPermission>('default'),[publicKey,setPublicKey]=useState(''),[busy,setBusy]=useState(true),[registered,setRegistered]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[devices,setDevices]=useState<Device[]>([]),[history,setHistory]=useState<History[]>([]);
 const registration=useRef<ServiceWorkerRegistration|null>(null);
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
   await api('subscription',{method:'POST',body:JSON.stringify({subscription:sub.toJSON(),deviceName})});setRegistered(true);setNote('تم تفعيل الإشعارات على هذا الجهاز. ارجع للمحادثة وقل: دز إشعار للتجربة.');await refresh();
  }catch(e){setError((e as Error).message||'تعذر تفعيل الإشعارات.')}finally{setBusy(false)}
 }
 async function disable(){setError('');setNote('');setBusy(true);try{const reg=registration.current||await navigator.serviceWorker.getRegistration('/');const sub=await reg?.pushManager.getSubscription();if(sub){await api('subscription',{method:'DELETE',body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe()}setRegistered(false);setNote('أُوقفت إشعارات هذا الجهاز.');await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="panel settings-card span-two push-settings"><div className="push-heading"><div className="push-symbol"><Bell size={25}/></div><div><h3>إشعارات ياقوت على جهازك</h3><p>استقبل إشعار التجربة حتى عندما يكون التطبيق مغلقاً.</p></div><span className={'badge '+(registered?'green':'amber')}>{registered?'مفعّلة على هذا الجهاز':'غير مفعّلة'}</span></div>
 {installNeeded&&<div className="info-banner"><Smartphone size={22}/><div><b>أضف ياقوت إلى الشاشة الرئيسية أولاً</b><p>من Safari: مشاركة ← إضافة إلى الشاشة الرئيسية ← فتح كتطبيق ويب. ثم افتح أيقونة ياقوت وارجع إلى هذه الصفحة.</p></div></div>}
 {!supported&&!installNeeded&&<div className="info-banner"><AlertCircle size={20}/><p>هذا المتصفح لا يتيح إشعارات الويب هنا. افتح التطبيق المضاف للشاشة الرئيسية على الآيفون، أو متصفحاً يدعم الإشعارات.</p></div>}
 <div className="push-actions">{registered?<button className="button secondary" disabled={busy} onClick={disable}><BellOff size={17}/>إيقاف إشعارات هذا الجهاز</button>:<button className="button primary" disabled={busy||!supported||installNeeded||!publicKey||permission==='denied'} onClick={enable}><Bell size={17}/>{permission==='denied'?'الإذن مرفوض من إعدادات الجهاز':'تفعيل الإشعارات على هذا الجهاز'}</button>}<button className="button secondary" disabled={busy} onClick={refresh}><RefreshCw size={16} className={busy?'spin':''}/>تحديث الحالة</button><span className="muted">{devices.length} أجهزة مسجلة</span></div>
 {permission==='denied'&&<p className="push-help">اسمح بالإشعارات من إعدادات الآيفون ← الإشعارات ← ياقوت، ثم اضغط «تحديث الحالة».</p>}
 {error&&<div className="form-error" role="alert"><AlertCircle size={17}/>{error}</div>}{note&&<div className="push-note" role="status"><Check size={17}/>{note}</div>}
 <p className="push-help">لن يُرسل إشعار تلقائياً عند التفعيل. عندما تصبح الحالة «مفعّلة»، قل في المحادثة: <b>دز إشعار للتجربة</b>. يلزم اتصال بالإنترنت، وقد تؤثر إعدادات التركيز على ظهور التنبيه.</p>
 <div className="push-history"><h3>سجل الإرسال</h3>{!history.length?<p>لم تُرسل إشعارات بعد. سجلات هذا القسم حقيقية ومستقلة عن البيانات التجريبية.</p>:history.map(h=><div className="push-history-row" key={h.id}><span><b>{h.title}</b><small>{new Date(h.created_at).toLocaleString('ar-IQ',{timeZone:'Asia/Baghdad'})}</small></span><span className={'badge '+(h.accepted?'green':'amber')}>{h.status==='sending'?'قيد الإرسال':h.accepted?`قبلت خدمة الدفع ${h.accepted} إشعار`:'لم تقبل خدمة الدفع الإرسال'}</span></div>)}<p>قبول خدمة الدفع للرسالة لا يؤكد ظهورها أو قراءتها على الجهاز.</p></div></section>
}
