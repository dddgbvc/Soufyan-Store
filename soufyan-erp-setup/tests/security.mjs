/**
 * مجموعة الأمان — كل فحص هنا يعيد تنفيذ استغلال حقيقي ويتأكّد أنه أُغلق
 * ---------------------------------------------------------------------------
 * ليست فحوص «هل الكود يبدو صحيحًا». كل قسم يعيد بناء الهجوم كما يُنفَّذ فعلًا
 * من متصفّح المستخدم، ثم يقيس النتيجة. والردود المحاكاة هي عقود الخادم
 * الحقيقية (tests/contracts.mjs) المنسوخة عن نواتج نُفِّذت على قاعدة الإنتاج.
 *
 *   node tests/run.mjs security
 */
import { chromium } from './pw.mjs';
import { routeSupabase, rpcResponse, SESSION, TOKEN, USER, PERMISSIONS } from './contracts.mjs';

const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';

const ADMIN   = { id: USER.id, display_name: 'سفيان يوسف', full_name: 'سفيان يوسف', role: 'ADMIN',   status: 'active' };
const CASHIER = { id: USER.id, display_name: 'سفيان يوسف', full_name: 'سفيان يوسف', role: 'CASHIER', status: 'active' };

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };

const b = await chromium.launch({ executablePath: EXE });
const newPage = async (o = {}, seen = []) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await routeSupabase(p, o, seen);
  return { ctx, p };
};
const signIn = async (p, pw = 'S3cret-pass') => {
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  await p.fill('#f_loginEmail', USER.email); await p.fill('#f_loginPassword', pw);
  await p.click('[data-go]'); await p.waitForTimeout(1500);
};
/** يكتب مؤشّر جلسة مزوَّرًا كما يفعل مهاجم في أدوات المطوّر. */
const forgeSession = (p, over = {}) => p.evaluate(([s, o]) => {
  const term = localStorage.getItem('soufyan.erp.terminal.v1') || 'x';
  localStorage.setItem('soufyan.erp.session.v1', JSON.stringify(Object.assign({
    v: 1, sessionId: s, method: 'password', at: new Date().toISOString(),
    employee: { id: 'forged', name: 'مزوَّر', role: 'ADMIN' },
    permissions: ['dashboard','pos','inventory','vaults','analytics','settings','expenses','purchases'],
    terminal: term,
  }, o)));
}, [SESSION, over]);

/* ========================================================================== */
/* 1) انتحال الجلسة — الثغرة الرئيسية في V6                                   */
/* ========================================================================== */
console.log('\n— انتحال جلسة من المتصفح (P0-1) —');
{
  // المهاجم يفتح جلسة مجهولة عبر app_session_start (متاحة لـ anon)، ثم يكتب
  // مؤشّرها في متصفّحه مع role:"ADMIN". على الخادم تبقى الجلسة بلا employee_id،
  // فتردّ whoami بـ reason:"anonymous".
  const { ctx, p } = await newPage({ anonymousSession: true });
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(900);
  await forgeSession(p);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1600);

  ok(await p.textContent('#stepTitle') !== 'أهلًا مزوَّر', 'مؤشّر جلسة مزوَّر لا يفتح النظام');
  ok(await p.isVisible('#f_loginPassword'), 'ويعود المستخدم إلى شاشة الدخول');
  ok(await p.evaluate(() => ERPSetup.auth.isAuthenticated()) === false, 'ولا جلسة موثَّقة في الواجهة');
  ok(await p.evaluate(() => ERPSetup.auth.can('settings')) === false, 'ولا صلاحية «الإعدادات» المزعومة');
  ok(await p.evaluate(() => localStorage.getItem('soufyan.erp.session.v1')) === null,
     'والمؤشّر المرفوض يُمحى بدل أن يُعاد تجريبه');
  if (SHOTS) await p.screenshot({ path: SHOTS + 'sec-forged-session.png' });
  await ctx.close();
}

