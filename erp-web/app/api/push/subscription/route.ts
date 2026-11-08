import {caller,configured,db,json,parseBody,sameOrigin} from '../../../../lib/push/server';
import {sha256,validEndpoint,validSubscription} from '../../../../lib/push/validation';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const user=await caller(req);if(!user)return json({error:'sign_in_required'},401);
 if(!sameOrigin(req))return json({error:'origin_not_allowed'},403);
 if(!configured())return json({error:'push_not_configured'},503);
 try{const body=await parseBody(req);if(!validSubscription(body.subscription))return json({error:'invalid_subscription'},400);
 const s=body.subscription,id=await sha256(s.endpoint),now=Date.now();const database=db();
 const existing=await database.prepare('SELECT user_id FROM push_subscriptions WHERE id=?').bind(id).first<{user_id:string}>();
 if(existing&&existing.user_id!==user.userId)return json({error:'subscription_owner_mismatch'},403);
 const count=await database.prepare('SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id=?').bind(user.userId).first<{count:number}>();
 if(!existing&&(count?.count||0)>=20)return json({error:'too_many_devices'},429);
 const device=typeof body.deviceName==='string'?body.deviceName.trim().slice(0,80):'جهاز';
 await database.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,device_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,device_name=excluded.device_name,updated_at=excluded.updated_at WHERE user_id=excluded.user_id').bind(id,user.userId,s.endpoint,s.keys.p256dh,s.keys.auth,device||'جهاز',now,now).run();
 return json({registered:true,id,deviceName:device});
 }catch{return json({error:'subscription_save_failed'},400)}
}
export async function DELETE(req:Request){
 const user=await caller(req);if(!user)return json({error:'sign_in_required'},401);if(!sameOrigin(req))return json({error:'origin_not_allowed'},403);
 try{const body=await parseBody(req);if(!validEndpoint(body.endpoint))return json({error:'invalid_endpoint'},400);await db().prepare('DELETE FROM push_subscriptions WHERE id=? AND user_id=?').bind(await sha256(body.endpoint),user.userId).run();return json({removed:true})}catch{return json({error:'subscription_remove_failed'},400)}
}
