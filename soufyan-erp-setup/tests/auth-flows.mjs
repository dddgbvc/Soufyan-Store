import { chromium } from './pw.mjs';
const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';
const SESSION='11111111-2222-3333-4444-555555555555';
let pass=0, fail=0;
const ok=(c,m)=>{ c?pass++:fail++; console.log((c?'  PASS ':'  FAIL ')+m); };

// ---- شبكة وهمية تحاكي عقود الخادم الحقيقية كما قرأناها من قاعدة البيانات ----
const seen=[];
async function stub(page, opts={}){
  await page.route('**/fonts.googleapis.com/**', r=>r.abort());
  await page.route('**/rest/v1/rpc/**', async route=>{
    const url=route.request().url(); const fn=url.split('/rpc/')[1].split('?')[0];
    const body=JSON.parse(route.request().postData()||'{}');
    seen.push({fn, body, headers:route.request().headers()});
    if(fn==='verify_employee_pin'){
      // نفس الشرط الذي ينفّذه bcrypt على الخادم: بصمة صحيحة أو لا
      if(body.p_pin_hash===opts.goodHash)
        return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({
          ok:true, session_id:SESSION,
          employee:{id:'e69bae3f-44cc-48f8-9928-9d4886e2be6c', name:'سفيان يوسف', role:'ADMIN', department:null, avatar_url:null},
          permissions:['dashboard','pos','returns','inventory','shortages','vaults','customers','analytics','settings','repairs','expenses','purchases']})});
      if(opts.locked) return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ok:false, reason:'locked', retry_after:120})});
      return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ok:false, reason:'wrong'})});
    }
    if(fn==='app_session_ping')
      return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ok: opts.pingOk!==false, at:new Date().toISOString()})});
    if(fn==='app_session_end')
      return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ok:true})});
    if(fn==='app_session_start')
      return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(SESSION)});
    if(fn==='app_session_whoami')     // غير منشورة على المشروع — الخادم يردّ 404
      return route.fulfill({status:404, contentType:'application/json', body:JSON.stringify({message:'Not Found'})});
    return route.fulfill({status:404, body:'{}'});
  });
  await page.route('**/functions/v1/webauthn', async route=>{
    const body=JSON.parse(route.request().postData()||'{}');
    if(body.action==='begin-auth')
      return route.fulfill({status:200, contentType:'application/json',
        body:JSON.stringify({ok:true, challenge:opts.pkChallenge||null, allowCredentials:opts.pkCreds||[]})});
    return route.fulfill({status:200, body:'{"ok":false,"message":"no"}'});
  });
  await page.route('**/auth/v1/**', async route=>{
    const url=route.request().url();
    if(url.includes('/otp')) return opts.emailUnknown
      ? route.fulfill({status:401, contentType:'application/json', body:JSON.stringify({msg:'Signups not allowed'})})
      : route.fulfill({status:200, contentType:'application/json', body:'{}'});
    return route.fulfill({status:400, contentType:'application/json', body:JSON.stringify({error_description:'Token has expired or is invalid'})});
  });
}

const sha256hex = async (s)=>{ const c=await import('node:crypto'); return c.createHash('sha256').update(s).digest('hex'); };

const b = await chromium.launch({ executablePath:EXE });

/* ===== 1) البوابة → الإعداد ===== */
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(900);
  ok(await p.textContent('#stepTitle')==='أهلًا بك','البوابة هي أول ما يظهر');
  ok(!(await p.isVisible('#phases')),'شريط مراحل الإعداد مخفي في البوابة');
  ok(!(await p.isVisible('.s-nav')),'شريط تنقّل الإعداد مخفي في البوابة');
  await p.click('[data-door="setup"]'); await p.waitForTimeout(900);
  ok(await p.evaluate(()=>document.body.dataset.surface)==='setup','«مستخدم جديد» يفتح الإعداد');
  ok(await p.isVisible('#phases'),'شريط المراحل يظهر داخل الإعداد');
  ok((await p.textContent('.phase-now'))?.includes('الهوية'),'المرحلة الأولى: الهوية');
  if(SHOTS) await p.screenshot({path:SHOTS+'setup.png'});
  await ctx.close();
}

