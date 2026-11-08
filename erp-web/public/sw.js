/* No page caching: authentication and ERP data remain network/current-device owned. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const title=typeof data.title==='string'?data.title:'ياقوت ERP';
 const body=typeof data.body==='string'?data.body:'لديك إشعار جديد من ياقوت.';
 // Always show a user-visible notification; do not fetch an authenticated page here.
 event.waitUntil(self.registration.showNotification(title,{body,dir:'rtl',lang:'ar',icon:'/icons/icon-192.png',badge:'/icons/badge-96.png',tag:typeof data.tag==='string'?data.tag:undefined,data:{url:'/#alerts'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const url=new URL('/#alerts',self.location.origin).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const win of windows){if(new URL(win.url).origin===self.location.origin){await win.navigate(url);return win.focus()}}
  return self.clients.openWindow(url);
 })());
});
