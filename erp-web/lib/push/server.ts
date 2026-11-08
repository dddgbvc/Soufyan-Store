import {env} from 'cloudflare:workers';
import {readStatus,serviceRpc} from '../yaqoot/server';
export const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
// التخزين في Supabase (جداول web_push_*) عبر دوال service_role — لا حاجة لقاعدة Cloudflare D1.
export function configured(){const e=env as unknown as Record<string,string|undefined>;return !!(e.SUPABASE_URL&&e.SUPABASE_SERVICE_ROLE_KEY&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT)}
export type PushDevice={id:string;endpoint:string;p256dh:string;auth:string;device_name:string;created_at:number;updated_at:number};
export const pushStore={
 devices:(user:string)=>serviceRpc<PushDevice[]>('web_push_devices',{p_user:user}),
 subscribe:(id:string,user:string,endpoint:string,p256dh:string,auth:string,device:string)=>serviceRpc<{ok:boolean;reason?:string}>('web_push_subscribe',{p_id:id,p_user:user,p_endpoint:endpoint,p_p256dh:p256dh,p_auth:auth,p_device:device}),
 unsubscribe:(id:string,user:string)=>serviceRpc('web_push_unsubscribe',{p_id:id,p_user:user}),
 removeExpired:(id:string)=>serviceRpc('web_push_remove_expired',{p_id:id}),
 history:(scope:string)=>serviceRpc<unknown[]>('web_push_history',{p_scope:scope}),
 claim:(id:string,scope:string,title:string,body:string)=>serviceRpc<{ok:boolean;replayed?:boolean;reason?:string;[k:string]:unknown}>('web_push_send_claim',{p_id:id,p_scope:scope,p_title:title,p_body:body}),
 update:(id:string,status:string|null,accepted:number,failed:number,expired:number)=>serviceRpc('web_push_send_update',{p_id:id,p_status:status,p_accepted:accepted,p_failed:failed,p_expired:expired}),
};
export function sameOrigin(req:Request){const origin=req.headers.get('Origin');return !origin||origin===new URL(req.url).origin}
// هوية الإشعارات = الموظف صاحب الجلسة الحالية (حساب المحل + PIN).
// أُزيل مسار الخدمة القديم المعتمد على رأس X-Yaqoot-Operation لأنه لم يكن مصادقة.
export async function caller(req:Request):Promise<{userId:string;service:false;admin:boolean;permissions:string[]}|null>{
 try{const s=await readStatus(req);if(s.state!=='active')return null;return {userId:'emp:'+s.employee.id,service:false,admin:s.employee.role==='ADMIN',permissions:s.permissions}}catch{return null}
}
export async function parseBody(req:Request){if(!req.headers.get('Content-Type')?.includes('application/json'))throw new Error('invalid_content_type');const text=await req.text();if(text.length>6000)throw new Error('body_too_large');return JSON.parse(text)}
