import { chromium } from './pw.mjs';
import { routeSupabase, SESSION, TOKEN, USER, PROFILE, PERMISSIONS } from './contracts.mjs';
const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';
let pass=0, fail=0;
const ok=(c,m)=>{ c?pass++:fail++; console.log((c?'  PASS ':'  FAIL ')+m); };

const seen=[];
/** يردّ بالعقود نفسها التي يعيدها Supabase Auth و PostgREST على هذا المشروع.
 *  التعريف نفسه في tests/contracts.mjs، منسوخ عن نواتج حقيقية من قاعدة الإنتاج. */
const stub = (page, o={}) => routeSupabase(page, o, seen);

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
  ok(err.includes('رمز تحقق'),'وتقترح المخرج الصحيح');
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
  // V7: الجلسة تُفتح بهوية المستخدم الموثَّق نفسه (auth.uid())، لا بنداء مجهول.
  // app_session_start كانت تُفتح بلا employee_id فتبقى الجلسة مجهولة على الخادم.
  const started=seen.find(x=>x.rpc==='app_session_start_authenticated');
  ok(!!started,'تُفتح جلسة تشغيل موسومة بالهوية على الخادم بعد التوثيق');
  ok(!!started && typeof started.args.p_terminal_id==='string' && started.args.p_terminal_id.length>=8,
     'ومعها معرّف هذا الجهاز');
  ok(!seen.some(x=>x.rpc==='app_session_start'),'ولا تُفتح جلسة مجهولة بعد الدخول');
  const store=await p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k);}return o;});
  const dump=JSON.stringify(store);
  ok(!dump.includes('S3cret-pass'),'كلمة المرور لا تُكتب في المتصفح');
  ok(!dump.includes(TOKEN) && !/access_token|refresh_token/.test(dump),'ولا رمز وصول ولا رمز تحديث');
  ok(dump.includes(SESSION),'المحفوظ مؤشّر الجلسة الذي أصدره الخادم');
  if(SHOTS) await p.screenshot({path:SHOTS+'erp.png'});
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','الجلسة تُستأنف بعد تحديث الصفحة');
  // V7: الاستئناف يسأل whoami لا ping — ping يردّ {ok:true} بلا هوية،
  // فكان العميل يأخذ الدور والصلاحيات من localStorage.
  const who=seen.find(x=>x.rpc==='app_session_whoami');
  ok(!!who,'والاستئناف يسأل الخادم عن الهوية لا عن حياة الجلسة فقط');
  ok(!!who && who.args.p_session_id===SESSION && typeof who.args.p_terminal_id==='string',
     'ويرسل مؤشّر الجلسة ومعرّف الجهاز ليفحصهما الخادم');
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

/* ===== 6) نسيت كلمة المرور: OTP ===== */
console.log('\n— نسيت كلمة المرور / OTP —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="login"]'); await p.waitForTimeout(700);
  await p.fill('#f_loginEmail', USER.email);
  await p.click('[data-forgot]'); await p.waitForTimeout(800);
  ok(await p.inputValue('#f_recEmail')===USER.email,'البريد المكتوب ينتقل معك بلا إعادة كتابة');
  await p.click('[data-send]'); await p.waitForTimeout(900);
  ok(await p.textContent('#stepTitle')==='تحقق من هويتك','الإرسال يقود مباشرة إلى شاشة OTP');
  ok((await p.textContent('.step-body')).includes('أرسلنا رمز التحقق'),'شاشة OTP توضّح أن الرمز أُرسل');
  const otpReq=seen.filter(x=>x.url==='otp');
  ok(otpReq.length===1 && otpReq[0].body.should_create_user===false,'يُطلب OTP بدون إنشاء حساب جديد');
  ok(seen.filter(x=>x.url==='recover').length===0,'لم يعد هناك Reset Link عبر /recover');
  await p.fill('.otp input:nth-child(1)','1'); await p.fill('.otp input:nth-child(2)','2'); await p.fill('.otp input:nth-child(3)','3');
  await p.fill('.otp input:nth-child(4)','4'); await p.fill('.otp input:nth-child(5)','5'); await p.fill('.otp input:nth-child(6)','6');
  await p.waitForTimeout(900);
  ok(await p.textContent('#stepTitle')==='اختر كلمة مرور جديدة','OTP الصحيح يفتح شاشة كلمة المرور الجديدة');
  ok(seen.some(x=>x.url==='verify' && x.body.type==='recovery'),'التحقق يستخدم type=recovery');
  await p.fill('#f_newPwd','A-longer-pass-9'); await p.fill('#f_newPwd2','A-longer-pass-8');
  await p.click('[data-save]'); await p.waitForTimeout(400);
  ok(await p.isVisible('[data-err="newPwd2"]:not([hidden])'),'عدم التطابق ⇒ خطأ على الحقل الثاني');
  await p.fill('#f_newPwd2','A-longer-pass-9'); await p.click('[data-save]'); await p.waitForTimeout(1600);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','الحفظ يفتح النظام مباشرة بلا طلب دخول ثانٍ');
  const put=seen.filter(x=>x.url==='user' && x.method==='PUT');
  ok(put.length===1 && put[0].body.password==='A-longer-pass-9','كلمة المرور أُرسلت إلى الخادم مرّة واحدة');
  await ctx.close();
}

/* ===== 7) لا يوجد recovery link ===== */
console.log('\n— لا يوجد Recovery Link —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL+`#access_token=${TOKEN}&type=recovery&expires_in=3600`,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(900);
  ok(await p.textContent('#stepTitle')!=='اختر كلمة مرور جديدة','رابط الاسترجاع القديم لم يعد يفتح شاشة تغيير كلمة المرور');
}

/* ===== 8) مسار OTP المنتهي ===== */
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
