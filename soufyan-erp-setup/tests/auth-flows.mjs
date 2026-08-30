import { chromium } from './pw.mjs';
const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';
const SESSION='11111111-2222-3333-4444-555555555555';
const TOKEN='eyJhbGciOiJIUzI1NiJ9.fake-access-token';
const USER={ id:'1504114c-71ec-4345-a1ba-7c815c71e6c4', email:'assn42357@gmail.com' };
const PROFILE={ id:USER.id, display_name:'سفيان يوسف', full_name:'سفيان يوسف', role:'ADMIN', status:'active' };
let pass=0, fail=0;
const ok=(c,m)=>{ c?pass++:fail++; console.log((c?'  PASS ':'  FAIL ')+m); };

const seen=[];
/** يردّ بالعقود نفسها التي يعيدها Supabase Auth و PostgREST على هذا المشروع. */
async function stub(page, o={}){
  await page.route('**/fonts.googleapis.com/**', r=>r.abort());
  await page.route('**/auth/v1/**', async route=>{
    const url=route.request().url(), method=route.request().method();
    const body=route.request().postData()? JSON.parse(route.request().postData()) : {};
    seen.push({url:url.split('/auth/v1/')[1].split('?')[0], method, body});
    const json=(s,b)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(b)});
    if(url.includes('/token')){
      if(o.unconfirmed) return json(400,{error_code:'email_not_confirmed',msg:'Email not confirmed'});
      return (body.email===USER.email && body.password===(o.password||'S3cret-pass'))
        ? json(200,{access_token:TOKEN, refresh_token:'rt', token_type:'bearer', expires_in:3600, user:USER})
        : json(400,{error_code:'invalid_credentials', msg:'Invalid login credentials'});
    }
    if(url.includes('/recover')) return json(200,{});          // محايد دائمًا
    if(url.includes('/user'))    return json(200,{...USER, updated_at:new Date().toISOString()});
    return json(404,{});
  });
  await page.route('**/rest/v1/profiles**', r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify(o.profile===null?[]:[o.profile||PROFILE])}));
  await page.route('**/rest/v1/rpc/**', r=>{
    const fn=r.request().url().split('/rpc/')[1].split('?')[0];
    seen.push({rpc:fn});
    if(fn==='app_session_start') return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(SESSION)});
    if(fn==='app_session_ping')  return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({ok:o.pingOk!==false})});
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
  });
}
const signIn=async(p,pw='S3cret-pass')=>{ await p.fill('#f_loginEmail',USER.email); await p.fill('#f_loginPassword',pw);
  await p.click('[data-go]'); await p.waitForTimeout(1500); };

const b=await chromium.launch({executablePath:EXE});

/* ===== 1) البوابة والبابان ===== */
console.log('\n— البوابة —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(900);
  ok(await p.textContent('#stepTitle')==='أهلًا بك','البوابة هي أول ما يظهر');
  ok(!(await p.isVisible('#phases')) && !(await p.isVisible('.s-nav')),'شريط المراحل وتذييل الإعداد مخفيان');
  await p.click('[data-door="setup"]'); await p.waitForTimeout(900);
  ok(await p.evaluate(()=>document.body.dataset.surface)==='setup','«مستخدم جديد» يفتح الإعداد');
  await ctx.close();
}

/* ===== 2) شاشة الدخول: بريد وكلمة مرور فقط ===== */
console.log('\n— شكل شاشة الدخول —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="login"]'); await p.waitForTimeout(700);
  ok(await p.isVisible('#f_loginEmail') && await p.isVisible('#f_loginPassword'),'حقلا البريد وكلمة المرور');
  ok(await p.isVisible('[data-forgot]'),'خيار «نسيت كلمة المرور؟» موجود');
  ok(await p.isVisible('[data-start]'),'وخيار «ابدأ الآن» موجود');
  const txt=(await p.textContent('main')).toLowerCase();
  const hits=(txt.match(/\bpin\b|رمز الدخول|رمز دخول|مفتاح المرور|passkey|رمز لمرّة واحدة/g)||[]);
  ok(hits.length===0,'لا ذكر لرمز الدخول ولا لمفتاح المرور في الشاشة'+(hits.length?' — وجد: '+hits.join(', '):''));
  ok((await p.$$('.otp input')).length===0,'ولا خانات رمز لمرّة واحدة');
  ok(await p.evaluate(()=>document.activeElement?.id)==='f_loginEmail','التركيز يبدأ من حقل البريد');
  ok(await p.getAttribute('#f_loginEmail','autocomplete')==='username'
     && await p.getAttribute('#f_loginPassword','autocomplete')==='current-password','قيم autocomplete صحيحة لحافظ كلمات المرور');
  // إظهار كلمة المرور
  await p.fill('#f_loginPassword','abc');
  await p.click('[data-peek="loginPassword"]');
  ok(await p.getAttribute('#f_loginPassword','type')==='text','زر الإظهار يكشف كلمة المرور');
  ok(await p.getAttribute('[data-peek="loginPassword"]','aria-pressed')==='true','ويعلن حالته لقارئ الشاشة');
  await p.click('[data-peek="loginPassword"]');
  ok(await p.getAttribute('#f_loginPassword','type')==='password','والضغط ثانية يخفيها');
  if(SHOTS) await p.screenshot({path:SHOTS+'login.png'});
  await ctx.close();
}

