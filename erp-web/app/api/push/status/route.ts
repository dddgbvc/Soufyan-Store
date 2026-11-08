import {caller,configured,db,json} from '../../../../lib/push/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const who=await caller(req);if(!who)return json({error:'sign_in_required'},401);
 if(!configured())return json({configured:false,devices:[],history:[]});
 const where=who.service?'':' WHERE user_id=?';const q=db().prepare('SELECT id,device_name,created_at,updated_at FROM push_subscriptions'+where+' ORDER BY created_at DESC LIMIT 20');
 const devices=await (who.service?q:q.bind(who.userId)).all();
 // Shared dispatches are visible to the sole owner; this Site remains owner-private.
 const h=db().prepare("SELECT id,title,body,created_at,status,accepted,failed,expired FROM push_sends WHERE scope=? OR scope='service' ORDER BY created_at DESC LIMIT 10").bind(who.userId||'service');
 return json({configured:true,devices:devices.results,history:(await h.all()).results});
}