/* ===== 2) الدخول برمز صحيح ===== */
{
  const good=await sha256hex('4271');
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p,{goodHash:good});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="login"]'); await p.waitForTimeout(700);
  ok(await p.isVisible('.pin-input'),'شاشة الدخول تعرض حقل رمز الدخول');
  ok(await p.evaluate(()=>document.activeElement?.classList.contains('pin-input')),'التركيز ينتقل تلقائيًا إلى حقل الرمز');
  ok(await p.isEnabled('[data-pin-go]'),'زر الدخول يبقى مفعّلًا — التحقّق عند الضغط لا قبله');
  await p.click('[data-pin-go]'); await p.waitForTimeout(400);
  ok((await p.textContent('[data-login-err]')).includes('أرقام فقط'),'الضغط برمز ناقص يشرح المطلوب بدل زرّ ميت');
  ok(await p.getAttribute('.pin-input','aria-invalid')==='true','الحقل يحمل aria-invalid بعد الخطأ');
  if(SHOTS) await p.screenshot({path:SHOTS+'login.png'});
  await p.fill('.pin-input','9999'); await p.click('[data-pin-go]'); await p.waitForTimeout(700);
  ok((await p.textContent('[data-login-err]')).includes('غير صحيح'),'رمز خاطئ ⇒ رسالة صريحة');
  ok(await p.inputValue('.pin-input')==='','الحقل يُفرَّغ بعد الخطأ');
  if(SHOTS) await p.screenshot({path:SHOTS+'login-wrong.png'});
  await p.fill('.pin-input','4271'); await p.press('.pin-input','Enter'); await p.waitForTimeout(1400);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','رمز صحيح ⇒ الدخول باسم الموظف الذي عرّفه الخادم');
  const tags=await p.$$eval('.perm-list li',n=>n.map(x=>x.textContent));
  ok(tags.includes('المبيعات')&&tags.includes('الإعدادات')&&tags.length===12,'الصلاحيات كما أصدرها الخادم ('+tags.length+' قسمًا)');
  ok(await p.isVisible('#logoutBtn')&&await p.isVisible('#switchBtn'),'الرأس يعرض الخروج وتبديل المستخدم');
  if(SHOTS) await p.screenshot({path:SHOTS+'erp.png'});
  // ما الذي كُتب في المتصفح؟
  const store=await p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k);}return o;});
  const dump=JSON.stringify(store);
  ok(!dump.includes('4271'),'رمز الدخول لا يُكتب في المتصفح');
  ok(!dump.includes(good),'بصمة الرمز لا تُكتب في المتصفح');
  ok(!/access_token|refresh_token/.test(dump),'لا رموز وصول في المتصفح');
  ok(dump.includes(SESSION),'المحفوظ هو مؤشّر الجلسة الذي أصدره الخادم');
  // استئناف بعد تحديث الصفحة
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1400);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','الجلسة تُستأنف بعد تحديث الصفحة');
  ok(seen.some(x=>x.fn==='app_session_ping'),'الاستئناف يسأل الخادم قبل أن يثق بالمخزون المحلي');
  ok(seen.some(x=>x.headers['x-terminal-id']),'كل طلب يحمل معرّف الجهاز للخادم');
  ok(errs.length===0,'بلا أخطاء JavaScript: '+errs.join(' | '));
  await ctx.close();
}

