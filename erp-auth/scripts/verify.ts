/**
 * End-to-end verification against a RUNNING server.
 *
 * Unlike the unit suite, this drives the real HTTP surface — cookies, CSRF,
 * route handlers and all — so it proves the journeys a person actually takes.
 *
 *   npm run build && npm start        # in one terminal
 *   npm run verify                    # in another
 */
import { readFileSync } from 'node:fs';

import { loadEnv } from './load-env';

loadEnv();

const BASE = process.env.VERIFY_BASE_URL ?? 'http://127.0.0.1:3000';
const SERVER_LOG = process.env.VERIFY_SERVER_LOG ?? '';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** A browser-like client: one cookie jar, CSRF echoed back automatically. */
class Client {
  private cookies = new Map<string, string>();

  private cookieHeader(): string {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  }

  private absorb(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      if (index < 1) continue;
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '') this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
  }

  async visit(path: string): Promise<number> {
    const response = await fetch(`${BASE}${path}`, {
      headers: { cookie: this.cookieHeader() },
      redirect: 'manual',
    });
    this.absorb(response);
    return response.status;
  }

  async call<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: T }> {
    const headers: Record<string, string> = {
      cookie: this.cookieHeader(),
      accept: 'application/json',
      origin: BASE,
    };

    const csrf = this.cookies.get('erp_auth_csrf');
    if (csrf) headers['x-csrf-token'] = csrf;
    if (options.body !== undefined) headers['content-type'] = 'application/json';

    const response = await fetch(`${BASE}${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'manual',
    });

    this.absorb(response);
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body: body as T };
  }

  hasSessionCookie(): boolean {
    return Boolean(this.cookies.get('erp_auth_session'));
  }
}

/** Reads the most recent OTP the console mailer printed. */
function latestOtpFromLog(): string | null {
  if (!SERVER_LOG) return null;
  try {
    const log = readFileSync(SERVER_LOG, 'utf8');
    const matches = [...log.matchAll(/: (\d{6})\n/g)];
    return matches.at(-1)?.[1] ?? null;
  } catch {
    return null;
  }
}

// The development fixtures written by `npm run db:seed`. Overridable so the
// script can be pointed at another environment without editing it.
const MANAGER_PIN = process.env.VERIFY_MANAGER_PIN ?? '470182';
const ALI_PIN = process.env.VERIFY_STAFF_PIN ?? '826431';
const DISABLED_PIN = process.env.VERIFY_DISABLED_PIN ?? '735219';

async function main(): Promise<void> {
  console.log(`\nVerifying ${BASE}\n`);

  // ---------------------------------------------------------------- PIN ---
  console.log('PIN login');
  const till = new Client();
  check('login page reachable', (await till.visit('/login')) === 200);

  const wrong = await till.call<{ error: string }>('/api/auth/pin', { body: { pin: '918273' } });
  check('wrong PIN is refused', wrong.status === 401, `got ${wrong.status}`);
  check('wrong PIN answer is generic', wrong.body.error === 'invalid_credentials');
  check('no session issued on failure', !till.hasSessionCookie());

  const disabled = await till.call<{ error: string }>('/api/auth/pin', { body: { pin: DISABLED_PIN } });
  check('disabled account refused despite correct PIN', disabled.body.error === 'account_disabled');

  const login = await till.call<{ employee: { fullName: string }; permissions: string[] }>('/api/auth/pin', {
    body: { pin: MANAGER_PIN },
  });
  check('correct PIN authenticates', login.status === 200, `got ${login.status}`);
  check('employee identified from the PIN alone', login.body.employee?.fullName === 'المدير العام');
  check('permissions loaded', (login.body.permissions?.length ?? 0) >= 30);
  check('session cookie issued', till.hasSessionCookie());

  const session = await till.call<{ authenticated: boolean }>('/api/auth/session');
  check('session resolves on the next request', session.body.authenticated === true);
  check('dashboard renders for a signed-in employee', (await till.visit('/dashboard')) === 200);

  // ------------------------------------------------------ authorization ---
  console.log('\nBackend authorization');
  const ownerEmployees = await till.call<{ employees: unknown[] }>('/api/employees');
  check('owner may list employees', ownerEmployees.status === 200);

  const warehouse = new Client();
  await warehouse.visit('/login');
  const aliLogin = await warehouse.call<{ permissions: string[] }>('/api/auth/pin', { body: { pin: ALI_PIN } });
  check('second employee logs in', aliLogin.status === 200);
  check('holds inventory.view', aliLogin.body.permissions?.includes('inventory.view') === true);
  check('does not hold employees.view', aliLogin.body.permissions?.includes('employees.view') === false);

  const denied = await warehouse.call<{ error: string }>('/api/employees');
  check('API refuses the unauthorised employee', denied.status === 403, `got ${denied.status}`);
  check('refusal is a permission error', denied.body.error === 'forbidden');

  check('the page itself is guarded too', (await warehouse.visit('/dashboard/employees')) === 200);
  check('permitted module opens', (await warehouse.visit('/dashboard/inventory')) === 200);

  // ------------------------------------------------------------- CSRF ----
  console.log('\nRequest forgery protection');
  const forged = await fetch(`${BASE}/api/auth/pin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ pin: MANAGER_PIN }),
  });
  check('cross-origin login attempt is rejected', forged.status === 403, `got ${forged.status}`);

  const noToken = await fetch(`${BASE}/api/auth/pin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: MANAGER_PIN }),
  });
  check('missing CSRF token is rejected', noToken.status === 403, `got ${noToken.status}`);

  // --------------------------------------------------------------- QR ----
  console.log('\nQR passkey');
  const desktop = new Client();
  await desktop.visit('/login');
  const challenge = await desktop.call<{ challengeId: string; pollSecret: string; url: string; image: string }>(
    '/api/auth/qr/challenge',
    { method: 'POST' },
  );
  check('challenge created', challenge.status === 200);
  check('QR carries only a fragment token', /\/approve#t=[A-Za-z0-9_-]+$/.test(challenge.body.url ?? ''));
  check('QR rendered server-side as an inert image', challenge.body.image?.startsWith('data:image/svg+xml;base64,') === true);

  const token = challenge.body.url.split('#t=')[1];
  check('no employee data in the QR payload', !/@|pin|employee/i.test(token));

  const phone = new Client();
  await phone.visit('/approve');
  const preview = await phone.call<{ status: string }>('/api/auth/qr/inspect', { method: 'POST', body: { token } });
  check('phone can inspect a pending challenge', preview.body.status === 'pending');

  const badApproval = await phone.call<{ error: string }>('/api/auth/qr/approve', {
    body: { token, method: 'pin', pin: '918273' },
  });
  check('approval requires real credentials', badApproval.status === 401, `got ${badApproval.status}`);

  const stillPending = await desktop.call<{ status: string }>('/api/auth/qr/status', {
    body: { challengeId: challenge.body.challengeId, pollSecret: challenge.body.pollSecret },
  });
  check('failed approval leaves the challenge pending', stillPending.body.status === 'pending');

  const approval = await phone.call('/api/auth/qr/approve', { body: { token, method: 'pin', pin: ALI_PIN } });
  check('approval with a correct PIN succeeds', approval.status === 200);

  const approved = await desktop.call<{ status: string }>('/api/auth/qr/status', {
    body: { challengeId: challenge.body.challengeId, pollSecret: challenge.body.pollSecret },
  });
  check('waiting screen sees the approval', approved.body.status === 'approved');

  const thief = new Client();
  await thief.visit('/login');
  const stolen = await thief.call<{ error: string }>('/api/auth/qr/consume', {
    body: { challengeId: challenge.body.challengeId, pollSecret: challenge.body.pollSecret },
  });
  check('another device cannot redeem it, even with the poll secret', stolen.status === 410, `got ${stolen.status}`);

  const consumed = await desktop.call<{ employee: { fullName: string } }>('/api/auth/qr/consume', {
    body: { challengeId: challenge.body.challengeId, pollSecret: challenge.body.pollSecret },
  });
  check('originating device receives the session', consumed.status === 200);
  check('session belongs to the approving employee', consumed.body.employee?.fullName === 'علي');
  check('desktop now has a session cookie', desktop.hasSessionCookie());

  const replay = await desktop.call<{ error: string }>('/api/auth/qr/consume', {
    body: { challengeId: challenge.body.challengeId, pollSecret: challenge.body.pollSecret },
  });
  check('a consumed challenge cannot be replayed', replay.status === 410, `got ${replay.status}`);

  // -------------------------------------------------------------- OTP ----
  console.log('\nForgot PIN');
  const recovery = new Client();
  await recovery.visit('/login');

  const unknown = await recovery.call<{ ok: boolean }>('/api/auth/otp/request', {
    body: { email: 'definitely-not-here@example.test' },
  });
  const known = await recovery.call<{ ok: boolean }>('/api/auth/otp/request', {
    body: { email: 'sara@dev.local' },
  });
  check('unknown and known addresses answer identically', JSON.stringify(unknown.body) === JSON.stringify(known.body));

  const code = latestOtpFromLog();
  if (!code) {
    console.log('  SKIP  OTP body not in the log — start the server with MAIL_DEBUG_SHOW_BODY=true');
    console.log('        and point VERIFY_SERVER_LOG at its output to cover the recovery journey.');
  } else {
    const badCode = await recovery.call<{ error: string }>('/api/auth/otp/verify', {
      body: { email: 'sara@dev.local', code: code === '000000' ? '111111' : '000000' },
    });
    check('a wrong code is refused', badCode.status === 400 && badCode.body.error === 'otp_invalid');

    const verified = await recovery.call<{ resetToken: string }>('/api/auth/otp/verify', {
      body: { email: 'sara@dev.local', code },
    });
    check('the correct code is accepted', verified.status === 200 && Boolean(verified.body.resetToken));

    const reused = await recovery.call<{ error: string }>('/api/auth/otp/verify', {
      body: { email: 'sara@dev.local', code },
    });
    check('the same code cannot be used twice', reused.status === 400);

    const weak = await recovery.call<{ error: string }>('/api/auth/otp/reset', {
      body: { resetToken: verified.body.resetToken, newPin: '123456' },
    });
    check('a weak replacement PIN is refused', weak.body.error === 'weak_pin');

    const newPin = '640913';
    const reset = await recovery.call('/api/auth/otp/reset', {
      body: { resetToken: verified.body.resetToken, newPin },
    });
    check('the PIN is replaced', reset.status === 200);

    const replayReset = await recovery.call<{ error: string }>('/api/auth/otp/reset', {
      body: { resetToken: verified.body.resetToken, newPin: '640914' },
    });
    check('the reset handle is single-use', replayReset.status === 400);

    const afterReset = new Client();
    await afterReset.visit('/login');
    const relogin = await afterReset.call<{ employee: { fullName: string } }>('/api/auth/pin', {
      body: { pin: newPin },
    });
    check('login works with the new PIN', relogin.status === 200 && relogin.body.employee?.fullName === 'سارة');

    const oldPin = await afterReset.call<{ error: string }>('/api/auth/pin', { body: { pin: '594073' } });
    check('the old PIN no longer works', oldPin.status === 401);

    // Put the seed back the way it was.
    await afterReset.call('/api/auth/pin/change', { body: { currentPin: newPin, newPin: '594073' } });
  }

  // ---------------------------------------------------------- lifecycle ---
  console.log('\nSession lifecycle');
  const logout = await till.call('/api/auth/logout', { method: 'POST' });
  check('logout succeeds', logout.status === 200);
  check('session cookie cleared', !till.hasSessionCookie());

  const afterLogout = await till.call<{ authenticated: boolean }>('/api/auth/session');
  check('the session is gone server-side', afterLogout.body.authenticated === false);

  const guarded = await till.call<{ error: string }>('/api/employees');
  check('protected APIs refuse the ended session', guarded.status === 401);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error('\nVerification crashed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
