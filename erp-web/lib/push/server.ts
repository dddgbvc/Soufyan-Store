import {env} from 'cloudflare:workers';
import {readStatus} from '../yaqoot/server';
export const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function db(){if(!env.DB)throw new Error('push_database_unavailable');return env.DB}
export function configured(){return !!(env.DB&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT)}
export function sameOrigin(req:Request){const origin=req.headers.get('Origin');return !origin||origin===new URL(req.url).origin}
// هوية الإشعارات = الموظف صاحب الجلسة الحالية (حساب المحل + PIN).
// أُزيل مسار الخدمة القديم المعتمد على رأس X-Yaqoot-Operation لأنه لم يكن مصادقة.
export async function caller(req:Request):Promise<{userId:string;service:false;admin:boolean}|null>{
 try{const s=await readStatus(req);if(s.state!=='active')return null;return {userId:'emp:'+s.employee.id,service:false,admin:s.employee.role==='ADMIN'}}catch{return null}
}
export async function parseBody(req:Request){if(!req.headers.get('Content-Type')?.includes('application/json'))throw new Error('invalid_content_type');const text=await req.text();if(text.length>6000)throw new Error('body_too_large');return JSON.parse(text)}