/* ========================================================================== */
/* 2) الدور والصلاحيات لا تُقرأ من المتصفح                                     */
/* ========================================================================== */
console.log('\n— ترقية الدور من التخزين (P0-1 ب) —');
{
  const seen = [];
  // الخادم يعرف هذا الحساب كـ CASHIER (صلاحية واحدة: pos).
  const { ctx, p } = await newPage({ profile: CASHIER }, seen);
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  await signIn(p);
  const before = await p.$$eval('.perm-list li', n => n.map(x => x.textContent));
  ok(before.length === 1, `الخادم منح صلاحية واحدة فقط (${before.length})`);

  // المهاجم يرفع دوره وصلاحياته في التخزين ثم يُقلع من جديد.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('soufyan.erp.session.v1'));
    s.employee.role = 'ADMIN';
    s.permissions = ['dashboard','pos','inventory','vaults','analytics','settings','expenses','purchases'];
    localStorage.setItem('soufyan.erp.session.v1', JSON.stringify(s));
  });
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1600);

  const after = await p.$$eval('.perm-list li', n => n.map(x => x.textContent));
  ok(after.length === 1, `بعد التزوير تبقى صلاحية واحدة كما قال الخادم (${after.length})`);
  ok(await p.evaluate(() => ERPSetup.auth.can('settings')) === false, 'و«الإعدادات» ما تزال ممنوعة');
  ok(await p.evaluate(() => ERPSetup.auth.user().employee.role) === 'CASHIER',
     'والدور المعروض هو دور الخادم لا دور التخزين');
  // والمخزَّن نفسه يُصحَّح بما قاله الخادم، فلا يبقى ادّعاء معلّقًا.
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('soufyan.erp.session.v1')).employee.role) === 'CASHIER',
     'ويُعاد كتابة المخزَّن بما أصدره الخادم');
  await ctx.close();
}

/* ========================================================================== */
/* 3) الربط بالجهاز يُفرض على الخادم                                           */
/* ========================================================================== */
console.log('\n— نسخ الجلسة إلى جهاز آخر (P0-1 ج) —');
{
  // الخادم سجّل الجلسة على معرّف جهاز آخر، فيردّ reason:"terminal".
  const { ctx, p } = await newPage({ profile: ADMIN, terminal: 'الجهاز-الأصلي' });
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  await forgeSession(p, { employee: { id: USER.id, name: 'سفيان يوسف', role: 'ADMIN' } });
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1600);
  ok(await p.isVisible('#f_loginPassword'), 'مؤشّر منسوخ من جهاز آخر يرفضه الخادم');

  // والأهم: الرفض جاء من الخادم لا من فحص في المتصفح. نحذف فحص العميل
  // (نجعل معرّف الجهاز مطابقًا لما في التخزين) ويبقى الرفض قائمًا.
  ok(await p.evaluate(() => ERPSetup.auth.isAuthenticated()) === false, 'ولا تُمنح جلسة رغم تطابق ما في التخزين');
  await ctx.close();
}

/* ========================================================================== */
/* 4) الانقطاع لا يُستعمل لتمرير تزوير                                         */
/* ========================================================================== */
console.log('\n— قطع الشبكة بعد التزوير —');
{
  const { ctx, p } = await newPage({ profile: ADMIN });
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  await signIn(p);
  ok(await p.evaluate(() => ERPSetup.auth.can('settings')) === true, 'دخول حقيقي بدور ADMIN يمنح «الإعدادات»');

  // المهاجم يرفع صلاحياته ثم يقطع الشبكة ليقع في فرع مهلة السماح.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('soufyan.erp.session.v1'));
    s.employee.role = 'ADMIN'; s.permissions = ['settings','vaults','analytics'];
    localStorage.setItem('soufyan.erp.session.v1', JSON.stringify(s));
  });
  await p.unroute('**/rest/v1/rpc/**');
  await p.route('**/rest/v1/rpc/**', r => r.abort());
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1700);

  ok(await p.textContent('#stepTitle') === 'أهلًا سفيان يوسف', 'الجلسة تبقى معروضة أثناء الانقطاع');
  ok(await p.evaluate(() => ERPSetup.auth.user().offline) === true, 'وحالة الانقطاع معلنة');
  ok(await p.evaluate(() => ERPSetup.auth.can('settings')) === false,
     'لكن لا صلاحية تُمنح من مخزَّن لم يؤكّده الخادم');
  await ctx.close();
}