/* ===== 3) التحقّق والأخطاء ===== */
console.log('\n— الإدخال الخاطئ —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="login"]'); await p.waitForTimeout(700);
  ok(await p.isEnabled('[data-go]'),'زر الدخول مفعّل دائمًا — التحقّق عند الضغط');
  await p.click('[data-go]'); await p.waitForTimeout(400);
  ok(await p.isVisible('[data-err="loginEmail"]:not([hidden])')
     && await p.isVisible('[data-err="loginPassword"]:not([hidden])'),'الحقلان الفارغان يشرحان ما ينقص');
  await p.fill('#f_loginEmail','not-an-email'); await p.click('[data-go]'); await p.waitForTimeout(300);
  ok(await p.isVisible('[data-err="loginEmail"]:not([hidden])'),'بريد غير صالح ⇒ خطأ في الحقل نفسه');
  await signIn(p,'wrong-password');
  const err=await p.textContent('[data-login-err]');
  ok(err.includes('غير صحيحة'),'بيانات خاطئة ⇒ رسالة صريحة');
  ok(err.includes('رابط استرجاع'),'وتقترح المخرج الصحيح');
  ok(!/invalid_credentials|400/.test(err),'بلا تفاصيل تقنية للمستخدم');
  ok(await p.inputValue('#f_loginPassword')==='','كلمة المرور تُفرَّغ بعد الفشل');
  ok(await p.inputValue('#f_loginEmail')===USER.email,'والبريد يبقى فلا يُعاد كتابته');
  ok(await p.getAttribute('#f_loginPassword','aria-invalid')==='true','الحقل يحمل aria-invalid');
  if(SHOTS) await p.screenshot({path:SHOTS+'login-wrong.png'});
  await ctx.close();
}

/* ===== 4) دخول ناجح ===== */
console.log('\n— دخول ناجح —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="login"]'); await p.waitForTimeout(700);
  await signIn(p);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','الاسم من ملف المستخدم على الخادم');
  const tags=await p.$$eval('.perm-list li',n=>n.map(x=>x.textContent));
  ok(tags.length===12 && tags.includes('الإعدادات'),`الصلاحيات من الدور الذي أرسله الخادم (${tags.length} قسمًا)`);
  ok(seen.some(x=>x.rpc==='app_session_start'),'تُفتح جلسة تشغيل على الخادم بعد التوثيق');
  const store=await p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k);}return o;});
  const dump=JSON.stringify(store);
  ok(!dump.includes('S3cret-pass'),'كلمة المرور لا تُكتب في المتصفح');
  ok(!dump.includes(TOKEN) && !/access_token|refresh_token/.test(dump),'ولا رمز وصول ولا رمز تحديث');
  ok(dump.includes(SESSION),'المحفوظ مؤشّر الجلسة الذي أصدره الخادم');
  if(SHOTS) await p.screenshot({path:SHOTS+'erp.png'});
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','الجلسة تُستأنف بعد تحديث الصفحة');
  ok(seen.some(x=>x.rpc==='app_session_ping'),'والاستئناف يسأل الخادم أولًا');
  ok(errs.length===0,'بلا أخطاء JavaScript: '+errs.join(' | '));
  await ctx.close();
}

/* ===== 5) الخروج وتبديل المستخدم ===== */
console.log('\n— الخروج والتبديل —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="login"]'); await p.waitForTimeout(700);
  await signIn(p);
  await p.evaluate(()=>{ SetupState.set('storeData','storeName','مركز سفيان'); SetupState.saveNow(); });
  await p.click('[data-logout]'); await p.waitForTimeout(400);
  await p.click('.modal [data-act="1"]'); await p.waitForTimeout(900);
  ok(await p.textContent('#stepTitle')==='أهلًا بك','الخروج يعيد إلى البوابة');
  const keys=await p.evaluate(()=>Object.keys(localStorage));
  ok(keys.includes('soufyan.erp.setup.v1'),'حالة الإعداد لم تُمسّ');
  ok(!keys.includes('soufyan.erp.session.v1'),'والجلسة وحدها مُسحت');
  ok(seen.some(x=>x.rpc==='app_session_end'),'والجلسة أُنهيت على الخادم');
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  await signIn(p);
  await p.click('[data-switch]'); await p.waitForTimeout(900);
  ok(await p.textContent('#stepTitle')==='من يستلم الجهاز؟','تبديل المستخدم يفتح الدخول بلا إعداد');
  await ctx.close();
}

