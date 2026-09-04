import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.OUT ?? './.verify-output';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${BASE}/isp`, { waitUntil: 'networkidle' });

// --- RTL --------------------------------------------------------------
check('page is RTL Arabic', await page.getAttribute('html', 'dir') === 'rtl'
  && await page.getAttribute('html', 'lang') === 'ar');

// --- Login gate -------------------------------------------------------
const bodyBefore = await page.textContent('body');
check('dashboard is gated before provider login',
  bodyBefore.includes('لم يتم الاتصال بأي مزود'));

await page.screenshot({ path: `${OUT}/ui-1-gate.png`, fullPage: true });

// open login for the mock provider (first "اتصال" button)
await page.getByRole('button', { name: 'اتصال' }).first().click();
await page.waitForSelector('[role="dialog"]');
check('provider login modal opens', true);

// wait for the adapter's field schema to arrive before asserting on it
await page.waitForSelector('#login-mock-username', { timeout: 15000 });
const modalText = await page.textContent('[role="dialog"]');
check('login form is generated from the adapter schema',
  modalText.includes('رمز الوكيل') && modalText.includes('كلمة المرور'));
check('login modal is Yaqoot-branded, not a vendor portal',
  modalText.includes('ياقوت ERP'));

await page.screenshot({ path: `${OUT}/ui-2-login.png`, fullPage: true });

// --- Wrong credentials -------------------------------------------------
await page.fill('#login-mock-username', 'agent');
await page.fill('#login-mock-password', 'wrong-password');
await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
// field-level validation messages are also role=alert, so read them all
await page.waitForFunction(
  () => [...document.querySelectorAll('[role="alert"]')]
    .some((el) => el.textContent.includes('غير صحيحة')),
  undefined, { timeout: 15000 });
const alertText = (await page.locator('[role="alert"]').allTextContents()).join(' | ');
check('wrong credentials show an Arabic operator-safe error',
  alertText.includes('غير صحيحة') && !/http|token|stack|password/i.test(alertText),
  alertText.trim());

// --- Correct credentials ----------------------------------------------
await page.fill('#login-mock-password', 'demo1234');
await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 15000 });
await page.waitForLoadState('networkidle');
check('authentication + capability discovery completes', true);

await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/ui-3-dashboard-full.png`, fullPage: true });

const dash = await page.textContent('body');
check('connected state is shown', dash.includes('متصل'));
check('subscriber metric rendered', dash.includes('المشتركون الفعّالون'));
check('session widget present for a full provider', dash.includes('الجلسات المتصلة'));
check('wallet widget present for a full provider', dash.includes('رصيد المحفظة'));
check('test-accounts widget present for a full provider', dash.includes('الحسابات التجريبية'));

// --- Subscriber registry ----------------------------------------------
await page.getByRole('link', { name: 'المشتركون' }).click();
await page.waitForLoadState('networkidle');
// dev server compiles this route on demand; wait for real rows, not a timeout
await page.waitForSelector('table tbody tr', { timeout: 30000 });
const subsText = await page.textContent('body');
check('subscriber registry loads rows', /SUB-\d{5}/.test(subsText));
check('registry shows username column for a PPPoE/FTTH provider',
  subsText.includes('اسم المستخدم'));
await page.screenshot({ path: `${OUT}/ui-4-subscribers.png`, fullPage: true });

// search
await page.fill('#sub-search', 'SUB-01005');
await page.waitForFunction(() => {
  const rows = document.querySelectorAll('table tbody tr');
  return rows.length === 1 && rows[0].textContent.includes('SUB-01005');
}, undefined, { timeout: 15000 });
check('search narrows the registry to the matching subscriber', true);

// --- Capability matrix -------------------------------------------------
await page.getByRole('link', { name: 'قدرات المزودين' }).click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(800);
const matrix = await page.textContent('body');
check('capability matrix renders states', matrix.includes('مدعوم'));
check('matrix shows unknown for the undocumented adapter', matrix.includes('غير معروف'));
await page.screenshot({ path: `${OUT}/ui-5-matrix.png`, fullPage: true });

// drill-down
await page.locator('table button').first().click();
await page.waitForTimeout(400);
const detail = await page.textContent('body');
check('capability drill-down shows backing adapter methods',
  detail.includes('دوال المحوّل المرتبطة'));

// --- Mobile responsive -------------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/isp`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow on mobile', overflow <= 1, `overflow=${overflow}px`);
await page.screenshot({ path: `${OUT}/ui-6-mobile.png`, fullPage: true });

check('no uncaught client exceptions', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} UI checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