/* ========================================================================== */
/* 5) تجاوز خطوات الإعداد ونداء التهيئة مباشرةً                                */
/* ========================================================================== */
console.log('\n— تجاوز خطوات الإعداد (منطق الأعمال) —');
{
  const seen = [];
  const { ctx, p } = await newPage({}, seen);
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  await p.click('[data-door="setup"]'); await p.waitForTimeout(700);

  // (أ) بلا جلسة مالك، التهيئة ترفض قبل أن تغادر المتصفح.
  const noAuth = await p.evaluate(async () => {
    try { await ERPSetup.services.SetupService.run('finalize', ERPSetup.state.data); return 'resolved'; }
    catch (e) { return 'threw:' + (e && e.code); }
  });
  ok(noAuth === 'threw:unauthorized', 'استدعاء التهيئة بلا جلسة مالك يُرفض');
  ok(!seen.some(x => x.fn === 'setup-provision'), 'ولا يصل النداء إلى الخادم أصلًا');

  // (ب) بجلسة حقيقية — نحصل عليها بدخول فعلي، لا بباب خلفي في الكود.
  //     عندها يفرض الخادم الترتيب: finalize قبل ما قبلها ⇒ 409 incomplete.
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
  await signIn(p);
  ok(await p.evaluate(() => !!ERPSetup.auth.session.token), 'الدخول يضع رمز الوصول في الذاكرة');

  await p.unroute('**/functions/v1/setup-provision**');
  await p.route('**/functions/v1/setup-provision**', r => r.fulfill({
    status: 409, contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'incomplete', missing: ['workspace','store','inventory','products','defaults'] }),
  }));
  const skipped = await p.evaluate(async () => {
    try { await ERPSetup.services.SetupService.run('finalize', ERPSetup.state.data); return 'resolved'; }
    catch (e) { return 'threw:' + (e && e.detail); }
  });
  ok(skipped === 'threw:incomplete', 'وبجلسة صالحة يرفض الخادم finalize قبل الخطوات التي تسبقها');
  await ctx.close();
}

/* ========================================================================== */
/* 6) التهيئة idempotent — إعادة الإرسال لا تُكرّر                              */
/* ========================================================================== */
console.log('\n— إعادة إرسال التهيئة —');
{
  const seen = [];
  const { ctx, p } = await newPage({}, seen);
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  await signIn(p);
  const keys = await p.evaluate(async () => {
    const a = await ERPSetup.services.SetupService.run('workspace', ERPSetup.state.data);
    const b = await ERPSetup.services.SetupService.run('workspace', ERPSetup.state.data);
    return [a.task, b.task];
  });
  ok(keys[0] === 'workspace' && keys[1] === 'workspace', 'إعادة تنفيذ المهمة نفسها تنجح بلا خطأ');
  const runKeys = new Set(seen.filter(x => x.fn === 'setup-provision').map(x => x.runKey));
  ok(runKeys.size === 1, `النداءان يحملان مفتاح التشغيل نفسه (${runKeys.size})`);
  ok([...runKeys][0] && /^run-[0-9a-f]{32}$/.test([...runKeys][0]), 'ومفتاح التشغيل عشوائي بطول كافٍ');
  await ctx.close();
}