/* ===== 3) الخادم يرفض الجلسة ⇒ لا استئناف ===== */
{
  const good=await sha256hex('4271');
  const ctx=await b.newContext(); const p=await ctx.newPage(); await stub(p,{goodHash:good});
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  await p.click('[data-door="login"]'); await p.waitForTimeout(500);
  await p.fill('.pin-input','4271'); await p.press('.pin-input','Enter'); await p.waitForTimeout(1300);
  await p.unroute('**/rest/v1/rpc/**'); await stub(p,{goodHash:good, pingOk:false});
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1400);
  ok(await p.textContent('#stepTitle')==='أدخل رمزك','الخادم قال «الجلسة مغلقة» ⇒ عودة إلى الدخول');
  ok(!(await p.evaluate(()=>localStorage.getItem('soufyan.erp.session.v1'))),'الجلسة المرفوضة تُمحى من المتصفح');
  await ctx.close();
}

/* ===== 4) خروج وتبديل مستخدم ===== */
{
  const good=await sha256hex('4271');
  const ctx=await b.newContext(); const p=await ctx.newPage(); await stub(p,{goodHash:good});
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  await p.click('[data-door="login"]'); await p.waitForTimeout(500);
  await p.fill('.pin-input','4271'); await p.press('.pin-input','Enter'); await p.waitForTimeout(1300);
  await p.evaluate(()=>{ localStorage.setItem('soufyan.erp.setup.v1', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('soufyan.erp.setup.v1')||'{}'), {version:1}))); });
  const before=await p.evaluate(()=>Object.keys(localStorage).sort());
  await p.click('[data-logout]'); await p.waitForTimeout(400);
  await p.click('.modal [data-act="1"]'); await p.waitForTimeout(900);
  ok(await p.textContent('#stepTitle')==='أهلًا بك','الخروج يعيد إلى البوابة');
  const after=await p.evaluate(()=>Object.keys(localStorage).sort());
  ok(after.includes('soufyan.erp.setup.v1'),'الخروج لا يمسّ حالة الإعداد');
  ok(!after.includes('soufyan.erp.session.v1'),'الخروج يمسح الجلسة وحدها');
  ok(seen.some(x=>x.fn==='app_session_end'),'الخروج يُنهي الجلسة على الخادم أيضًا');
  await ctx.close();
}

/* ===== 5) طرق أخرى: مفتاح المرور والبريد ===== */
{
  const ctx=await b.newContext(); const p=await ctx.newPage(); await stub(p,{});
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  await p.click('[data-method="passkey"]'); await p.waitForTimeout(900);
  ok((await p.textContent('[data-pk-state]')).includes('لا يوجد مفتاح مسجَّل'),'الخادم قال «لا مفاتيح» ⇒ سبب صريح بلا محاكاة');
  if(SHOTS) await p.screenshot({path:SHOTS+'passkey.png'});
  await p.click('[data-back]'); await p.waitForTimeout(700);
  await p.click('[data-method="email"]'); await p.waitForTimeout(700);
  ok(await p.isVisible('#f_loginEmail'),'الدخول بالبريد يفتح حقل البريد');
  await p.fill('#f_loginEmail','not-an-email'); await p.click('[data-em-send]'); await p.waitForTimeout(400);
  ok(await p.isVisible('[data-err="loginEmail"]:not([hidden])'),'بريد غير صالح ⇒ خطأ داخل الحقل');
  await p.fill('#f_loginEmail','assn42357@gmail.com'); await p.click('[data-em-send]'); await p.waitForTimeout(900);
  ok(await p.isVisible('.otp input'),'بعد الإرسال تظهر خانات الرمز');
  ok((await p.textContent('.lede')).includes('assn42357@gmail.com'),'الشاشة تذكر البريد الذي أُرسل إليه');
  if(SHOTS) await p.screenshot({path:SHOTS+'email-otp.png'});
  for(const [i,d] of [...'123456'].entries()) await p.fill(`.otp input[data-i="${i}"]`, d);
  await p.waitForTimeout(1100);
  ok((await p.textContent('[data-em-status]')).includes('غير صحيح'),'رمز بريد خاطئ ⇒ رسالة صريحة');
  await ctx.close();
}

console.log(`\n${pass} pass · ${fail} fail`);
await b.close();
process.exit(fail?1:0);
