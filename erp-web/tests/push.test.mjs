import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createECDH,randomBytes} from 'node:crypto';
import webpush from 'web-push';
import {validEndpoint,validSubscription,validTestMessage} from '../lib/push/validation.ts';
const require=createRequire(import.meta.url);
const ece=createRequire(require.resolve('web-push'))('http_ece');
test('push endpoint validation blocks local and deceptive destinations',()=>{
 for(const x of ['http://web.push.apple.com/a','https://localhost/a','https://127.0.0.1/a','https://web.push.apple.com.evil.test/a','https://evil.test/?x=web.push.apple.com','https://user@web.push.apple.com/a','https://web.push.apple.com:8443/a'])assert.equal(validEndpoint(x),false,x);
 for(const x of ['https://web.push.apple.com/a','https://fcm.googleapis.com/fcm/send/a','https://updates.push.services.mozilla.com/wpush/v2/a'])assert.equal(validEndpoint(x),true,x);
});
test('subscriptions and test messages reject invalid fields',()=>{
 assert.equal(validSubscription({endpoint:'https://web.push.apple.com/x',keys:{p256dh:'x',auth:'x'}}),false);
 assert.equal(validTestMessage({requestId:'test_012345678901',title:'ياقوت',body:'تجربة'}),true);
 assert.equal(validTestMessage({requestId:'short',title:'ياقوت',body:'تجربة'}),false);
 assert.equal(validTestMessage({requestId:'test_012345678901',title:'ياقوت',body:'x'.repeat(301)}),false);
});
test('Arabic push payload encrypts and decrypts without network',()=>{
 const receiver=createECDH('prime256v1');receiver.generateKeys();const auth=randomBytes(16);
 const sub={endpoint:'https://web.push.apple.com/test-only',keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:auth.toString('base64url')}};
 assert.equal(validSubscription(sub),true);
 const data=JSON.stringify({title:'ياقوت',body:'إشعار تجريبي لمكتب سفيان'});
 const keys=webpush.generateVAPIDKeys();
 const req=webpush.generateRequestDetails(sub,data,{contentEncoding:'aes128gcm',vapidDetails:{...keys,subject:'https://example.com'}});
 assert.equal(req.headers['Content-Encoding'],'aes128gcm');
 assert.match(req.headers.Authorization,/^vapid /);
 assert.equal(ece.decrypt(req.body,{version:'aes128gcm',privateKey:receiver,authSecret:auth}).toString(),data);
});
test('service worker displays visible Arabic notification and ignores external click URLs',async()=>{
 const handlers={};let shown,opened,closed=false,pending;
 const self={location:{origin:'https://example.com'},addEventListener:(n,f)=>handlers[n]=f,registration:{showNotification:async(...x)=>{shown=x}},clients:{matchAll:async()=>[],openWindow:async u=>{opened=u}}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL});
 handlers.push({data:{json:()=>({title:'ياقوت',body:'تجربة',url:'https://evil.test'})},waitUntil:p=>pending=p});await pending;
 assert.equal(shown[0],'ياقوت');assert.equal(shown[1].dir,'rtl');assert.equal(shown[1].data.url,'/');
 handlers.notificationclick({notification:{close:()=>closed=true,data:{url:'https://evil.test'}},waitUntil:p=>pending=p});await pending;
 assert.equal(closed,true);assert.equal(opened,'https://example.com/');
 handlers.push({data:{json:()=>({title:'فاتورة',body:'x',url:'/#invoices'})},waitUntil:p=>pending=p});await pending;assert.equal(shown[1].data.url,'/#invoices');
 handlers.notificationclick({notification:{close:()=>{},data:{url:'/#invoices'}},waitUntil:p=>pending=p});await pending;assert.equal(opened,'https://example.com/#invoices');
 handlers.push({data:{json:()=>{throw Error('bad json')}},waitUntil:p=>pending=p});await pending;assert.equal(shown[0],'ياقوت ERP');
});

test('test bursts are bounded and start five seconds apart without real waits',async()=>{
 const {validSeriesCount,runPushSeries}=await import('../lib/push/series.ts');
 for(const n of [undefined,1,5])assert.equal(validSeriesCount(n),true);
 for(const n of [0,6,-1,2.5,'5',null])assert.equal(validSeriesCount(n),false);
 let time=0;const starts=[];
 await runPushSeries(5,async i=>{starts.push([i,time]);time+=200},{now:()=>time,sleep:async ms=>{time+=ms}});
 assert.deepEqual(starts,[[1,0],[2,5000],[3,10000],[4,15000],[5,20000]]);
});