/* ========================================================================== */
/* 7) لا أسرار في التخزين                                                      */
/* ========================================================================== */
console.log('\n— ما يُكتب في المتصفح —');
{
  const { ctx, p } = await newPage({ profile: ADMIN });
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  await signIn(p);
  const dump = await p.evaluate(() => {
    const all = { local: {}, session: {} };
    for (let i = 0; i < localStorage.length; i++) all.local[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
    for (let i = 0; i < sessionStorage.length; i++) all.session[sessionStorage.key(i)] = sessionStorage.getItem(sessionStorage.key(i));
    return JSON.stringify(all);
  });
  ok(!dump.includes('S3cret-pass'), 'كلمة المرور لا تُكتب في أي تخزين');
  ok(!dump.includes(TOKEN), 'ولا رمز الوصول');
  ok(!/refresh_token|access_token/.test(dump), 'ولا أي مفتاح يشبه رمز التحديث');
  ok(!/"pin"|pin_hash|\botp\b/i.test(dump), 'ولا رمز دخول ولا بصمته ولا رمز بريد');
  await ctx.close();
}

/* ========================================================================== */
/* 8) XSS — أسماء يكتبها المستخدم تُعرض نصًّا لا شيفرة                          */
/* ========================================================================== */
console.log('\n— حقن نصّي في الحقول —');
{
  const { ctx, p } = await newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  const PAYLOAD = '<img src=x onerror="window.__xss=1">';
  await p.evaluate(v => {
    ERPSetup.state.data.storeData.storeName = v;
    ERPSetup.state.data.storeData.shopName = v;
    ERPSetup.state.data.ownerData.name = v;
    ERPSetup.state.data.employees = [{ id:'e1', name:v, email:'a@b.co', role:'cashier', status:'active', permissions:[] }];
    ERPSetup.state.saveNow();
  }, PAYLOAD);
  await p.click('[data-door="setup"]'); await p.waitForTimeout(700);
  await p.evaluate(() => { const i = Wizard.indexOf('review'); if (i >= 0) Wizard.goTo(i, true); });
  await p.waitForTimeout(1200);

  ok(await p.evaluate(() => window.__xss === undefined), 'الحمولة لم تُنفَّذ في شاشة المراجعة');
  ok(await p.evaluate(() => document.querySelectorAll('img[src="x"]').length) === 0, 'ولم تُركَّب كعنصر HTML');
  const shown = await p.evaluate(() => document.body.innerText);
  ok(shown.includes('<img src=x'), 'وتُعرض كنصّ كما كتبها المستخدم');

  // ونفس الشيء على شاشة الاكتمال حيث يُطبع اسم المحل بارزًا.
  await p.evaluate(() => { const i = Wizard.indexOf('complete'); if (i >= 0) Wizard.goTo(i, true); });
  await p.waitForTimeout(900);
  ok(await p.evaluate(() => window.__xss === undefined), 'ولا في شاشة الاكتمال');
  await ctx.close();
}

/* ========================================================================== */
/* 9) رسائل الخطأ لا تسرّب داخليات                                             */
/* ========================================================================== */
console.log('\n— تسريب المعلومات في الأخطاء —');
{
  const { ctx, p } = await newPage();
  await p.route('**/auth/v1/token**', r => r.fulfill({
    status: 500, contentType: 'application/json',
    body: JSON.stringify({
      code: 'PGRST301',
      message: 'relation "auth.users" does not exist',
      hint: 'SELECT * FROM auth.users WHERE email = $1',
      detail: 'at /supabase/gotrue/internal/api/token.go:214',
    }),
  }));
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  await signIn(p);
  const shown = await p.textContent('[data-login-err]');
  ok(!/auth\.users|SELECT|PGRST|\.go:|relation/i.test(shown), 'لا SQL ولا مسار ملف ولا رمز داخلي في الرسالة');
  ok(shown.trim().length > 0, 'ومع ذلك يُقال للمستخدم شيء مفيد');
  await ctx.close();
}

/* ========================================================================== */
/* 10) CSP موجودة ومقيّدة                                                      */
/* ========================================================================== */
console.log('\n— سياسة أمان المحتوى —');
{
  const { ctx, p } = await newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  const csp = await p.evaluate(() => {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return m ? m.getAttribute('content').replace(/\s+/g, ' ').trim() : '';
  });
  ok(csp.length > 0, 'الصفحة تحمل CSP');
  ok(/object-src 'none'/.test(csp), "object-src 'none'");
  ok(/base-uri 'self'/.test(csp), "base-uri 'self'");
  ok(/form-action 'self'/.test(csp), "form-action 'self'");
  ok(/connect-src[^;]*supabase\.co/.test(csp) && !/connect-src[^;]*\*/.test(csp),
     'connect-src مثبَّتة على مشروع Supabase وحده — لا تسريب إلى نطاق آخر');
  ok(!/script-src[^;]*unsafe-eval/.test(csp), "ولا unsafe-eval");
  const inlineHandlers = await p.evaluate(() =>
    document.querySelectorAll('[onclick],[onerror],[onload],[onmouseover]').length);
  ok(inlineHandlers === 0, 'ولا معالج حدث سطري في الصفحة (فالترقية إلى البصمات ممكنة)');
  await ctx.close();
}

/* ========================================================================== */
console.log(`\n${pass} pass · ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