/* ===== 6) نسيت كلمة المرور ===== */
console.log('\n— نسيت كلمة المرور —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="login"]'); await p.waitForTimeout(700);
  await p.fill('#f_loginEmail', USER.email);
  await p.click('[data-forgot]'); await p.waitForTimeout(800);
  ok(await p.inputValue('#f_recEmail')===USER.email,'البريد المكتوب ينتقل معك بلا إعادة كتابة');
  await p.fill('#f_recEmail','nobody@example.com');
  await p.click('[data-send]'); await p.waitForTimeout(900);
  const body=await p.textContent('.step-body');
  ok((await p.textContent('#stepTitle'))==='تحقّق من بريدك','الإرسال يقود إلى شاشة تأكيد');
  ok(body.includes('إن كان هذا البريد مسجَّلًا') || (await p.textContent('.lede')).includes('إن كان هذا البريد مسجَّلًا'),
     'الردّ محايد: لا يكشف إن كان البريد مسجَّلًا أم لا');
  const rec=seen.filter(x=>x.url==='recover');
  ok(rec.length===1,'طلب استرجاع واحد أُرسل إلى الخادم');
  if(SHOTS) await p.screenshot({path:SHOTS+'recover-sent.png'});
  await p.click('[data-back]'); await p.waitForTimeout(800);
  ok(await p.isVisible('#f_loginPassword'),'الرجوع يعيد إلى شاشة الدخول');
  await ctx.close();
}

/* ===== 7) رابط الاسترجاع: كلمة مرور جديدة ===== */
console.log('\n— رابط الاسترجاع —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL+`#access_token=${TOKEN}&type=recovery&expires_in=3600`,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1600);
  ok(await p.textContent('#stepTitle')==='اختر كلمة مرور جديدة','الرابط يفتح شاشة كلمة المرور الجديدة');
  ok(await p.evaluate(()=>location.hash)==='','الرمز يُمحى من شريط العنوان فور التقاطه');
  ok((await p.textContent('.lede')).includes(USER.email),'الشاشة تذكر الحساب المعنيّ');
  if(SHOTS) await p.screenshot({path:SHOTS+'reset.png'});
  await p.fill('#f_newPwd','short'); await p.click('[data-save]'); await p.waitForTimeout(400);
  ok(await p.isVisible('[data-err="newPwd"]:not([hidden])'),'كلمة قصيرة ⇒ خطأ يشرح الحدّ الأدنى');
  await p.fill('#f_newPwd','A-longer-pass-9'); await p.fill('#f_newPwd2','A-longer-pass-8');
  await p.click('[data-save]'); await p.waitForTimeout(400);
  ok(await p.isVisible('[data-err="newPwd2"]:not([hidden])'),'عدم التطابق ⇒ خطأ على الحقل الثاني');
  await p.fill('#f_newPwd2','A-longer-pass-9');
  await p.click('[data-save]'); await p.waitForTimeout(1600);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','الحفظ يفتح النظام مباشرة بلا طلب دخول ثانٍ');
  const put=seen.filter(x=>x.url==='user' && x.method==='PUT');
  ok(put.length===1 && put[0].body.password==='A-longer-pass-9','كلمة المرور أُرسلت إلى الخادم مرّة واحدة');
  await ctx.close();
}

/* ===== 8) رابط منتهٍ ===== */
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL+'#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    {waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1400);
  ok(await p.isVisible('#f_loginPassword'),'رابط منتهٍ ⇒ شاشة الدخول');
  ok((await p.textContent('.step-body')).includes('لم يعد صالحًا'),'مع سبب صريح وطريق للخروج منه');
  ok(await p.evaluate(()=>location.hash)==='','ولا يبقى شيء في شريط العنوان');
  await ctx.close();
}

/* ===== 9) «ابدأ الآن» من شاشة الدخول ===== */
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="login"]'); await p.waitForTimeout(700);
  await p.click('[data-start]'); await p.waitForTimeout(900);
  ok(await p.evaluate(()=>document.body.dataset.surface)==='setup','«ابدأ الآن» يفتح صفحة إعداد البرنامج');
  ok(await p.isVisible('#phases'),'ومعها شريط المراحل الأربع');
  await ctx.close();
}

console.log(`\n${pass} pass · ${fail} fail`);
await b.close();
process.exit(fail?1:0);
