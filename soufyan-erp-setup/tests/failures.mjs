import { chromium } from './pw.mjs';
const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';
const SESSION='11111111-2222-3333-4444-555555555555';
const TOKEN='eyJhbGciOiJIUzI1NiJ9.fake';
const USER={ id:'1504114c-71ec-4345-a1ba-7c815c71e6c4', email:'assn42357@gmail.com' };
const PROFILE={ id:USER.id, display_name:'سفيان يوسف', role:'MANAGER', status:'active' };
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m);};

const b=await chromium.launch({executablePath:EXE});
const page=async cfg=>{ const ctx=await b.newContext({viewport:{width:1100,height:900}}); const p=await ctx.newPage();
  await p.route('**/fonts.googleapis.com/**', r=>r.abort());
  if(cfg) await p.addInitScript(c=>{ window.SETUP_CONFIG=c; }, cfg);
  return {ctx,p}; };
const authOk=async(p,o={})=>{
  await p.route('**/auth/v1/**', r=>{ const url=r.request().url();
    const body=r.request().postData()?JSON.parse(r.request().postData()):{};
    const json=(s,x)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(x)});
    if(url.includes('/token')) return body.password==='S3cret-pass'
      ? json(200,{access_token:TOKEN, user:USER}) : json(400,{error_code:'invalid_credentials'});
    return json(200,{...USER}); });
  await p.route('**/rest/v1/profiles**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([PROFILE])}));
  await p.route('**/rest/v1/rpc/**', r=>{ const fn=r.request().url().split('/rpc/')[1].split('?')[0];
    if(fn==='app_session_start') return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(SESSION)});
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:o.pingOk!==false})}); });
};
const gotoLogin=async p=>{ await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="login"]'); await p.waitForTimeout(650); };
const fill=async(p,pw='S3cret-pass')=>{ await p.fill('#f_loginEmail',USER.email); await p.fill('#f_loginPassword',pw);
  await p.click('[data-go]'); await p.waitForTimeout(1300); };

/* ===== 1) الخادم لا يُجيب ===== */
console.log('\n— بلا اتصال —');
{
  const {ctx,p}=await page();
  await p.route('**/*.supabase.co/**', r=>r.abort());
  await gotoLogin(p); await fill(p);
  const txt=await p.textContent('[data-login-err]');
  ok(txt.includes('تعذّر الوصول إلى الخادم'),'يقول ماذا حدث');
  ok(txt.includes('تحقّق من الاتصال'),'ويقول ماذا أفعل');
  ok(!/undefined|\[object|Error:|fetch/.test(txt),'بلا تفاصيل تقنية مسرَّبة للمستخدم');
  ok(await p.isEnabled('#f_loginPassword'),'الحقول تعود قابلة للإدخال بعد الفشل');
  if(SHOTS) await p.screenshot({path:SHOTS+'err-offline.png'});
  await ctx.close();
}

/* ===== 2) بريد غير مؤكَّد ===== */
console.log('\n— بريد غير مؤكَّد —');
{
  const {ctx,p}=await page();
  await p.route('**/auth/v1/**', r=>r.fulfill({status:400,contentType:'application/json',
    body:JSON.stringify({error_code:'email_not_confirmed', msg:'Email not confirmed'})}));
  await gotoLogin(p); await fill(p);
  const txt=await p.textContent('[data-login-err]');
  ok(txt.includes('غير مؤكَّد'),'يُعرض كحالة تأكيد لا ككلمة مرور خاطئة');
  ok(txt.includes('مدير النظام'),'ويقول لمن يلجأ');
  await ctx.close();
}

/* ===== 3) محاولات كثيرة ===== */
console.log('\n— حدّ المحاولات —');
{
  const {ctx,p}=await page();
  await p.route('**/auth/v1/**', r=>r.fulfill({status:429,contentType:'application/json',
    body:JSON.stringify({msg:'For security purposes, you can only request this after 21 seconds.'})}));
  await gotoLogin(p); await fill(p);
  const txt=await p.textContent('[data-login-err]');
  ok(txt.includes('محاولات كثيرة'),'الخادم يحدّ الطلبات ⇒ رسالة تفسّر لا تتّهم');
  ok(!txt.includes('21 seconds'),'ونصّ الخادم لا يُعرض كما هو');
  if(SHOTS) await p.screenshot({path:SHOTS+'err-rate.png'});
  await ctx.close();
}

/* ===== 4) بلا ربط بالخادم أصلًا ===== */
console.log('\n— بلا ربط —');
{
  const {ctx,p}=await page({supabaseUrl:"", supabaseAnonKey:""});
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  ok((await p.textContent('.step-body')).includes('الدخول غير متاح'),'البوابة تقول بصراحة إن الدخول غير متاح');
  await p.click('[data-door="login"]'); await p.waitForTimeout(650);
  ok(!(await p.isVisible('#f_loginPassword')),'لا يُعرض حقل لا يستطيع أحد التحقّق منه');
  ok((await p.textContent('#stepTitle'))==='الدخول غير متاح','والعنوان لا يَعِد بما لا يوجد');
  ok((await p.textContent('.step-body')).includes('supabaseUrl'),'ويقول ما الذي ينقص بالضبط');
  ok(await p.isVisible('[data-start]'),'ويبقى «ابدأ الآن» متاحًا — لا طريق مسدود');
  if(SHOTS) await p.screenshot({path:SHOTS+'err-noconfig.png'});
  await ctx.close();
}

/* ===== 5) الإعداد المحلي ما يزال يعمل بلا خادم ===== */
{
  const {ctx,p}=await page({supabaseUrl:"", supabaseAnonKey:""});
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="setup"]'); await p.waitForTimeout(800);
  ok(await p.evaluate(()=>document.body.dataset.surface)==='setup','الإعداد المحلي يعمل كما في V4 حتى بلا خادم');
  ok((await p.textContent('#hActions')).includes('وضع محلي'),'الرأس يعلن الوضع المحلي بوضوح');
  await ctx.close();
}

