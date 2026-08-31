import { chromium } from './pw.mjs';
const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m);};
const b=await chromium.launch({executablePath:EXE});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error'&&!/net::|404/.test(m.text())) errs.push('console: '+m.text()); });
await p.route('**/fonts.googleapis.com/**', r=>r.abort());
await p.route('**/*.supabase.co/**', r=>r.abort());   // بلا خادم: نختبر مسار الإعداد المحلي كما في V4

await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
await p.click('[data-door="setup"]'); await p.waitForTimeout(800);

/* ---- كل خطوة ظاهرة تُرسَم بلا خطأ، ويتحدّث شريط المراحل معها ---- */
console.log('\n— كل خطوات المعالج —');
const ids=await p.evaluate(()=>Flow.visible().map(s=>s.id));
ok(ids.length===16, `المعالج يعرض ${ids.length} خطوة بلا موظفين — خطوتا الفريق مخفيّتان (المتوقّع 16)`);
const rows=[];
for(let i=0;i<ids.length;i++){
  await p.evaluate(i=>Wizard.goTo(i,true), i);
  await p.waitForFunction(id=>Wizard.step().id===id, ids[i], {timeout:4000}).catch(()=>{});
  await p.waitForTimeout(180);
  const r=await p.evaluate(()=>({ id:Wizard.step().id, title:($('#stepTitle')||{}).textContent,
    phase:($('.phase-now b')||{}).textContent, cur:($('.phase[aria-current="step"] .phase-name')||{}).textContent,
    body:($('.step-body')||{}).childElementCount }));
  rows.push(r);
  if(r.id!==ids[i]||!r.title||!r.phase||!r.body) console.log('    ! ', JSON.stringify(r));
}
ok(rows.every((r,i)=>r.id===ids[i]&&r.title&&r.phase&&r.body>0), 'كل خطوة رُسمت بعنوان ومحتوى ومرحلة');
ok(new Set(rows.map(r=>r.phase)).size===4, 'المراحل الأربع كلها ظهرت: '+[...new Set(rows.map(r=>r.phase))].join(' · '));
ok(errs.length===0, 'بلا أخطاء JavaScript عبر المعالج كله: '+errs.slice(0,3).join(' | '));

/* ---- إلزامي/اختياري و«إكمال لاحقًا» ---- */
console.log('\n— الإلزامي والاختياري —');
const flow=await p.evaluate(()=>({req:Flow.requiredPending().map(s=>s.id), opt:Flow.optionalPending().map(s=>s.id), can:Flow.canFinish(), pct:Flow.percent()}));
ok(flow.req.length>0 && flow.opt.length>0, `إلزامي معلَّق ${flow.req.length} · اختياري معلَّق ${flow.opt.length}`);
ok(flow.can===false, 'الخطوات الإلزامية تمنع الإنهاء قبل إنجازها');
await p.evaluate(()=>{ const i=Wizard.indexOf('inventory'); Wizard.goTo(i,true); }); await p.waitForTimeout(400);
ok(await p.isVisible('[data-skip]'), 'الخطوة الاختيارية تعرض زر «تخطّي»');
const later=await p.isVisible('[data-later]');
await p.click('[data-skip]'); await p.waitForTimeout(500);
const skipped=await p.evaluate(()=>SetupState.data.skippedSteps);
ok(skipped.includes('inventory'), 'التخطّي يسجّل الخطوة مؤجَّلة لا منجَزة');
ok(later, 'لافتة «إكمال لاحقًا» ظهرت عند أول خطوة اختيارية');

/* ---- الإعداد المتكيّف: لا موظفين ⇒ لا خطوات فريق ---- */
console.log('\n— الإعداد المتكيّف —');
const before=await p.evaluate(()=>Flow.visible().length);
await p.evaluate(()=>{ Employees.add({name:'أنس سفيان', email:'a@b.co', phone:'07700000000', role:'cashier'}); });
await p.waitForTimeout(300);
const after=await p.evaluate(()=>Flow.visible().length);
ok(after>before, `إضافة موظف تفتح خطوات الفريق (${before} ⇒ ${after} خطوة)`);

