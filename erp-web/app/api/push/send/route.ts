import {env} from 'cloudflare:workers';
import webpush from 'web-push';
import {caller,configured,db,json,parseBody,sameOrigin} from '../../../../lib/push/server';
import {validEndpoint,validTestMessage} from '../../../../lib/push/validation';
import {runPushSeries,validSeriesCount} from '../../../../lib/push/series';
export const dynamic='force-dynamic';
type Device={id:string;endpoint:string;p256dh:string;auth:string};
export async function POST(req:Request){
 const who=await caller(req);if(!who)return json({error:'sign_in_required'},401);
 if(!sameOrigin(req))return json({error:'origin_not_allowed'},403);
 if(!configured())return json({error:'push_not_configured'},503);
 let message;try{message=await parseBody(req)}catch{return json({error:'invalid_json'},400)}
 const count=message?.count??1;
 if(!validSeriesCount(message?.count))return json({error:'invalid_count'},400);
 if(count>1&&!who.admin)return json({error:'owner_required'},403);
 if(!validTestMessage(message))return json({error:'invalid_message'},400);
 const database=db(),scope=who.userId||'service';
 const previous=await database.prepare('SELECT id,status,accepted,failed,expired FROM push_sends WHERE id=? AND scope=?').bind(message.requestId,scope).first();
 if(previous)return json({replayed:true,...previous});
 const query=database.prepare('SELECT id,endpoint,p256dh,auth FROM push_subscriptions'+(who.service?'':' WHERE user_id=?')+' LIMIT 20');
 const devices=(await (who.service?query:query.bind(who.userId)).all<Device>()).results;
 if(!devices.length)return json({error:'no_registered_devices',message:'فعّل الإشعارات من التطبيق على جهازك أولاً.'},409);
 const inserted=await database.prepare("INSERT OR IGNORE INTO push_sends(id,scope,title,body,created_at,status,accepted,failed,expired) SELECT ?,?,?,?,?,'sending',0,0,0 WHERE NOT EXISTS(SELECT 1 FROM push_sends WHERE scope=? AND (created_at>? OR (status='sending' AND created_at>?)))").bind(message.requestId,scope,message.title,message.body,Date.now(),scope,Date.now()-30000,Date.now()-120000).run();
 if(!inserted.meta.changes)return json({error:'duplicate_or_rate_limited',message:'انتظر 30 ثانية بين التجارب.'},429);
 let accepted=0,failed=0,expired=0;
 const expiredDevices=new Set<string>();
 const rounds:{index:number;startedAt:number;accepted:number;failed:number;expired:number;errors:unknown[]}[]=[];
 await runPushSeries(count,async index=>{
 const round={index,startedAt:Date.now(),accepted:0,failed:0,expired:0,errors:[] as unknown[]};
 await Promise.all(devices.map(async device=>{
  if(expiredDevices.has(device.id)){round.expired++;return}
  if(!validEndpoint(device.endpoint)){round.failed++;return}
  let stage='encryption';
  try{
   const details=webpush.generateRequestDetails({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth}},JSON.stringify({title:count>1?`${message.title} (${index}/${count})`:message.title,body:message.body,tag:count>1?`${message.requestId}-${index}`:message.requestId,url:'/#alerts'}),{TTL:3600,urgency:'high',contentEncoding:'aes128gcm',vapidDetails:{subject:env.VAPID_SUBJECT!,publicKey:env.VAPID_PUBLIC_KEY!,privateKey:env.VAPID_PRIVATE_KEY!}});
   stage='delivery';
   const response=await fetch(details.endpoint,{method:'POST',headers:details.headers as Record<string,string>,body:new Uint8Array(details.body!) as BodyInit,redirect:'manual',signal:AbortSignal.timeout(10000)});
   if(response.ok)round.accepted++;
   else if(response.status===404||response.status===410){round.expired++;expiredDevices.add(device.id);await database.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(device.id).run()}
   else {round.failed++;let reason='';try{const result=await response.json() as {reason?:string};reason=typeof result.reason==='string'?result.reason.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80):''}catch{}round.errors.push({stage,status:response.status,reason})}
  }catch(error){round.failed++;let detail=error instanceof Error?error.message:'unknown_error';for(const secret of [env.VAPID_PRIVATE_KEY,env.VAPID_PUBLIC_KEY,device.endpoint,device.p256dh,device.auth])if(secret)detail=detail.split(secret).join('[redacted]');round.errors.push({stage,name:error instanceof Error?error.name:'Error',detail:detail.slice(0,180)})}
 }));
 accepted+=round.accepted;failed+=round.failed;expired+=round.expired;rounds.push(round);
 await database.prepare('UPDATE push_sends SET accepted=?,failed=?,expired=? WHERE id=?').bind(accepted,failed,expired,message.requestId).run();
 });
 const status=accepted===devices.length*count?'accepted':accepted>0?'partial':'failed';
 await database.prepare('UPDATE push_sends SET status=?,accepted=?,failed=?,expired=? WHERE id=?').bind(status,accepted,failed,expired,message.requestId).run();
 return json({id:message.requestId,status,accepted,failed,expired,total:devices.length*count,count,intervalMs:5000,rounds,message:'القبول يعني قبول خدمة الدفع للرسالة، وليس تأكيد ظهورها على الجهاز.'});
}
