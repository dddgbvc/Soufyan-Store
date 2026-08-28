# نظام المصادقة والصلاحيات — ERP Authentication & Permissions

نظام تسجيل دخول وصلاحيات مستقل، مبني ليكون الأساس الأمني لنظام ERP متعدد الموظفين،
وقابل للدمج لاحقاً مع أقسام الكاشير والمخزون والديون والفواتير وغيرها بدون إعادة بناء.

A standalone authentication and authorization system for a multi-employee ERP:
PIN login, email + password, QR passkey approval, email OTP recovery, per-employee
permissions, server-side sessions and an append-only audit trail.

---

## ما الذي يقدمه

| | |
|---|---|
| **دخول بالـPIN** | ٦ أرقام فقط — بدون اختيار اسم الموظف. الخادم يتعرّف على الموظف من الرمز نفسه. |
| **دخول بالبريد وكلمة المرور** | عبر Supabase Auth، كطريقة ثانوية داخل «طرق دخول أخرى». |
| **QR PASSKEY** | رمز لمرة واحدة يُمسح بالهاتف، والموافقة تفتح النظام على الجهاز الأصلي. |
| **نسيت رمز الدخول** | رمز تحقق مؤقت عبر البريد، ثم تعيين رمز جديد. |
| **صلاحيات لكل موظف** | ٣٦ صلاحية على ١٠ أقسام — بدون أدوار ثابتة. |
| **الجلسات** | رموز عشوائية مخزّنة كـhash، قابلة للإبطال، بانتهاء خمول وسقف مطلق. |
| **سجل التدقيق** | جدول لا يقبل التعديل ولا الحذف، بلا أي بيانات سرية. |

---

## البدء السريع

```bash
# 1. المتطلبات
#    Node.js 20+ و قاعدة بيانات PostgreSQL 14+ (أو مشروع Supabase)

npm install

# 2. الإعدادات
cp .env.example .env.local
npm run gen:pepper        # انسخ الناتج إلى AUTH_PIN_PEPPER
#                           ثم عبّئ DATABASE_URL

# 3. قاعدة البيانات
npm run db:migrate        # ينشئ مخطط erp_auth كاملاً
npm run db:seed           # بيانات تجريبية للتطوير فقط

# 4. التشغيل
npm run dev               # http://localhost:3000
```

بعد `db:seed` تُطبع أرقام دخول تجريبية في الطرفية. **غيّرها قبل أي استخدام حقيقي.**

---

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل بيئة التطوير |
| `npm run build` | بناء الإنتاج |
| `npm start` | تشغيل نسخة الإنتاج |
| `npm run typecheck` | فحص الأنواع |
| `npm run lint` | فحص الكود |
| `npm test` | اختبارات الوحدة والتكامل (تحتاج قاعدة بيانات) |
| `npm run db:migrate` | تطبيق ملفات الهجرة بالترتيب |
| `npm run db:seed` | بيانات تجريبية للتطوير |
| `npm run verify` | تحقق شامل من الرحلات عبر HTTP على خادم يعمل |
| `npm run gen:pepper` | توليد قيمة `AUTH_PIN_PEPPER` جديدة |

---

## البنية

```
db/migrations/        مخطط قاعدة البيانات (SQL خام، قابل للتطبيق على أي Postgres)
scripts/              الهجرة، البيانات التجريبية، التحقق الشامل
src/
  app/
    api/auth/         نقاط النهاية: pin, password, otp, qr, logout, session
    api/employees/    إدارة الموظفين والصلاحيات
    login/            شاشة الدخول
    approve/          صفحة الموافقة على QR من الهاتف
    dashboard/        لوحة التحكم المبنية على الصلاحيات
  components/         واجهة المستخدم
  lib/                أدوات مشتركة بين الخادم والمتصفح
  server/
    auth/             PIN, password, OTP, QR, sessions
    authz/            التحقق من الصلاحيات (الحارس الحقيقي)
    db/               الاتصال والمستودعات
    security/         التشفير، التحقق، CSRF، سياق الطلب
    employees/        منطق إدارة الموظفين
    mail/             إرسال البريد
  proxy.ts            كوكيز الأمان + ترويسات الحماية
tests/                اختبارات على قاعدة بيانات حقيقية
docs/                 التوثيق التفصيلي
```

---

## التوثيق

| الملف | المحتوى |
|---|---|
| [docs/architecture.md](docs/architecture.md) | الطبقات، تدفّق الطلب، حدود الثقة |
| [docs/database.md](docs/database.md) | الجداول، القيود، الفهارس، الدوال |
| [docs/authentication.md](docs/authentication.md) | تدفّقات PIN و OTP و QR وكلمة المرور |
| [docs/permissions.md](docs/permissions.md) | نظام الصلاحيات و RLS |
| [docs/security.md](docs/security.md) | القرارات الأمنية ومبرراتها |
| [docs/deployment.md](docs/deployment.md) | متغيرات البيئة والنشر |
| [docs/integration.md](docs/integration.md) | دمج النظام داخل الـERP |
| [docs/operations.md](docs/operations.md) | إنشاء موظف، إسناد صلاحيات، الصيانة |

---

## الاختبارات

```bash
npm test                  # 90 اختباراً على قاعدة بيانات حقيقية
npm run verify            # 48 فحصاً عبر HTTP على خادم يعمل
```

اختبارات الوحدة تحتاج `DATABASE_URL` في `.env.local`؛ تنشئ بيانات مؤقتة وتحذفها بعدها،
ولا تمسّ بيانات التطوير.

```bash
npm run build && npm start &
VERIFY_BASE_URL=http://localhost:3000 npm run verify
```

---

## ملاحظة أمنية

- `AUTH_PIN_PEPPER` سرّ خادم لا يُخزَّن في قاعدة البيانات. فقدانه يعني فقدان كل رموز الدخول.
- مخطط `erp_auth` **غير معروض** عبر Supabase Data API عمداً؛ الخادم وحده يصل إليه.
- كل صلاحية تُفحص في الخادم. إخفاء زر في الواجهة ليس حماية.
