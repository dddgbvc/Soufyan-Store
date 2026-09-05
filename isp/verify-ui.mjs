/**
 * فحص واجهة اختياري لنسخة الفانيلا.
 *
 *   npx http-server -p 8899 .
 *   node isp/verify-ui.mjs
 *
 * يحتاج Playwright مثبَّتاً (`npm i -g playwright`). التطبيق نفسه لا يحتاج شيئاً:
 * هذا الملف أداة تحقق، لا اعتمادية على المنتج.
 *
 * BASE  عنوان الصفحة (افتراضياً http://localhost:8899/isp/)
 * OUT   مجلد لقطات الشاشة (افتراضياً ./.verify-output)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.env.BASE ?? 'http://localhost:8899/isp/';
const OUT = process.env.OUT ?? './.verify-output';
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  // الخطوط الخارجية محجوبة في بيئة الفحص؛ الصفحة تعود لخطوط النظام.
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
    errors.push('console: ' + m.text());
  }
});

await page.goto(URL_BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

check('page is RTL Arabic',
  (await page.getAttribute('html', 'dir')) === 'rtl' && (await page.getAttribute('html', 'lang')) === 'ar');

const bodyBefore = await page.textContent('body');
check('dashboard is gated before provider login', bodyBefore.includes('لم يتم الاتصال بأي مزود'));
check('both providers are listed', bodyBefore.includes('مزود تجريبي') && bodyBefore.includes('Earthlink'));
await page.screenshot({ path: `${OUT}/1-gate.png`, fullPage: true });

// --- login -----------------------------------------------------------------
await page.getByRole('button', { name: 'اتصال' }).first().click();
await page.waitForSelector('[role="dialog"]');
await page.waitForSelector('#login-mock-username', { timeout: 10000 });
const modalText = await page.textContent('[role="dialog"]');
check('login form is generated from the adapter schema',
  modalText.includes('رمز الوكيل') && modalText.includes('كلمة المرور'));
check('login modal is Yaqoot-branded', modalText.includes('ياقوت ERP'));
await page.screenshot({ path: `${OUT}/2-login.png`, fullPage: true });

await page.fill('#login-mock-username', 'agent');
await page.fill('#login-mock-password', 'wrong-password');
await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')]
  .some((el) => el.textContent.includes('غير صحيحة')), undefined, { timeout: 8000 });
const alertText = (await page.locator('[role="alert"]').allTextContents()).join(' | ');
check('wrong credentials show an Arabic operator-safe error',
  alertText.includes('غير صحيحة') && !/http|token|stack|password/i.test(alertText), alertText.trim());

await page.fill('#login-mock-password', 'demo1234');
await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 10000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/3-dashboard-full.png`, fullPage: true });

const dash = await page.textContent('body');
check('connected state is shown', dash.includes('متصل'));
check('subscriber metric rendered', dash.includes('المشتركون الفعّالون'));
check('session widget present for a full provider', dash.includes('الجلسات المتصلة'));
check('wallet widget present for a full provider', dash.includes('رصيد المحفظة'));
check('test-accounts widget present for a full provider', dash.includes('الحسابات التجريبية'));
check('wallet has a real number', /IQD/.test(dash));

// --- profile switch: basic -------------------------------------------------
await page.selectOption('#profile-select', 'basic');
await page.waitForTimeout(1800);
const basic = await page.textContent('body');
const basicTitles = await page.evaluate(() =>
  [...document.querySelectorAll('.widget-title')].map((n) => n.textContent));
check('basic profile hides the wallet value but explains it',
  basic.includes('رصيد المحفظة') && basic.includes('غير مدعوم لدى هذا المزود'));
check('basic profile drops the sessions widget content',
  basic.includes('الجلسات المتصلة') && basic.includes('حالة الاتصال المباشر غير متاحة'));
check('basic profile hides test accounts entirely', !basicTitles.includes('الحسابات التجريبية'),
  basicTitles.join(' | '));
check('basic profile hides wallet movements entirely', !basicTitles.includes('حركات المحفظة'));
await page.screenshot({ path: `${OUT}/4-dashboard-basic.png`, fullPage: true });

// --- profile switch: wireless ---------------------------------------------
await page.selectOption('#profile-select', 'wireless');
await page.waitForTimeout(1800);
const wireless = await page.textContent('body');
const wirelessTitles = await page.evaluate(() =>
  [...document.querySelectorAll('.widget-title')].map((n) => n.textContent));
check('wireless profile shows test accounts', wirelessTitles.includes('الحسابات التجريبية'));
check('wireless profile has no wallet widget value', wireless.includes('هذا المزود لا يعرض رصيد محفظة'));

// --- readonly --------------------------------------------------------------
await page.selectOption('#profile-select', 'readonly');
await page.waitForTimeout(1800);
const readonly = await page.textContent('body');
check('read-only provider is badged read-only', readonly.includes('قراءة فقط'));

// --- back to full for subscriber work -------------------------------------
await page.selectOption('#profile-select', 'full');
await page.waitForTimeout(1800);

// --- role gating -----------------------------------------------------------
await page.selectOption('#role-select', 'CASHIER');
await page.waitForTimeout(900);
const cashierTitles = await page.evaluate(() =>
  [...document.querySelectorAll('.widget-title')].map((n) => n.textContent));
check('cashier role hides wallet + revenue widgets',
  !cashierTitles.includes('رصيد المحفظة') && !cashierTitles.includes('إيراد اليوم'),
  cashierTitles.join(' | '));
await page.selectOption('#role-select', 'ADMIN');
await page.waitForTimeout(900);

// --- subscribers -----------------------------------------------------------
await page.getByRole('link', { name: 'المشتركون' }).click();
await page.waitForSelector('table tbody tr', { timeout: 15000 });
const subs = await page.textContent('body');
check('subscriber registry loads rows', /SUB-\d{5}/.test(subs));
check('registry shows username column for a PPPoE/FTTH provider', subs.includes('اسم المستخدم'));
await page.screenshot({ path: `${OUT}/5-subscribers.png`, fullPage: true });

await page.fill('#sub-search', 'SUB-01005');
await page.waitForFunction(() => {
  const rows = document.querySelectorAll('table tbody tr');
  return rows.length === 1 && rows[0].textContent.includes('SUB-01005');
}, undefined, { timeout: 10000 });
check('search narrows the registry to the matching subscriber', true);

// --- subscriber drawer + renewal ------------------------------------------
await page.locator('table tbody tr button.row-button').first().click();
await page.waitForSelector('aside[role="dialog"]', { timeout: 10000 });
await page.waitForTimeout(700);
const drawer = await page.textContent('aside[role="dialog"]');
check('drawer shows subscription + session sections',
  drawer.includes('الاشتراك') && drawer.includes('الجلسة الحالية'));
check('drawer offers renewal for a provider that supports it', drawer.includes('نفّذ التجديد'));
await page.screenshot({ path: `${OUT}/6-drawer.png`, fullPage: true });

await page.getByRole('button', { name: 'احسب خطة التجديد' }).click();
await page.waitForFunction(
  () => document.querySelector('aside[role="dialog"]').textContent.includes('الانتهاء الجديد'),
  undefined, { timeout: 8000 });
const plan = await page.textContent('aside[role="dialog"]');
check('renewal plan shows price, cost origin and computed expiry',
  plan.includes('السعر') && plan.includes('من المزود') && plan.includes('الانتهاء الجديد'));

await page.getByRole('button', { name: 'نفّذ التجديد' }).click();
await page.waitForFunction(
  () => document.querySelector('aside[role="dialog"]').textContent.includes('نُفِّذ التجديد'),
  undefined, { timeout: 8000 });
check('renewal executes and reports success', true);
await page.screenshot({ path: `${OUT}/7-renewed.png`, fullPage: true });
await page.keyboard.press('Escape');

// --- unconfigured provider shows its state, not a fake form ---------------
await page.goto(URL_BASE + '#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'اتصال' }).last().click();
await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
await page.waitForTimeout(600);
const earthlinkModal = await page.textContent('[role="dialog"]');
check('unconfigured adapter shows its state instead of a fake login form',
  earthlinkModal.includes('غير مُفعّل')
  && (await page.locator('[role="dialog"] input').count()) === 0);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// --- capability matrix -----------------------------------------------------
await page.getByRole('link', { name: 'قدرات المزودين' }).click();
await page.waitForTimeout(700);
const matrix = await page.textContent('body');
check('capability matrix renders states', matrix.includes('مدعوم'));
check('matrix shows unknown for the undocumented adapter', matrix.includes('غير معروف'));
await page.screenshot({ path: `${OUT}/8-matrix.png`, fullPage: true });

await page.locator('table button.cell-button').first().click();
await page.waitForTimeout(400);
const detail = await page.textContent('body');
check('capability drill-down shows backing adapter methods', detail.includes('دوال المحوّل المرتبطة'));

// --- in-page checks --------------------------------------------------------
await page.getByRole('link', { name: 'الفحوصات' }).click();
await page.waitForFunction(() => Array.isArray(window.__ispChecks), undefined, { timeout: 60000 });
const suites = await page.evaluate(() => window.__ispChecks);
const flat = suites.flatMap((s) => s.cases.map((c) => ({ suite: s.title, ...c })));
const failedChecks = flat.filter((c) => !c.pass);
check(`in-page suite: ${flat.length - failedChecks.length}/${flat.length} pass`,
  failedChecks.length === 0,
  failedChecks.map((c) => `${c.suite} › ${c.name}: ${c.detail}`).join(' | '));
await page.screenshot({ path: `${OUT}/9-checks.png`, fullPage: true });

// --- theme + mobile --------------------------------------------------------
await page.getByRole('button', { name: 'تبديل السمة الفاتحة والداكنة' }).click();
await page.waitForTimeout(400);
check('theme toggle switches data-theme',
  ['dark', 'light'].includes(await page.getAttribute('html', 'data-theme')));
await page.screenshot({ path: `${OUT}/10-theme.png`, fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(URL_BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow on mobile', overflow <= 1, `overflow=${overflow}px`);
await page.screenshot({ path: `${OUT}/11-mobile.png`, fullPage: true });

check('no uncaught client exceptions', errors.length === 0, errors.slice(0, 4).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
