/**
 * مجموعة الوضع التجريبي — تختبر الافتراضي المُسلَّم فعلًا
 * ---------------------------------------------------------------------------
 * بقية المجموعات تُثبِّت `demoMode:false` لتختبر المسار الحقيقي. هذه وحدها
 * تختبر ما يفتحه المستخدم عند فكّ الأرشيف.
 *
 * ما تتحقّق منه، وهو جوهر «معلَن لا صامت»:
 *   • لا نداء واحد يغادر الصفحة إلى Supabase — الفصل تامّ لا جزئي.
 *   • كل شاشة تحمل شارة «وضع تجريبي» — لا يمكن أن يظنّه أحد تشغيلًا حقيقيًا.
 *   • المسار كامل يعمل: بوابة ← دخول ← نظام ← تحديث ← خروج.
 *   • لا فاتورة بديلة تُرسم — القالب على الخادم، ويُقال ذلك صراحةً.
 *   • بيانات التجربة معزولة تحت `soufyan.erp.demo.*`.
 *
 *   node tests/run.mjs demo
 */
import { chromium } from './pw.mjs';

const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };

const b = await chromium.launch({ executablePath: EXE });
const hits = [];   // كل نداء يحاول الوصول إلى Supabase
const errs = [];

const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.on('request', r => { if (/supabase\.co/.test(r.url())) hits.push(r.url().split('?')[0]); });
p.on('pageerror', e => errs.push(e.message));
await p.route('**/fonts.googleapis.com/**', r => r.abort());
// لا نعترض supabase.co عمدًا: أي نداء سيظهر في hits ويُسقِط الفحص.

/* ---- الإقلاع ---- */
console.log('\n— الإقلاع في الوضع التجريبي —');
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
ok(await p.evaluate(() => ERPSetup.config.demoMode) === true, 'الملف المُسلَّم يعمل بالوضع التجريبي');
ok(await p.textContent('#stepTitle') === 'أهلًا بك', 'البوابة تظهر');
const badge = await p.textContent('#hActions');
ok(badge.includes('وضع تجريبي'), 'ونصّ «وضع تجريبي» موجود في الرأس');

/* الرؤية لا وجود النصّ.
   الفحص الأول كان يقرأ textContent فقط، فمرّ رغم أن
   `@media (max-width:900px){ .mode-flag{display:none} }` كانت تُخفي الشارة —
   والآيباد بعرض ٨٣٤. أي أن الجهاز الذي تُجرَّب عليه النسخة غالبًا هو الوحيد
   الذي لا يرى التنبيه. تُقاس الرؤية الآن على أربعة عروض. */
for (const w of [390, 834, 1024, 1440]) {
  await p.setViewportSize({ width: w, height: 900 });
  await p.waitForTimeout(250);
  const seen = await p.evaluate(() => {
    const el = document.querySelector('#demoStrip');
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.height > 6 && r.width > 100 && cs.visibility !== 'hidden' && cs.display !== 'none';
  });
  ok(seen, `شريط الوضع التجريبي مرئي فعلًا عند عرض ${w}px`);
}
await p.setViewportSize({ width: 1280, height: 900 });

/* ---- الدخول ---- */
console.log('\n— الدخول التجريبي —');
await p.click('[data-door="login"]'); await p.waitForTimeout(600);
await p.fill('#f_loginEmail', 'anyone@example.com');
await p.fill('#f_loginPassword', 'whatever-8-chars');
await p.click('[data-go]'); await p.waitForTimeout(1600);
ok((await p.textContent('#stepTitle')).startsWith('أهلًا'), 'أي بريد وكلمة مرور يفتحان النظام (وهذا معلَن)');
ok(await p.evaluate(() => ERPSetup.auth.isAuthenticated()) === true, 'وتُنشأ جلسة تجريبية');
ok((await p.textContent('#hActions')).includes('وضع تجريبي'), 'والشارة باقية بعد الدخول');

/* ---- بريد قصير أو كلمة قصيرة تُرفض حتى في التجربة ---- */
await p.evaluate(() => ERPSetup.auth.session.end('logout'));
await p.waitForTimeout(500);
await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000);
await p.click('[data-door="login"]'); await p.waitForTimeout(600);
await p.fill('#f_loginEmail', 'not-an-email');
await p.fill('#f_loginPassword', 'short');
await p.click('[data-go]'); await p.waitForTimeout(1200);
ok(await p.isVisible('#f_loginPassword'), 'مدخل غير صالح لا يمرّ حتى في الوضع التجريبي');

/* ---- الاستئناف بعد التحديث ---- */
console.log('\n— الاستئناف والخروج —');
await p.fill('#f_loginEmail', 'owner@example.com');
await p.fill('#f_loginPassword', 'whatever-8-chars');
await p.click('[data-go]'); await p.waitForTimeout(1600);
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
ok((await p.textContent('#stepTitle')).startsWith('أهلًا'), 'التحديث لا يُخرج المستخدم');

/* ---- الجلسة التجريبية تُفحص أيضًا ---- */
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('soufyan.erp.session.v1'));
  s.sessionId = 'demo-forged-not-real';
  localStorage.setItem('soufyan.erp.session.v1', JSON.stringify(s));
});
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
ok(await p.isVisible('#f_loginPassword'), 'ومؤشّر جلسة لا يعرفه المخزن التجريبي يُرفض كذلك');

/* ---- الفاتورة: لا بديل مرسوم ---- */
console.log('\n— الفاتورة في الوضع التجريبي —');
await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000);
await p.click('[data-door="setup"]'); await p.waitForTimeout(800);
await p.evaluate(() => { const i = Wizard.indexOf('invoices'); if (i >= 0) Wizard.goTo(i, true); });
await p.waitForTimeout(1800);
const inv = await p.textContent('.step-body');
ok(/تحتاج الخادم|demoMode/.test(inv), 'يُقال صراحةً إن المعاينة تحتاج الخادم');
ok(!/فاتورة تجريبية|mock/i.test(inv), 'ولا تُرسم فاتورة بديلة');

/* ---- العزل والانفصال ---- */
console.log('\n— العزل ---');
const keys = await p.evaluate(() => Object.keys(localStorage));
const stray = keys.filter(k => k.startsWith('soufyan.erp.')
  && !k.startsWith('soufyan.erp.demo.')
  && !['soufyan.erp.setup.v1', 'soufyan.erp.session.v1', 'soufyan.erp.terminal.v1', 'soufyan.erp.terminal.seen'].includes(k));
ok(stray.length === 0, `بيانات التجربة معزولة تحت soufyan.erp.demo.* (${stray.join(', ') || 'لا شوارد'})`);

const dump = await p.evaluate(() => JSON.stringify(localStorage));
ok(!dump.includes('whatever-8-chars'), 'ولا تُكتب كلمة المرور حتى في الوضع التجريبي');

ok(hits.length === 0, `صفر نداء إلى Supabase — الفصل تامّ (${hits.length ? hits.slice(0, 3).join(', ') : 'لا شيء'})`);
ok(errs.length === 0, 'بلا أخطاء JavaScript: ' + errs.slice(0, 2).join(' | '));
if (SHOTS) await p.screenshot({ path: SHOTS + 'demo-mode.png' });

await ctx.close();
console.log(`\n${pass} pass · ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
