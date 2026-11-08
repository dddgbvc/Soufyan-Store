export type Subscription={endpoint:string;keys:{p256dh:string;auth:string}};
export function validEndpoint(value:unknown):value is string{
 if(typeof value!=='string'||value.length>2048)return false;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&(
 u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.apple.com')||u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.notify.windows.com'))}catch{return false}
}
export function validSubscription(value:any):value is Subscription{
 if(!value||!validEndpoint(value.endpoint))return false;
 try{const {p256dh,auth}=value.keys||{};
 if(!/^[A-Za-z0-9_-]{87}$/.test(p256dh)||!/^[A-Za-z0-9_-]{22}$/.test(auth))return false;
 return atob(p256dh.replace(/-/g,'+').replace(/_/g,'/'))[0].charCodeAt(0)===4;
 }catch{return false}
}
export function validTestMessage(value:any):value is {requestId:string;title:string;body:string}{
 return !!value&&typeof value.requestId==='string'&&/^[A-Za-z0-9_-]{16,80}$/.test(value.requestId)&&typeof value.title==='string'&&value.title.trim().length>0&&value.title.length<=80&&typeof value.body==='string'&&value.body.trim().length>0&&value.body.length<=300;
}
export async function sha256(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}
