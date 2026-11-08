import {caller,configured,json,pushStore} from '../../../../lib/push/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const who=await caller(req);if(!who)return json({error:'sign_in_required'},401);
 if(!configured())return json({configured:false,devices:[],history:[]});
 try{
  const [devices,history]=await Promise.all([pushStore.devices(who.userId),pushStore.history(who.userId)]);
  return json({configured:true,devices:devices.map(d=>({id:d.id,device_name:d.device_name,created_at:d.created_at,updated_at:d.updated_at})),history});
 }catch{return json({error:'push_storage_unavailable'},503)}
}
