/**
 * عقود الخادم — كما تعيدها دوال المشروع فعلًا
 * ---------------------------------------------------------------------------
 * كل ردّ هنا منسوخ عن ناتج حقيقي نُفِّذ على مشروع `tyfidwamnlraysqrfdgb`
 * (٣١ آب ٢٠٢٦). فالاختبارات تقيس العميل مقابل عقد الخادم لا مقابل خادم
 * من اختراعنا — وهذه هي القيمة الوحيدة لاختبار بمحاكاة.
 *
 * الناتج المرجعي لـ `app_session_whoami` بعد دخول حقيقي:
 *
 *   {"ok": true, "method": "password",
 *    "employee": {"id":"463501c5-…","name":"user","role":"CASHIER"},
 *    "opened_at": "2026-08-31T01:01:23.451465+00:00",
 *    "session_id": "ec22b531-…", "permissions": ["pos"]}
 *
 * وحالات الرفض المُتحقَّق منها:
 *   جلسة أنشأها anon      → {"ok": false, "reason": "anonymous"}
 *   معرّف جهاز غير مطابق  → {"ok": false, "reason": "terminal"}
 *   جلسة مجهولة أو مغلقة  → {"ok": false, "reason": "closed"}
 */

export const SESSION = '11111111-2222-3333-4444-555555555555';
export const TOKEN   = 'eyJhbGciOiJIUzI1NiJ9.fake-access-token';
export const USER    = { id: '1504114c-71ec-4345-a1ba-7c815c71e6c4', email: 'assn42357@gmail.com' };
export const PROFILE = { id: USER.id, display_name: 'سفيان يوسف', full_name: 'سفيان يوسف', role: 'ADMIN', status: 'active' };

/** مرآة permissions_for(role) في قاعدة البيانات — نُسخت من تعريف الدالة. */
export const PERMISSIONS = {
  ADMIN:   ['dashboard','pos','returns','inventory','shortages','vaults','customers','analytics','settings','repairs','expenses','purchases'],
  MANAGER: ['dashboard','pos','returns','customers','inventory','shortages','analytics','purchases'],
  CASHIER: ['pos'],
};

export const employeeOf = (profile = PROFILE) => ({
  id: profile.id,
  name: profile.display_name || profile.full_name,
  role: profile.role,
});

/**
 * ردود دوال قاعدة البيانات التي يستعملها العميل.
 *
 * @param o.profile      ملف المستخدم (null = لا ملف)
 * @param o.pingOk       false ⇒ الخادم ينفي الجلسة
 * @param o.terminal     معرّف الجهاز الذي "سجّلت" عليه الجلسة على الخادم
 * @param o.setupDone    حالة setup_status().completed
 * @param o.hasAccounts  حالة setup_status().has_accounts
 */
/**
 * حالة خادم صغيرة تُحفظ بين النداءات.
 *
 * كانت الردود ثابتة، فكان `app_session_end` بلا أثر و`whoami` ينجح دائمًا.
 * وهذا أخفى عيبًا حقيقيًا: نبضة `pagehide` كانت تُنهي الجلسة عند كل تحديث
 * صفحة، فيخرج المستخدم — ولا اختبار يراه لأن المحاكاة لا تتذكّر شيئًا.
 * الخادم الحقيقي يتذكّر، فالمحاكاة يجب أن تتذكّر.
 */
const serverState = { closed: new Set() };
export const resetServerState = () => serverState.closed.clear();

