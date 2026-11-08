import {caller,configured,json,parseBody,pushStore,sameOrigin} from '../../../../lib/push/server';
import {sha256,validEndpoint,validSubscription} from '../../../../lib/push/validation';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const user=await caller(req);if(!user)return json({error:'sign_in_required'},401);
 if(!sameOrigin(req))return json({error:'origin_not_allowed'},403);
 if(!configured())return json({error:'push_not_configured'},503);
 try{const body=await parseBody(req);if(!validSubscription(body.subscription))return json({error:'invalid_subscription'},400);
 const s=body.subscription,id=await sha256(s.endpoint);
 const device=typeof body.deviceName==='string'?body.deviceName.trim().slice(0,80):'جهاز';
 const r=await pushStore.subscribe(id,user.userId,s.endpoint,s.keys.p256dh,s.keys.auth,device||'جهاز');
 if(!r.ok)return json({error:r.reason||'subscription_save_failed'},r.reason==='too_many_devices'?429:403);
 return json({registered:true,id,deviceName:device});
 }catch{return json({error:'subscription_save_failed'},400)}
}
export async function DELETE(req:Request){
 const user=await caller(req);if(!user)return json({error:'sign_in_required'},401);if(!sameOrigin(req))return json({error:'origin_not_allowed'},403);
 try{const body=await parseBody(req);if(!validEndpoint(body.endpoint))return json({error:'invalid_endpoint'},400);await pushStore.unsubscribe(await sha256(body.endpoint),user.userId);return json({removed:true})}catch{return json({error:'subscription_remove_failed'},400)}
}
