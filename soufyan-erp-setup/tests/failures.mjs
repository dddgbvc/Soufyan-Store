import { chromium } from './pw.mjs';
const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';
const SESSION='11111111-2222-3333-4444-555555555555';
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m);};
const sha=async s=>{const c=await import('node:crypto');return c.createHash('sha256').update(s).digest('hex');};
const GOOD=await sha('4271');
const b=await chromium.launch({executablePath:EXE});
const page=async(cfg)=>{ const ctx=await b.newContext({viewport:{width:1100,height:900}}); const p=await ctx.newPage();
  await p.route('**/fonts.googleapis.com/**', r=>r.abort());
  if(cfg) await p.addInitScript(c=>{ window.SETUP_CONFIG=c; }, cfg);
  return {ctx,p}; };

/* ===== 1) الخادم لا يُجيب ===== */
console.log('\n— بلا اتصال —');
{
  const {ctx,p}=await page();
  await p.route('**/*.supabase.co/**', r=>r.abort());
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  await p.fill('.pin-input','4271'); await p.press('.pin-input','Enter'); await p.waitForTimeout(1200);
  const txt=await p.textContent('[data-login-err]');
  ok(txt.includes('تعذّر الوصول إلى الخادم'),'يقول ماذا حدث');
  ok(txt.includes('تحقّق من الاتصال'),'ويقول ماذا أفعل');
  ok(!/undefined|\[object|Error:/.test(txt),'بلا تفاصيل تقنية مسرَّبة للمستخدم');
  ok(await p.isEnabled('.pin-input'),'الحقل يعود قابلًا للإدخال بعد الفشل');
  if(SHOTS) await p.screenshot({path:SHOTS+'err-offline.png'});
  await ctx.close();
}

/* ===== 2) الإدخال موقوف من الخادم ===== */
console.log('\n— الإيقاف بعد محاولات كثيرة —');
{
  const {ctx,p}=await page();
  await p.route('**/rest/v1/rpc/**', r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({ok:false, reason:'locked', retry_after:120})}));
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  await p.fill('.pin-input','1234'); await p.press('.pin-input','Enter'); await p.waitForTimeout(1000);
  const txt=await p.textContent('[data-login-err]');
  ok(txt.includes('موقوف مؤقتًا'),'الإيقاف يُعرض كإيقاف لا كرمز خاطئ');
  ok(txt.includes('دقيقتين')&&txt.includes('مفتاح المرور'),'يقترح الانتظار وطريقًا بديلًا');
  if(SHOTS) await p.screenshot({path:SHOTS+'err-locked.png'});
  await ctx.close();
}

/* ===== 3) بلا ربط بالخادم أصلًا ===== */
console.log('\n— بلا ربط —');
{
  const {ctx,p}=await page({supabaseUrl:"", supabaseAnonKey:""});
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  ok((await p.textContent('.step-body')).includes('الدخول غير متاح'),'البوابة تقول بصراحة إن الدخول غير متاح');
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  const txt=await p.textContent('.step-body');
  ok(!(await p.isVisible('.pin-input')),'لا يُعرض حقل رمز لا يستطيع أحد التحقّق منه');
  ok(txt.includes('supabaseUrl'),'ويقول ما الذي ينقص بالضبط');
  ok((await p.$$eval('.method',n=>n.length))===0,'لا تُعرض «طرق أخرى» حين لا توجد طريقة واحدة تعمل');
  ok((await p.textContent('#stepTitle'))==='الدخول غير متاح','العنوان لا يطلب رمزًا لن يقبله أحد');
  if(SHOTS) await p.screenshot({path:SHOTS+'err-noconfig.png'});
  await ctx.close();
}

/* ===== 4) الإعداد المحلي ما يزال يعمل بلا خادم ===== */
{
  const {ctx,p}=await page({supabaseUrl:"", supabaseAnonKey:""});
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  await p.click('[data-door="setup"]'); await p.waitForTimeout(700);
  ok(await p.evaluate(()=>document.body.dataset.surface)==='setup','الإعداد المحلي يعمل كما في V4 حتى بلا خادم');
  ok((await p.textContent('#hActions')).includes('وضع محلي'),'الرأس يعلن الوضع المحلي بوضوح');
  await ctx.close();
}

/* ===== 5) مهلة السماح: الخادم لم يُجب عند الإقلاع ===== */
console.log('\n— انقطاع مؤقّت أثناء الاستئناف —');
{
  const {ctx,p}=await page();
  await p.route('**/rest/v1/rpc/**', async r=>{
    const fn=r.request().url().split('/rpc/')[1];
    const body=JSON.parse(r.request().postData()||'{}');
    if(fn.startsWith('verify_employee_pin')) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(
      body.p_pin_hash===GOOD?{ok:true,session_id:SESSION,employee:{id:'x',name:'سفيان يوسف',role:'MANAGER'},permissions:['dashboard','pos']}:{ok:false,reason:'wrong'})});
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
  });
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  await p.fill('.pin-input','4271'); await p.press('.pin-input','Enter'); await p.waitForTimeout(1300);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','دخول ناجح بدور مدير');
  const tags=await p.$$eval('.perm-list li',n=>n.map(x=>x.textContent));
  ok(tags.length===2 && tags.includes('المبيعات'),'الأقسام المعروضة هي ما أرسله الخادم لهذا الدور فقط: '+tags.join(' · '));
  await p.unroute('**/rest/v1/rpc/**');
  await p.route('**/rest/v1/rpc/**', r=>r.abort());          // الخادم صامت
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','الصمت المؤقّت لا يطرد المستخدم خلال مهلة السماح');
  ok((await p.textContent('.step-body')).includes('لا يوجد اتصال بالخادم'),'الحالة معلنة على الشاشة لا مخفيّة');
  if(SHOTS) await p.screenshot({path:SHOTS+'offline-session.png'});
  // ...لكن الرفض الصريح يطرد فورًا
  await p.unroute('**/rest/v1/rpc/**');
  await p.route('**/rest/v1/rpc/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":false}'}));
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500);
  ok(await p.textContent('#stepTitle')==='أدخل رمزك','رفض الخادم الصريح ينهي الجلسة فورًا');
  await ctx.close();
}

/* ===== 6) الجلسة لا تُنقل بين الأجهزة بنسخ التخزين ===== */
console.log('\n— نقل التخزين إلى جهاز آخر —');
{
  const {ctx,p}=await page();
  await p.route('**/rest/v1/rpc/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  await p.evaluate(s=>{ localStorage.setItem('soufyan.erp.session.v1', JSON.stringify({v:1,sessionId:s,method:'pin',
    at:new Date().toISOString(), employee:{id:'x',name:'مزوَّر',role:'ADMIN'}, permissions:['settings'], terminal:'جهاز-آخر'})); }, SESSION);
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1300);
  ok(await p.textContent('#stepTitle')!=='أهلًا مزوَّر','جلسة محفوظة من جهاز آخر لا تُقبل على هذا الجهاز');
  await ctx.close();
}

console.log(`\n${pass} pass · ${fail} fail`);
await b.close(); process.exit(fail?1:0);