/* ---- بطاقة «إعداد متجرك» ---- */
const card=await p.evaluate(()=>{ const d=document.createElement('div'); document.body.appendChild(d);
  const c=ERPSetup.progressCard(d,{}); const html=d.innerHTML; d.remove(); return {pct:c.percent, has:html.includes('prog-ring'), rest:c.remaining.length}; });
ok(card.has && typeof card.pct==='number', `بطاقة الإكمال تُركَّب خارج المعالج (${card.pct}% · بقي ${card.rest})`);

/* ---- الفاتورة: خطأ صريح بلا بديل مرسوم ---- */
console.log('\n— قالب الفاتورة —');
await p.evaluate(()=>{ const i=Wizard.indexOf('invoices'); Wizard.goTo(i,true); }); await p.waitForTimeout(2500);
const inv=await p.evaluate(()=>{ const el=$('.step-body'); return el?el.textContent:''; });
ok(/تعذّر|Supabase/.test(inv), 'تعذّر الوصول إلى القالب ⇒ حالة خطأ صريحة');
ok(!/فاتورة تجريبية|mock/i.test(inv), 'لا فاتورة بديلة مرسومة محليًا');

/* ---- الإعداد المكتمل يوجّه إلى الدخول لا إلى جلسة وهمية ---- */
console.log('\n— نهاية الإعداد —');

/* V7: «الإعداد مكتمل» يقولها الخادم.
   أولًا نثبت أن كتابة مفتاح V6 المحلي بيد المستخدم لم تعد تُصدَّق. */
await p.unroute('**/*.supabase.co/**');
await p.route('**/rest/v1/rpc/setup_status**', r=>r.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({completed:false, completed_at:null, store_name:null, has_accounts:false})}));
await p.route('**/*.supabase.co/**', r=>r.abort());
await p.evaluate(()=>{
  localStorage.setItem('soufyan.erp.setup_completed','true');   // مفتاح V6 — يكتبه أي أحد
  SetupState.data.setupStatus.completed=true; SetupState.saveNow();
});
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1400);
ok(await p.evaluate(()=>Router.setupCompleted())===false,
   'مفتاح «اكتمل الإعداد» المكتوب في المتصفح لا يُصدَّق — الخادم وحده يقرّر');

/* ثم نجعل الخادم نفسه يقول إن الإعداد اكتمل. */
await p.unroute('**/rest/v1/rpc/setup_status**');
await p.route('**/rest/v1/rpc/setup_status**', r=>r.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({completed:true, completed_at:'2026-08-31T00:00:00+00:00',
                       store_name:'مكتب سفيان للموبايل', has_accounts:true})}));
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1400);
ok(await p.textContent('#stepTitle')==='سجّل دخولك','إعداد مكتمل بلا جلسة ⇒ شاشة الدخول مباشرة');
ok(await p.evaluate(()=>ERPSetup.auth.isAuthenticated())===false,'لا جلسة موثَّقة تُمنح لمجرد اكتمال الإعداد');
await p.click('[data-back-gate]'); await p.waitForTimeout(700);
ok((await p.textContent('.door[data-door="setup"] b'))==='إعداد متجر جديد','البوابة تتكيّف: «إعداد متجر جديد» بدل «مستخدم جديد»');
if(SHOTS) await p.screenshot({path:SHOTS+'gate-done.png'});
await p.click('[data-door="setup"]'); await p.waitForTimeout(500);
ok(await p.isVisible('.modal'),'فتح الإعداد على نظام مُعدّ يسأل أولًا');
if(SHOTS) await p.screenshot({path:SHOTS+'resetup-confirm.png'});

console.log(`\n${pass} pass · ${fail} fail`);
await b.close(); process.exit(fail?1:0);