/* ===== 6) انقطاع مؤقّت أثناء الاستئناف ===== */
console.log('\n— انقطاع مؤقّت —');
{
  const {ctx,p}=await page(); await authOk(p);
  await gotoLogin(p); await fill(p);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','دخول ناجح بدور مدير');
  const tags=await p.$$eval('.perm-list li',n=>n.map(x=>x.textContent));
  ok(tags.length===8,'الأقسام المعروضة هي ما يخصّ هذا الدور فقط ('+tags.length+')');
  await p.unroute('**/rest/v1/rpc/**');
  await p.route('**/rest/v1/rpc/**', r=>r.abort());              // الخادم صامت
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1600);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','الصمت المؤقّت لا يطرد المستخدم خلال مهلة السماح');
  ok((await p.textContent('.step-body')).includes('لا يوجد اتصال بالخادم'),'الحالة معلنة على الشاشة لا مخفيّة');
  if(SHOTS) await p.screenshot({path:SHOTS+'offline-session.png'});
  await p.unroute('**/rest/v1/rpc/**');
  await p.route('**/rest/v1/rpc/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":false}'}));
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1600);
  ok(await p.isVisible('#f_loginPassword'),'رفض الخادم الصريح ينهي الجلسة فورًا');
  await ctx.close();
}

/* ===== 7) الجلسة لا تُنقل بين الأجهزة بنسخ التخزين ===== */
console.log('\n— نقل التخزين إلى جهاز آخر —');
{
  const {ctx,p}=await page(); await authOk(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.evaluate(s=>{ localStorage.setItem('soufyan.erp.session.v1', JSON.stringify({v:1,sessionId:s,method:'password',
    at:new Date().toISOString(), employee:{id:'x',name:'مزوَّر',role:'ADMIN'}, permissions:['settings'], terminal:'جهاز-آخر'})); }, SESSION);
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1400);
  ok(await p.textContent('#stepTitle')!=='أهلًا مزوَّر','جلسة محفوظة من جهاز آخر لا تُقبل على هذا الجهاز');
  await ctx.close();
}

/* ===== 8) الاسترجاع بلا اتصال ===== */
console.log('\n— الاسترجاع بلا اتصال —');
{
  const {ctx,p}=await page();
  await p.route('**/*.supabase.co/**', r=>r.abort());
  await gotoLogin(p);
  await p.click('[data-forgot]'); await p.waitForTimeout(700);
  await p.fill('#f_recEmail', USER.email);
  await p.click('[data-send]'); await p.waitForTimeout(1200);
  ok((await p.textContent('[data-rec-err]')).includes('تعذّر الوصول إلى الخادم'),'فشل الإرسال يُقال لا يُبتلع');
  ok((await p.textContent('#stepTitle'))==='استرجاع كلمة المرور','ولا يُدّعى أن الرسالة أُرسلت');
  ok(await p.isEnabled('[data-send]'),'وزر الإرسال يعود قابلًا للضغط');
  await ctx.close();
}

console.log(`\n${pass} pass · ${fail} fail`);
await b.close(); process.exit(fail?1:0);
