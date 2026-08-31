import { chromium } from './pw.mjs';
import { routeSupabase, SESSION, USER } from './contracts.mjs';
const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';
const PROFILE={ id:USER.id, display_name:'سفيان يوسف', full_name:'سفيان يوسف', role:'MANAGER', status:'active' };
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m);};

const b=await chromium.launch({executablePath:EXE});
const page=async cfg=>{ const ctx=await b.newContext({viewport:{width:1100,height:900}}); const p=await ctx.newPage();
  await p.route('**/fonts.googleapis.com/**', r=>r.abort());
  if(cfg) await p.addInitScript(c=>{ window.SETUP_CONFIG=c; }, cfg);
  return {ctx,p}; };
const authOk=(p,o={})=>routeSupabase(p,{profile:PROFILE,...o});
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

/* ===== 5) بلا ربط: الإعداد يتوقف بدل أن ينجح محليًا =====
   V6 كان يفتح المعالج ويكمله بالكامل بلا خادم: رمز OTP يُولَّد في المتصفح
   ويُعاد في الرد، و«التهيئة» تكتب في localStorage، و setup_completed=true.
   V7 يفشل مغلقًا: يفتح المعالج للاطّلاع، لكن لا خطوة تدّعي نجاحًا. */
{
  const {ctx,p}=await page({supabaseUrl:"", supabaseAnonKey:""});
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="setup"]'); await p.waitForTimeout(800);
  ok(await p.evaluate(()=>document.body.dataset.surface)==='setup','المعالج يُفتح للاطّلاع');
  ok((await p.textContent('#hActions')).includes('الخادم غير مضبوط'),'والرأس يعلن أن الخادم غير مضبوط');

  // لا مسار محلي: طلب رمز بلا ربط يرفع خطأ ولا يُولّد شيئًا في المتصفح.
  const sent = await p.evaluate(async () => {
    try { await window.ERPSetup.services.OtpService.send('x@example.com','owner'); return 'resolved'; }
    catch (e) { return 'threw:' + (e && e.code); }
  });
  ok(sent === 'threw:config','طلب رمز بلا ربط يفشل صراحةً بدل توليده محليًا');

  const prov = await p.evaluate(async () => {
    try { await window.ERPSetup.services.SetupService.run('finalize', window.ERPSetup.state.data); return 'resolved'; }
    catch (e) { return 'threw:' + (e && e.code); }
  });
  ok(prov.startsWith('threw:'),'والتهيئة ترفض العمل بلا خادم بدل الكتابة في localStorage');

  const keys = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('soufyan.erp.')));
  ok(!keys.includes('soufyan.erp.setup_completed'),'ولا يُكتب مفتاح يدّعي اكتمال الإعداد');
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
  // V7: أثناء الانقطاع لا تُمنح صلاحية. المعروض آخر هوية معروفة، لا سلطة.
  ok(await p.evaluate(()=>window.ERPSetup.auth.can('settings'))===false,
     'ولا تُمنح صلاحية من المخزَّن ما دام الخادم لم يؤكّدها');
  if(SHOTS) await p.screenshot({path:SHOTS+'offline-session.png'});
  await p.unroute('**/rest/v1/rpc/**');
  await p.route('**/rest/v1/rpc/**', r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({ok:false,reason:'closed'})}));
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
