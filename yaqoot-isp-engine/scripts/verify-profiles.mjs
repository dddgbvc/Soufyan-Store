/**
 * Acceptance proof for the central claim: the UI adapts to provider
 * capabilities. Boots the app once per mock profile, logs in, and records
 * which widgets actually render — no code changes between runs.
 *
 *   node verify-profiles.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const PROFILES = ['full', 'basic', 'readonly', 'wireless'];

async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/isp/providers`);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return false;
}

async function widgetsFor(profile) {
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    env: { ...process.env, ISP_MOCK_PROFILE: profile, ISP_ENABLED_ADAPTERS: 'mock' },
    stdio: 'ignore',
    detached: true,
  });

  try {
    if (!(await waitForServer())) throw new Error(`server did not start for ${profile}`);

    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });

    await page.goto(`${BASE}/isp`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'اتصال' }).first().click();
    await page.waitForSelector('#login-mock-username', { timeout: 20_000 });
    await page.fill('#login-mock-username', 'agent');
    await page.fill('#login-mock-password', 'demo1234');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 20_000 });
    await page.waitForSelector('h3', { timeout: 20_000 });
    await sleep(1200);

    // Widget titles, plus which rendered as "not supported by this provider".
    const widgets = await page.evaluate(() =>
      [...document.querySelectorAll('h3, p.text-sm.font-medium')]
        .map((el) => {
          const card = el.closest('.glass');
          const unsupported = card?.textContent?.includes('غير مدعوم لدى هذا المزود') ?? false;
          return { title: el.textContent?.trim() ?? '', unsupported };
        })
        .filter((w) => w.title.length > 0),
    );

    await page.screenshot({
      path: `${process.env.OUT ?? './.verify-output'}/profile-${profile}.png`,
      fullPage: true,
    });
    await browser.close();
    return widgets;
  } finally {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
    await sleep(1200);
  }
}

mkdirSync((process.env.OUT ?? './.verify-output'), { recursive: true });

const table = {};
for (const profile of PROFILES) {
  const widgets = await widgetsFor(profile);
  table[profile] = {
    shown: widgets.filter((w) => !w.unsupported).map((w) => w.title),
    unsupported: widgets.filter((w) => w.unsupported).map((w) => w.title),
  };
  console.log(`\n=== ${profile} ===`);
  console.log('  rendered    :', table[profile].shown.join('، ') || '(none)');
  console.log('  unsupported :', table[profile].unsupported.join('، ') || '(none)');
}

// --- assertions -----------------------------------------------------------
const fail = [];
const has = (p, t) => table[p].shown.includes(t);
const marked = (p, t) => table[p].unsupported.includes(t);
const absent = (p, t) => !has(p, t) && !marked(p, t);

if (!has('full', 'الجلسات المتصلة')) fail.push('full should show live sessions');
if (!has('full', 'رصيد المحفظة')) fail.push('full should show the wallet');
if (!has('full', 'الحسابات التجريبية')) fail.push('full should show test accounts');

if (has('basic', 'الجلسات المتصلة')) fail.push('basic must not show live sessions');
if (has('basic', 'رصيد المحفظة')) fail.push('basic must not show a wallet');
if (!marked('basic', 'رصيد المحفظة')) fail.push('basic should explain the missing wallet');
if (!absent('basic', 'الحسابات التجريبية')) fail.push('basic should drop test accounts entirely');

if (!absent('readonly', 'الحسابات التجريبية')) fail.push('readonly must hide test accounts (§11)');
if (!has('readonly', 'رصيد المحفظة')) fail.push('readonly still reads the wallet');

if (has('wireless', 'رصيد المحفظة')) fail.push('wireless has no wallet');
if (!has('wireless', 'الجلسات المتصلة')) fail.push('wireless should show live sessions');

console.log('\n--- result ---');
if (fail.length === 0) {
  console.log('PASS: every profile produced a different, capability-correct dashboard.');
  process.exit(0);
}
for (const f of fail) console.log('FAIL:', f);
process.exit(1);
