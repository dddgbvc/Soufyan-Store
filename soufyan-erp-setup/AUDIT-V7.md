# تقرير التدقيق — V6 → V7

تدقيق كامل للمعالج والبوابة ولقاعدة بيانات المشروع الحيّة
(`tyfidwamnlraysqrfdgb`، PostgreSQL 17.6، ١٣٠ منتجًا و٣٦ فاتورة وحسابَي مستخدم).

كل بند هنا **مفحوص على المشروع الحقيقي**، لا مستنتَج من قراءة الكود. وحيث لم
أستطع التحقّق قلتُ ذلك صراحةً في [ما لم يُتحقَّق منه](#ما-لم-يُتحقَّق-منه).

---

## تصحيح مهم في منتصف التدقيق

قراءتي الأولى لسياسات RLS قالت إن جداول العمل كلها مكشوفة لأي حساب موثَّق:

```sql
products_rw   ALL  TO authenticated  USING (true)  WITH CHECK (true)
invoices_rw   ALL  TO authenticated  USING (true)  WITH CHECK (true)
customers_rw  ALL  TO authenticated  USING (true)  WITH CHECK (true)
-- و١٠ جداول أخرى بالنمط نفسه
```

ثم فحصتُ طبقة الصلاحيات تحتها، وكانت النتيجة عكس ما تقوله السياسات:

```sql
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name='profiles';
-- postgres فقط. لا anon ولا authenticated.
```

`anon` و`authenticated` **لا يملكان أي GRANT على جداول `public`** عدا
`SELECT` على `activity_log` و`activity_feed`. و PostgREST يتصل بأحد هذين
الدورين، فيُرفض الطلب على مستوى الصلاحيات قبل أن تُقيَّم RLS أصلًا.

**فالسياسات المذكورة أعلاه شيفرة ميّتة، ولا يوجد كشف بيانات عبر PostgREST.**
سطح الوصول الحقيقي كلّه هو دوال `SECURITY DEFINER`، وهذا يفسّر لماذا هي ٥٥ دالة
ممنوحة لـ`anon`/`authenticated`.

أثبتُّ ذلك بمحاولة كتابة فعلية بدور `authenticated`:

```
42501 permission denied for table profiles
```

وهذا التصحيح يقلب أولوية بندين: سقط «كشف بيانات RLS» من القائمة، وصعد
«سطح دوال anon» إلى مكانه الصحيح.

---

## P0 — ثغرات تجاوز التوثيق

### P0-1 · انتحال جلسة كاملة من المتصفح ✅ أُصلحت وتُحقّق منها

**أخطر ما في V6.** الاستئناف كان:

```js
// V6
const raw = JSON.parse(localStorage["soufyan.erp.session.v1"]);
if(raw.terminal !== Terminal.id()) return null;      // فحص في المتصفح
const alive = await AuthService.ping(raw.sessionId); // يردّ {ok:true} بلا هوية
this.data = { employee: raw.employee, permissions: raw.permissions };  // ← من المخزَّن
```

و`app_session_ping` على الخادم لا يفعل أكثر من:

```sql
update public.app_sessions set last_seen_at = now()
 where id = p_session_id and closed_at is null;
return jsonb_build_object('ok', found);
```

لا هوية، ولا ربط بالجهاز، ولا عمر أقصى. والهوية والصلاحيات تُقرأ من
`localStorage`. وفحص الجهاز الوحيد يجري **في المتصفح**، فهو سطر يُحرَّر.

**الاستغلال** (٣ خطوات، بلا حساب ولا كلمة مرور):

1. `POST /rest/v1/rpc/app_session_start {"p_terminal_id":"x"}` — متاحة لـ`anon`،
   وتعيد UUID جلسة صالحة.
2. اكتب في `localStorage`:
   ```json
   { "v":1, "sessionId":"<الـUUID>", "terminal":"x", "at":"<الآن>",
     "employee":{"id":"1","name":"x","role":"ADMIN"},
     "permissions":["dashboard","pos","inventory","vaults","analytics","settings","expenses"] }
   ```
3. أعد تحميل الصفحة ← `ping` يردّ `ok:true` ← واجهة إدارية كاملة.

**الإصلاح** — `app_session_whoami(session_id, terminal_id, max_age_hours)`
تفرض على الخادم: مطابقة الجهاز، والعمر الأقصى، وحالة الموظف، وأن الجلسة ليست
مجهولة؛ ثم تعيد الهوية والصلاحيات مشتقّة من `permissions_for(role)`. والعميل
لم يعد يقرأ من المخزَّن إلا مؤشّر الجلسة — وهو ادّعاء يُفحص لا سلطة.

**الدليل** (نُفِّذ على قاعدة الإنتاج):

| الحالة | الردّ |
|---|---|
| جلسة أنشأها `anon` (مسار الاستغلال) | `{"ok":false,"reason":"anonymous"}` |
| مؤشّر صحيح ومعرّف جهاز آخر | `{"ok":false,"reason":"terminal"}` |
| مؤشّر مجهول | `{"ok":false,"reason":"closed"}` |
| دخول حقيقي ثم استئناف | `{"ok":true,"employee":{"role":"CASHIER"},"permissions":["pos"]}` |

وأُغلق كذلك فرع «بلا اتصال»: أثناء مهلة السماح تُعرض آخر هوية معروفة بشارة
«بلا اتصال»، لكن `verified=false` و`can()` تردّ `false` حتى تعود نبضة من الخادم
تؤكّدها. فمن يقطع الشبكة عمدًا بعد تحرير المخزَّن لا يكسب صلاحيات.

---

### P0-2 · الإعداد كان يُكمَل بلا أي حساب حقيقي ✅ أُصلحت

`HAS_SERVER = !!CONFIG.apiBaseUrl` و`apiBaseUrl: ""` افتراضيًا. فالتسليم
الافتراضي كان:

* **OTP يُولَّد في المتصفح** ويُعاد في الرد تحت `demoCode`، ويقارنه المتصفح بنفسه.
* **«التهيئة»** تكتب في `localStorage` تحت `soufyan.erp.*` وتضع
  `setup_completed = true`.
* **`securityData.passwordSet = true`** بلا أي كلمة مرور على أي خادم.

أي أن الإعداد ينجح دائمًا ولا يصل إلى أي خادم إطلاقًا.

**الإصلاح** — أُزيل المسار المحلي بالكامل، ولم يُوضَع خلف راية تطوير:

| ماذا | كيف صار |
|---|---|
| رمز البريد | `POST /auth/v1/otp` ثم `POST /auth/v1/verify` — نجاح التحقّق **ينشئ الحساب** ويؤكّد بريده |
| كلمة المرور | `PUT /auth/v1/user` بجلسة ذلك التحقّق. فشلها يوقف الخطوة ولا يدّعي نجاحًا |
| التهيئة | دالة الحافة `setup-provision` بجلسة مستخدم حقيقية |
| اكتمال الإعداد | `setup_state` على الخادم، تُقرأ بـ`setup_status()` |

`Router.setupCompleted()` كانت تقرأ `LocalDB.get("setup_completed")` — مفتاح
يكتبه أي أحد من أدوات المطوّر ليقفز مباشرةً إلى شاشة الدخول. صارت تقرأ من الخادم.

---

### P0-3 · الالتفاف على حدّ محاولات PIN ✅ أُصلحت

```sql
-- V6
create function pin_attempts_blocked(p_terminal_id text, p_ip inet) ...
  (select count(*) from pin_attempts
    where terminal_id = p_terminal_id and ok = false
      and at > now() - interval '2 minutes') >= 5
```

`p_terminal_id` **وسيط يرسله العميل**. تدويره في كل طلب يجعل العدّاد صفرًا دائمًا،
فيسقط الفرع الأول ويبقى فرع الـIP وحده (١٠ لكل ١٠ دقائق). والدالة متاحة لـ`anon`،
والـPIN من ٤–٦ أرقام بلا اسم مستخدم — أي مِعراف عالميّ مفتوح على الإنترنت.

**الإصلاح** — أُبقي الفرعان وأُضيف:
* سقف ساعيّ لكل IP (٣٠ محاولة) — يوقف المحاولات البطيئة الطويلة.
* **سقف لعدد معرّفات الأجهزة المختلفة من IP واحد** (٨ في الساعة) — وهذا هو
  أثر التدوير نفسه، فصار الالتفاف هو ما يُشغّل الحظر.

الإصلاح الجذري (سحب `EXECUTE` من `anon`) في المهاجرة المؤجَّلة، لأنه يوقف شاشة
دخول الموظف في التطبيق الحيّ.

---

### P0-4 · سطح دوال SECURITY DEFINER المتاحة لـ anon ⏸️ مؤجَّلة بقرار المالك

٢٥ دالة `SECURITY DEFINER` ممنوحة لـ`anon`، أي قابلة للاستدعاء من الإنترنت
بالمفتاح العلني وحده. أخطرها:

| الدالة | لماذا تهمّ |
|---|---|
| `purchase_login(pin_hash, terminal_id)` + ١٨ دالة `purchase_*` | واجهة مشتريات وموردين كاملة يحرسها PIN من ٤–٦ أرقام |
| `verify_employee_pin(pin_hash, terminal_id)` | مِعراف PIN عالميّ (انظر P0-3) |
| `sync_push(session_id, table, rows)` | كتابة صفوف اعتمادًا على معرّف جلسة وحده، و`app_session_start` متاحة لـ`anon` |

هذه ليست من صنع المعالج ولا من تعديلات V7، وتخصّ تطبيقات لا يوجد مصدرها في
هذا المستودع. سحب `EXECUTE` قد يوقف نقطة البيع أو قسم الشراء في منتصف يوم عمل.

**القرار:** تُسلَّم مراجَعةً وغير مطبَّقة في
`supabase/migrations/20260831093000_v7_anon_surface_hardening.NOT_APPLIED.sql`
مع خطة إطلاق متدرّجة وقسم تراجع كامل.

---

## P1 — أخطاء وظيفية وأمنية

### P1-1 · كل دخول كان ينتهي بصلاحيات CASHIER ✅ أُصلحت

```js
// V6
try{ const rows = await Sb.select("profiles?select=…", token); }
catch(_){ }                       // ← يبتلع الفشل صامتًا
const role = (profile && profile.role) || "";
permissions: PERMISSIONS_FOR(role)   // "" ⇒ CASHIER
```

بما أن `authenticated` لا يملك `SELECT` على `profiles` (انظر التصحيح أعلاه)،
كان هذا النداء **يفشل دائمًا**. فالمالك نفسه كان يدخل بصلاحيات `["pos"]` فقط.
الأصل أن يظهر خطأ؛ لكن `catch` الفارغ حوّله إلى هبوط صامت في الصلاحيات.

**الإصلاح** — `app_session_start_authenticated()` تُصدر الهوية والدور
والصلاحيات في نداء واحد بجلسة المستخدم، وتفتح جلسة التشغيل موسومة بهويته.
(V6 كانت تفتح `app_session_start` بلا `employee_id`، فتبقى الجلسة **مجهولة على
الخادم** بينما تدّعي الواجهة أنها لصاحبها — وهو ما جعل P0-1 ممكنًا أصلًا.)

### P1-2 · تصعيد الصلاحية على profiles ✅ أُصلحت (دفاع في العمق)

`profiles_self_write` تسمح بالتعديل بشرط `auth.uid() = id` ولا تفرّق بين
الأعمدة، و`role` عمود نصّي في الصف نفسه. فالسياسة كما هي مكتوبة تسمح لأي حساب
بأن يكتب `role='ADMIN'` على نفسه.

عمليًا **غير مستغلّة اليوم** لأن `authenticated` لا يملك `UPDATE` على الجدول.
لكنها تبقى قنبلة موقوتة: أول `grant update on profiles to authenticated` يفتحها.
وكِلا الحسابين الحقيقيين على المشروع `CASHIER`، فالمكسب كان حقيقيًا.

**الإصلاح** — محفّز على مستوى الجدول يغطّي كل مسارات الكتابة لا سياسة واحدة.
الدليل:

```
role_before      CASHIER
role_after       CASHIER
trigger_error    42501 not authorised to change role or status
verdict          PASS - self-escalation blocked
```

### P1-3 · setup-invoice ✅ أُصلحت ونُشرت

| المشكلة | الحال الآن |
|---|---|
| `Access-Control-Allow-Origin: *` | قائمة سماح من `SETUP_ALLOWED_ORIGINS` |
| `GET /` يُصدر PDF نموذجيًا لأي مستدعٍ | حُذف المسار |
| `detail: String(e).slice(0,300)` يعيد نصّ الاستثناء | رمز مغلق فقط؛ التفصيل في سجلّ الدالة |
| بلا حدّ لحجم الحمولة | ٦٤ كيلوبايت |

عقد `POST` لم يتغيّر بأي حرف، فالمستدعون الحاليون يعملون كما هم.

### P1-4 · التهيئة لم تكن idempotent ✅ أُصلحت

سبع مهام متتابعة بلا مفتاح تشغيل. انقطاع الشبكة في منتصفها ثم إعادة المحاولة
كانت تعيد تنفيذ ما نجح. الآن `(run_key, task)` فريد في قاعدة البيانات،
و`runKey` يُولَّد مرة ويُحفظ مع الحالة، والترتيب مفروض على الخادم فلا يمكن
استدعاء `finalize` قبل ما قبلها.

---

## P2 — تصليب

| # | البند | الحال |
|---|---|---|
| P2-1 | لا CSP ولا ترويسات أمان | ✅ CSP في `<meta>` مع `connect-src` مثبَّتة على مشروع Supabase وحده؛ الترويسات الكاملة في `deploy/security-headers.conf` |
| P2-2 | لا سجلّ أحداث أمنية | ✅ `security_events` + `log_security_event()` مع حارس يُسقِط أي مفتاح يشبه السرّ |
| P2-3 | لا تحديد محاولات لعمليات خارج Supabase Auth | ✅ `rate_limits` + `rate_limit_hit()` بنافذة منزلقة |
| P2-4 | `employees.user_id` بلا قيد فريد | ✅ فهرس فريد — دخولان متزامنان كانا ينشئان صفّي موظف لحساب واحد |
| P2-5 | خطوط من `fonts.googleapis.com` | ⏸️ تبعية خارجية وقت التشغيل؛ يُنصح باستضافتها محليًا (تجربة بلا إنترنت + خصوصية) |
| P2-6 | استيراد `raw.githubusercontent.com` في `setup-invoice` | ℹ️ مثبَّت على commit محدّد — مقبول، ومذكور في SECURITY.md ضمن مخاطر سلسلة التوريد |
| P2-7 | `pg_net` داخل schema `public` | ⏸️ إنذار من المستشار، خارج نطاق المعالج |
| P2-8 | حماية كلمات المرور المسرَّبة معطّلة | ⏸️ إعداد لوحة تحكم — مذكور في المهاجرة المؤجَّلة |

---

## ما لا يزال قائمًا عمدًا

**`script-src 'unsafe-inline'`.** التطبيق ملف واحد بلا خطوة بناء، وفتحه بنقرة
مزدوجة خاصيّة أساسية فيه. البديل — بصمات SHA-256 لكل نصّ مضمَّن — جاهز في
`tools/build-csp.mjs` (`--check` للـCI)، وليس مفعّلًا افتراضيًا لأن أي تعديل على
الصفحة بعده يوقفها بالكامل حتى يُعاد تشغيل الأداة. لا توجد أي معالِجات أحداث
سطرية في الصفحة، فالترقية نظيفة متى أُريدت.

**بصمة PIN تُحسب في المتصفح.** `verify_employee_pin` تستقبل بصمة يحسبها العميل
ثم تتحقّق منها بـbcrypt على الخادم. الـbcrypt يجعل كل محاولة مكلفة (وهذا جيد)،
لكن البصمة نفسها هي كلمة السرّ الفعلية: من يقرؤها يدخل. تغيير هذا يتطلّب تعديل
التطبيق الحيّ، فهو في المهاجرة المؤجَّلة.

---

## ما لم يُتحقَّق منه

بيئة العمل هذه **لا تصل شبكيًا إلى `*.supabase.co`** (البوّابة تردّ 403 على
CONNECT)، والوصول إلى المشروع تمّ عبر Supabase MCP وحده. لذلك:

| البند | الحالة |
|---|---|
| SQL والدوال والمحفّزات والفهارس | ✅ طُبِّقت وتُحقّق منها بالتنفيذ على قاعدة الإنتاج |
| منطق `whoami` و`start_authenticated` والمحفّز | ✅ أُثبت بـPoC نُفِّذ فعلًا (النتائج أعلاه) |
| نشر `setup-provision` و`setup-invoice` | ✅ نُشرتا (الإصداران 1 و2) |
| **وصول رسالة OTP فعليًا إلى صندوق بريد** | ❌ لم يُختبر — يتطلّب إرسال بريد واستقبالَه |
| **دورة إعداد كاملة حيّة من المتصفح إلى Supabase** | ❌ لم تُختبر — الشبكة محجوبة |
| سلوك العميل مقابل عقود الخادم | ✅ يُختبر في Chromium حقيقي باعتراض النداءات |

الفرق جوهري: **منطق الخادم مُتحقَّق منه على الإنتاج، ومنطق العميل مُتحقَّق منه
مقابل عقود الخادم، لكن الوصلة الحيّة بينهما لم تُشغَّل من هنا.** أول تشغيل حقيقي
يجب أن يكون بعين مفتوحة على `security_events` و`setup_provision_runs`.

كذلك: **Strix لم يُشغَّل** — انظر `SECURITY.md` للتفصيل وللبديل الذي شُغِّل فعلًا.

---

## مصفوفة التحقّق النهائية

`✅ PASS` = مُتحقَّق منه بتشغيل فعلي · `⏸️ DEFERRED` = مؤجَّل بقرار صاحب المشروع ·
`❌ NOT VERIFIED` = **لم يُختبر** ولا يُدَّعى غير ذلك.

| المجال | الحالة | الدليل |
|---|---|---|
| **Auth — دخول** | ✅ PASS | `tests/auth-flows.mjs` (55 فحصًا) + تنفيذ `app_session_start_authenticated` على قاعدة الإنتاج |
| **Auth — إنشاء حساب حقيقي** | ⚠️ PARTIAL | العميل يستدعي `/auth/v1/otp` ثم `/auth/v1/verify` ثم `PUT /user` ويُختبر مقابل عقود GoTrue؛ **وصول الرسالة إلى صندوق بريد لم يُختبر** |
| **OTP — إنتاجي** | ✅ PASS | لا توليد في المتصفح، لا `demoCode`، لا مسار محلي. حدّ المحاولات من Supabase Auth (`429`) مترجَم للمستخدم — `tests/failures.mjs` |
| **Recovery** | ✅ PASS | `updatePassword` المفقودة أُصلحت؛ رابط منتهٍ يُقرأ ويُمحى من العنوان ويُعرض بسبب صريح — `tests/auth-flows.mjs` |
| **PIN** | ⚠️ PARTIAL | التحقّق على الخادم بـ bcrypt، وحدّ المحاولات شُدِّد (أُغلق تدوير معرّف الجهاز). **البصمة تُحسب في المتصفح وتبقى كلمة السرّ الفعلية** — الإصلاح الجذري في المهاجرة المؤجَّلة |
| **Passkey** | ⏸️ DEFERRED | دالة `webauthn` على المشروع WebAuthn حقيقي، **غير موصولة بشاشة الدخول** — كما في V6، بلا محاكاة |
| **QR login** | ⏸️ DEFERRED | معطّل بسبب صريح، بلا محاكاة — كما في V6 |
| **Session — سلطة الخادم** | ✅ PASS | `app_session_whoami` — PoC على الإنتاج (`anonymous` / `terminal` / `closed`) + `tests/security.mjs` أقسام ١–٤ |
| **Terminal** | ✅ PASS | الربط يُفرض على الخادم؛ PoC أعاد `reason:"terminal"` |
| **RLS** | ✅ PASS (مع تصحيح) | قِيس أن `anon`/`authenticated` بلا GRANT على `public`، فالسياسات المشكوك فيها غير قابلة للوصول. جداول V7 مغلقة. قفل تصعيد الصلاحية مُتحقَّق منه: `42501 not authorised to change role or status` |
| **API / Edge Functions** | ✅ PASS | `setup-provision` تحتاج JWT مستخدم حقيقي وتفرض ترتيب المهام؛ `setup-invoice` v2 (CORS مقيّد، GET محذوف، بلا تسريب) |
| **Provisioning — idempotent** | ✅ PASS | `(run_key, task)` فريد في قاعدة البيانات + `tests/security.mjs` قسم ٦ |
| **تجاوز منطق الأعمال** | ✅ PASS | استدعاء `finalize` مباشرةً يُرفض (بلا جلسة، وبجلسة يردّ `409 incomplete`) — `tests/security.mjs` قسم ٥ |
| **Invoice** | ✅ PASS | نفس قالب Supabase، عقد `POST` لم يتغيّر؛ تعذّر الوصول ⇒ خطأ صريح بلا بديل مرسوم — `tests/wizard.mjs` |
| **الأسرار** | ✅ PASS | لا كلمة مرور ولا PIN ولا OTP ولا رمز وصول/تحديث في `localStorage` أو `sessionStorage` — `tests/security.mjs` قسم ٧ |
| **XSS** | ✅ PASS | حمولة `<img onerror>` في اسم المحل والمالك والموظف لا تُنفَّذ ولا تُركَّب — `tests/security.mjs` قسم ٨ |
| **تسريب الأخطاء** | ✅ PASS | خطأ يحمل SQL ومسار ملف ورمزًا داخليًا لا يظهر منه شيء — `tests/security.mjs` قسم ٩ |
| **CSP / الترويسات** | ✅ PASS | CSP في `<meta>` بـ `connect-src` مثبَّتة؛ الترويسات الكاملة في `deploy/security-headers.conf` — `tests/security.mjs` قسم ١٠ |
| **تحديد المحاولات** | ✅ PASS | Supabase Auth + `pin_attempts_blocked` المشدَّدة + `rate_limit_hit` — كلها على الخادم |
| **Accessibility** | ✅ PASS | `tests/interface.mjs` (46 فحصًا): لوحة المفاتيح، حصر التركيز، ARIA، تقليل الحركة، والتباين مقيسًا بخلفية مركَّبة على ٣٦ عقدة نصّية × مظهرين |
| **Responsive** | ✅ PASS | تسعة عروض من 320 إلى 1920 بلا فيض أفقي — `tests/interface.mjs` |
| **Build** | ✅ PASS | بلا خطوة بناء؛ فحص صيغة JS نظيف |
| **Tests — تشغيل فعلي** | ✅ PASS | **187 فحصًا · صفر إخفاق** في Chromium حقيقي |
| **Strix** | ❌ NOT VERIFIED | **لم يُشغَّل.** Python 3.11 (يحتاج ≥3.12) · Docker غير متاح · `strix.ai` و`app.strix.ai` محجوبان · بلا مفتاح LLM. التفصيل في `SECURITY.md` §15 |
| **تكامل Supabase حيّ** | ❌ NOT VERIFIED | الشبكة إلى `*.supabase.co` محجوبة من بيئة العمل؛ الوصول عبر MCP وحده. منطق الخادم مُتحقَّق منه على الإنتاج، ومنطق العميل مقابل العقود، **لكن الوصلة الحيّة لم تُشغَّل** |
| **سطح دوال anon** | ⏸️ DEFERRED | ٢٥ دالة `SECURITY DEFINER` متاحة لـ`anon` — المهاجرة جاهزة وغير مطبَّقة بقرار المالك. **أعلى بند مفتوح** |

### نتائج التشغيل

```
auth-flows  55 pass · 0 fail
wizard      18 pass · 0 fail
interface   46 pass · 0 fail
failures    28 pass · 0 fail
security    40 pass · 0 fail
────────────────────────────
المجموع    187 pass · 0 fail
```

### الأهمّ: الاختبارات تكشف V6

تشغيل `tests/security.mjs` على نسخة V6 الأصلية يُسقط **١٣ فحصًا على الأقل** قبل
أن تتوقّف المجموعة، من بينها:

```
FAIL بعد التزوير تبقى صلاحية واحدة كما قال الخادم (8)   ← V6 يعرض ٨ صلاحيات
FAIL و«الإعدادات» ما تزال ممنوعة                        ← can('settings') = true
FAIL والدور المعروض هو دور الخادم لا دور التخزين          ← يعرض ADMIN
FAIL مؤشّر منسوخ من جهاز آخر يرفضه الخادم                ← الفحص كان في المتصفح
FAIL استدعاء التهيئة بلا جلسة مالك يُرفض                  ← كانت تعمل بلا توثيق
```

على V7 تمرّ الأربعون. **اختبار ينجح على النسخة المكسورة لا قيمة له** — وهذه ليست كذلك.

### أثر التطبيق على الإنتاج

قبل وبعد، بعد تنظيف كل أثر فحص:

```
products 130 · invoices 36 · customers 18 · employees 4 · profiles 2
profiles بدور غير CASHIER: 0   ·   app_sessions: 0   ·   security_events: 0
```

مستشارو الأمان: 79 → 89 ملاحظة. الزيادة العشر كلها من إضافات V7 ومقصودة
(دوال يجب أن تكون قابلة للنداء، وجداول مغلقة عمدًا بلا سياسة) — **عدا واحدة**:
`profiles_guard_privileged_columns()` كانت متاحة عبر `/rest/v1/rpc/`. كشفها
المستشار بعد التطبيق، وسُحبت صلاحيتها في مهاجرة تالية.
