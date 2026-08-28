# النشر — Deployment

## متغيرات البيئة

انسخ `.env.example` إلى `.env.local` (أو أدخلها في لوحة الاستضافة). لا تودِع أي
منها في Git.

### إلزامية

| المتغيّر | الوصف |
|---|---|
| `DATABASE_URL` | اتصال Postgres مباشر. على Supabase: Settings → Database → Connection string. استخدم مجمّع المعاملات (منفذ 6543) في البيئات عديمة الخادم |
| `AUTH_PIN_PEPPER` | سرّ الخادم لتفليف الرموز والفهرس الأعمى. ٣٢ حرفاً فأكثر. ولّده بـ`npm run gen:pepper` |
| `APP_URL` | الأصل العلني بالضبط، بلا شرطة أخيرة. يحكم فحص المصدر وحمولة QR |

### اختيارية مع قيم افتراضية

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `DATABASE_POOL_SIZE` | 8 | حجم بركة الاتصالات |
| `DATABASE_STATEMENT_TIMEOUT_MS` | 8000 | سقف زمن الاستعلام |
| `SESSION_IDLE_MINUTES` | 60 | نافذة الخمول |
| `SESSION_ABSOLUTE_HOURS` | 12 | السقف المطلق للجلسة |
| `PIN_LENGTH` | 6 | طول رمز الدخول |
| `PIN_MAX_ATTEMPTS` | 5 | المحاولات قبل الحظر |
| `PIN_ATTEMPT_WINDOW_SECONDS` | 300 | نافذة العدّ |
| `PIN_LOCKOUT_SECONDS` | 120 | الحظر الأساسي (يتصاعد) |
| `OTP_TTL_SECONDS` | 600 | عمر رمز التحقق |
| `OTP_MAX_ATTEMPTS` | 5 | محاولات التحقق |
| `OTP_MAX_REQUESTS_PER_HOUR` | 5 | طلبات الرمز في الساعة |
| `OTP_RESET_TOKEN_TTL_SECONDS` | 600 | عمر مقبض إعادة التعيين |
| `QR_TTL_SECONDS` | 120 | عمر تحدي QR |
| `QR_POLL_INTERVAL_MS` | 1500 | فترة الاستطلاع |
| `SESSION_COOKIE_NAME` | `erp_auth_session` | اسم كوكي الجلسة |
| `CSRF_COOKIE_NAME` | `erp_auth_csrf` | اسم كوكي CSRF |
| `DEVICE_COOKIE_NAME` | `erp_auth_device` | اسم كوكي الجهاز |

### Supabase Auth (للدخول بالبريد وكلمة المرور)

| المتغيّر | ملاحظة |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | عنوان المشروع |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | المفتاح العلني |
| `SUPABASE_SERVICE_ROLE_KEY` | فقط لإنشاء مستخدمي Auth من شاشة الإدارة. لا يصل المتصفح |

بدونها تختفي طريقة البريد وكلمة المرور من الواجهة وتُرجع نقطة النهاية
`unavailable`، بينما يستمر الدخول بالرمز وQR.

### البريد

| المتغيّر | ملاحظة |
|---|---|
| `MAIL_PROVIDER` | `console` (تطوير) أو `resend` |
| `MAIL_FROM` | المرسل الظاهر |
| `RESEND_API_KEY` | مطلوب مع `resend` |
| `MAIL_DEBUG_SHOW_BODY` | تطوير فقط: يطبع نص الرسالة مع الرمز |

إضافة مزوّد آخر = صنف واحد يحقق `Mailer` في `src/server/mail/mailer.ts`.

---

## قاعدة البيانات

```bash
npm run db:migrate
```

يطبّق `db/migrations/*.sql` بالترتيب ويتتبّعها في `erp_auth.schema_migrations`.
آمن التكرار: ما طُبِّق لا يُعاد.

### على Supabase

المخطط `erp_auth` مصمَّم للتعايش مع جداول ERP قائمة في `public` بلا تصادم.

**لا تعرض `erp_auth` على Data API.** الأمان هنا قائم على أن الجداول غير قابلة
للوصول من المتصفح أصلاً؛ عرضها يُبطل ذلك.

الاتصال عبر `DATABASE_URL` مباشرة، لا عبر PostgREST — لذلك لا حاجة لأي تغيير في
إعدادات API.

### قاعدة بيانات جديدة

أي Postgres 14+ يكفي. لا امتدادات مطلوبة: `gen_random_uuid()` مدمجة منذ Postgres 13.

---

## البناء والتشغيل

```bash
npm ci
npm run db:migrate
npm run build
npm start
```

### قائمة ما قبل النشر

- [ ] `AUTH_PIN_PEPPER` مولَّد عشوائياً وليس قيمة مثال
- [ ] `APP_URL` مطابق للنطاق الحقيقي تماماً
- [ ] HTTPS مفعّل (كوكيز `Secure` لن تعمل بدونه)
- [ ] `NODE_ENV=production`
- [ ] الهجرات مطبّقة
- [ ] مزوّد بريد حقيقي و`MAIL_DEBUG_SHOW_BODY` غير مفعّل
- [ ] حساب مالك واحد على الأقل برمز قوي
- [ ] حسابات البيانات التجريبية محذوفة أو رموزها مغيّرة
- [ ] `purge_expired` مجدولة

### الحسابات الأولى

`npm run db:seed` للتطوير فقط ويرفض العمل عند `NODE_ENV=production`.

للإنتاج أنشئ حساب المالك يدوياً — يحتاج hash وفهرساً محسوبين بالفلفل الحقيقي:

```bash
node --conditions=react-server --import tsx -e "
  import('./src/server/security/crypto.ts').then(async (c) => {
    const pin = process.argv[1];
    console.log('pin_hash  :', await c.hashSecret(pin, 'pin'));
    console.log('pin_lookup:', c.blindIndex(pin, 'pin'));
  });
" 483916
```

ثم:

```sql
insert into erp_auth.employees
  (employee_code, full_name, email, status, is_owner, pin_hash, pin_lookup, pin_set_at)
values
  ('EMP-0001', 'اسم المدير', 'manager@example.com', 'active', true,
   '<pin_hash>', '<pin_lookup>', now());
```

بعدها تُدار كل الحسابات من داخل الواجهة.

---

## البيئات عديمة الخادم

- استخدم مجمّع المعاملات (منفذ 6543 على Supabase) وأبقِ `DATABASE_POOL_SIZE` صغيراً.
- `prepare: false` مضبوطة أصلاً في عميل قاعدة البيانات لتوافق المجمّع.
- كل مسارات الـAPI تعمل على `runtime = 'nodejs'` لأنها تحتاج `node:crypto` واتصال
  Postgres.
- `proxy.ts` يعمل على وقت تشغيل Node في Next.js 16 ولا يلمس قاعدة البيانات.

## المراقبة

راقب في سجل التدقيق:

| الحدث | الدلالة |
|---|---|
| `login.blocked` | موجة تخمين |
| `login.pin_failure` بكثافة | محاولة اختراق أو رمز منسي |
| `login.pin_failure` بسبب `digest_mismatch` | **حرج** — تطابق فهرس بلا تطابق hash |
| `otp.blocked` | إساءة استخدام الاسترجاع |
| `qr.rejected` | محاولات موافقة أو استهلاك فاشلة |
| `employee.permissions_changed` | تغيير صلاحيات — راجعه دائماً |
| `authz.denied` | محاولة وصول لما لا يُسمح به |