export function rpcResponse(fn, args, o = {}) {
  const profile = o.profile === null ? null : (o.profile || PROFILE);
  const perms = PERMISSIONS[(profile && profile.role) || 'CASHIER'] || PERMISSIONS.CASHIER;

  switch (fn) {
    case 'setup_status':
      return {
        completed: !!o.setupDone,
        completed_at: o.setupDone ? '2026-08-31T00:00:00+00:00' : null,
        store_name: o.setupDone ? 'مكتب سفيان للموبايل' : null,
        has_accounts: o.hasAccounts !== false,
      };

    case 'app_session_start':
      return SESSION;

    case 'app_session_start_authenticated':
      if (!profile) return { ok: false, reason: 'disabled' };
      if (profile.status && profile.status !== 'active') return { ok: false, reason: 'disabled' };
      serverState.closed.delete(SESSION);          // دخول جديد يفتح الجلسة
      return { ok: true, session_id: SESSION, employee: employeeOf(profile), permissions: perms };

    case 'app_session_whoami': {
      if (o.pingOk === false) return { ok: false, reason: 'closed' };
      // جلسة أُنهيت فعلًا لا تُستأنف — كما على الخادم الحقيقي.
      if (args && serverState.closed.has(args.p_session_id)) return { ok: false, reason: 'closed' };
      // الربط بالجهاز يُفرض على الخادم: مؤشّر منسوخ إلى جهاز آخر يُرفض.
      if (o.terminal && args && args.p_terminal_id !== o.terminal) {
        return { ok: false, reason: 'terminal' };
      }
      if (o.anonymousSession) return { ok: false, reason: 'anonymous' };
      if (!profile) return { ok: false, reason: 'disabled' };
      return {
        ok: true, method: 'password', session_id: SESSION,
        opened_at: new Date().toISOString(),
        employee: employeeOf(profile), permissions: perms,
      };
    }

    case 'app_session_ping':
      if (args && serverState.closed.has(args.p_session_id)) return { ok: false, at: new Date().toISOString() };
      return { ok: o.pingOk !== false, at: new Date().toISOString() };

    case 'app_session_end':
      if (args && args.p_session_id) serverState.closed.add(args.p_session_id);
      return { ok: true };

    default:
      return { ok: true };
  }
}

/** يركّب اعتراض نداءات Supabase على صفحة Playwright. */
export async function routeSupabase(page, o = {}, seen = []) {
  /* المجموعات تختبر المسار الحقيقي (Supabase)، فتُثبِّت الوضع صراحةً بدل
     الاعتماد على الافتراضي المُسلَّم — وهو حاليًا الوضع التجريبي بطلب المالك.
     ما يضبطه الاختبار بنفسه يبقى له الأولوية. */
  await page.addInitScript(() => {
    window.SETUP_CONFIG = Object.assign({ demoMode: false }, window.SETUP_CONFIG || {});
  });
  await page.route('**/fonts.googleapis.com/**', r => r.abort());
  await page.route('**/fonts.gstatic.com/**', r => r.abort());

  await page.route('**/auth/v1/**', async route => {
    const url = route.request().url(), method = route.request().method();
    const body = route.request().postData() ? JSON.parse(route.request().postData()) : {};
    seen.push({ url: url.split('/auth/v1/')[1].split('?')[0], method, body });
    const json = (s, b) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

    if (url.includes('/token')) {
      if (o.unconfirmed) return json(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
      return (body.email === USER.email && body.password === (o.password || 'S3cret-pass'))
        ? json(200, { access_token: TOKEN, refresh_token: 'rt', token_type: 'bearer', expires_in: 3600, user: USER })
        : json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (url.includes('/otp')) return json(200, { message_id: 'otp-test', expires_in: 120 });
    if (url.includes('/verify')) {
      const good = body.email === USER.email && body.token === '123456';
      if (!good) return json(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      return json(200, {
        access_token: TOKEN, refresh_token: 'rt', token_type: 'bearer', expires_in: 3600,
        user: { ...USER, email_confirmed_at: new Date().toISOString() },
      });
    }
    if (url.includes('/user')) return json(200, { ...USER, updated_at: new Date().toISOString() });
    return json(404, {});
  });

  // anon/authenticated لا يملكان GRANT على public.profiles على هذا المشروع،
  // فالنداء المباشر يُرفض. نحاكي ذلك بصدق بدل أن نردّ بصفّ لا يصل فعلًا.
  await page.route('**/rest/v1/profiles**', r => r.fulfill({
    status: 401, contentType: 'application/json',
    body: JSON.stringify({ code: '42501', message: 'permission denied for table profiles' }),
  }));

  await page.route('**/rest/v1/rpc/**', r => {
    const fn = r.request().url().split('/rpc/')[1].split('?')[0];
    const args = r.request().postData() ? JSON.parse(r.request().postData()) : {};
    seen.push({ rpc: fn, args });
    return r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(rpcResponse(fn, args, o)),
    });
  });

  await page.route('**/functions/v1/setup-provision**', r => {
    const body = r.request().postData() ? JSON.parse(r.request().postData()) : {};
    seen.push({ fn: 'setup-provision', task: body.task, runKey: body.runKey });
    if (o.provisionFail) {
      return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'provision_failed' }) });
    }
    return r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, task: body.task, result: { section: body.task }, idempotent: false }),
    });
  });
}
