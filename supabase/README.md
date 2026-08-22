# قاعدة بيانات مكتب سفيان — تتبّع فتح البرنامج + إصلاح 401 + تعريب النسخة الاحتياطية

المشروع على Supabase: `tyfidwamnlraysqrfdgb` (مكتب سفيان للموبايل).
ملفات الـmigration بمجلد `migrations/` وكلها مطبّقة فعلاً على المشروع.

---

## 1. جدول `app_sessions` — شوكت ينفتح البرنامج

سجل دائم لكل فتحة برنامج. قبله كان الجواب الوحيد هو `pin_attempts` أو سجلات
Supabase اللي تنمسح بعد ٢٤ ساعة.

| العمود | الفائدة |
|---|---|
| `terminal_id` | الجهاز اللي انفتح بيه البرنامج |
| `employee_id` / `employee_name` | منو فتحه |
| `opened_at` | وكت الفتح |
| `last_seen_at` | آخر نبضة — يعني البرنامج لسه شغال |
| `closed_at` / `close_reason` | وكت الغلق وسببه: `normal` / `logout` / `timeout` / `crash` |
| `app_version` / `platform` / `meta` | نسخة البرنامج والنظام وأي تفاصيل إضافية |

الجدول عليه RLS وبدون أي صلاحية مباشرة لـ`anon` أو `authenticated` — نفس أسلوب
باقي المشروع: كل وصول يمر عبر دوال `SECURITY DEFINER`.

### الدوال

| الدالة | منو ينفذها | الفائدة |
|---|---|---|
| `app_session_start(terminal_id, app_version, platform, employee_id, meta)` → `uuid` | anon | يفتح جلسة ويرجّع رقمها |
| `app_session_ping(session_id)` | anon | نبضة تحدّث `last_seen_at` |
| `app_session_set_employee(session_id, employee_id)` | anon | يربط الموظف بالجلسة بعد الـPIN |
| `app_session_end(session_id, reason)` | anon | يغلق الجلسة |
| `app_sessions_close_stale(minutes)` | service_role | يغلق الجلسات المنقطعة (cron كل ١٥ دقيقة) |
| `app_sessions_report(days)` | service_role | تقرير الفتحات بتوقيت بغداد |
| `app_sessions_devices(days)` | service_role | تقرير الأجهزة: IP، MAC، اسم الجهاز، النظام |

`app_session_start` إذا لقى جلسة مفتوحة لنفس الجهاز ونبضتها أحدث من ١٥ دقيقة
يرجّع نفس الجلسة — حتى إعادة إدخال الـPIN ما تنحسب فتح جديد.

### التتبّع يشتغل تلقائياً من هسه

`verify_employee_pin` صارت تفتح جلسة تلقائياً عند نجاح الـPIN، وترجّع
`session_id` ضمن نفس الـJSON. التوقيع ما تغير، فالنسخة القديمة من البرنامج
تتجاهل المفتاح الجديد وتشتغل عادي.

> **ملاحظة مهمة**: حالياً ماكو أي موظف عنده PIN مضبوط (`employees.pin_hash` كلها
> فارغة)، يعني `verify_employee_pin` ما تكدر تنجح أصلاً. لازم تنضبط الـPINات
> عبر `set_employee_pin` حتى يشتغل التتبّع التلقائي — أو ينضاف النداء المباشر
> بالبرنامج (تحت).

### الربط بجانب البرنامج (اختياري، أدق)

```js
// عند إقلاع البرنامج
const { data: sessionId } = await supabase.rpc('app_session_start', {
  p_terminal_id: terminalId,          // نفس الـterminal_id المستعمل بالـPIN
  p_app_version: app.getVersion(),
  p_platform:    process.platform,
});
localStorage.setItem('session_id', sessionId);

// نبضة كل ٥ دقائق
setInterval(() => supabase.rpc('app_session_ping', { p_session_id: sessionId }), 5 * 60_000);

// عند الغلق
window.addEventListener('beforeunload', () => {
  supabase.rpc('app_session_end', { p_session_id: sessionId, p_reason: 'normal' });
});
```

### معلومات الجهاز

| المعلومة | تنلتقط من السيرفر؟ | المصدر |
|---|---|---|
| `ip` (العام) | ✅ تلقائي | ترويسة `cf-connecting-ip` |
| `user_agent` | ✅ تلقائي | ترويسة `user-agent` |
| `os` | ✅ تلقائي | يُستنتج من الـUser-Agent |
| `country` | ✅ تلقائي | ترويسة `cf-ipcountry` |
| `device_name` | ❌ | لازم البرنامج يرسله |
| `local_ip` | ❌ | لازم البرنامج يرسله |
| `mac` | ❌ **مستحيل** | عنوان MAC ما يطلع خارج الشبكة المحلية |

الأول أربعة ينلتقطون بدون أي تعديل بالبرنامج — حتى عبر مسار الـPIN.
الباقي لازم يرسله البرنامج:

```js
const os  = require('os');
const nets = os.networkInterfaces();
const primary = Object.values(nets).flat()
  .find(n => !n.internal && n.family === 'IPv4');

await supabase.rpc('app_session_start', {
  p_terminal_id: terminalId,
  p_app_version: app.getVersion(),
  p_platform:    `${os.platform()} ${os.release()}`,
  p_device_name: os.hostname(),      // اسم الجهاز
  p_mac:         primary?.mac,       // MAC — من هنا فقط
  p_local_ip:    primary?.address,   // IP المحلي داخل الشبكة
});
```

> الـMAC يجي من البرنامج نفسه، يعني نظرياً ينكدر ينتحل إذا أحد عدّل نسخة
> البرنامج. للتمييز بين الأجهزة بشكل موثوق يبقى `terminal_id` هو الأساس.

تقرير الأجهزة: `select public.app_sessions_devices(30);`

### استعلامات جاهزة

```sql
-- آخر ١٠ فتحات
select terminal_id, employee_name,
       to_char(opened_at at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI') opened,
       coalesce(close_reason, 'مفتوح لسه') as state
from public.app_sessions order by opened_at desc limit 10;

-- تقرير أسبوع
select public.app_sessions_report(7);
```

---

## 2. إصلاح خطأ 401 على `/rest/v1/categories`

**العَرَض**: البرنامج (`as-erp-2026` Electron) يرسل
`GET /rest/v1/categories?select=id&limit=1` — فحص اتصال — ويرجعله `401`.

**التشخيص** من `edge_logs`:

```
response.headers.proxy_status = PostgREST; error=42501
request.sb.apikey.apikey.prefix = sb_publishable_...
```

`42501` = `insufficient_privilege`. يعني المفتاح صحيح والمشكلة مو بالمصادقة:
جداول المشروع كلها بدون أي `GRANT` (الـ`relacl` فارغ)، لأن التصميم يعتمد
كلياً على دوال `SECURITY DEFINER`. فأي قراءة مباشرة من جدول بدور `anon` تنرفض.

> RLS لحاله ما يسبب 401 — الـ`SELECT` الممنوع بالـRLS يرجع `200` بقائمة فارغة.
> الـ401 هنا سببه غياب الـGRANT.

**الحل المطبّق** (أقل صلاحية ممكنة): قراءة عمود `id` فقط + سياسة RLS للقراءة
لدور `anon`. يعني تنكشف UUIDات الأقسام لا غير — بدون أسماء ولا أي عمود ثاني.
تم التأكد: `select id` يشتغل، و`select name` لسه يرجع `42501`.

**أثر جانبي**: جدول `categories` صار ظاهر بمخطط GraphQL لأن `anon` يكدر
يقرأ منه عمود واحد (تحذير `pg_graphql_anon_table_exposed` بالـadvisors).

**الحل الأنظف** — سطر واحد بالبرنامج، يلغي الحاجة للصلاحية أصلاً:

```diff
- await supabase.from('categories').select('id').limit(1)
+ await supabase.rpc('sync_ping')
```

`sync_ping()` موجودة أصلاً بالمشروع ومصرّح بيها لـ`anon`. بعد التبديل نفّذ:

```sql
drop policy if exists categories_probe_read on public.categories;
revoke select (id) on public.categories from anon, authenticated;
```

---

## 3. تعريب النسخة الاحتياطية اللي تجي على البوت

**المشكلة**: النسخة الاحتياطية اليومية كانت تجي ZIP بأسماء جداول إنكليزية
(`invoice_items: 59`) وملفات CSV عناوين أعمدتها إنكليزية ومعرّفات UUID —
أرقام ما تعني شي لصاحب المحل.

**الحل**: كل شي صار عربي بملفات `functions/tg-backup/`:

| قبل | بعد |
|---|---|
| `invoice_items.csv` | `مواد الفواتير.csv` |
| `total_amount, paid_amount` | `إجمالي الفاتورة، المدفوع` |
| `payment_type: DEBT` | `نوع الدفع: دين` |
| `status: awaiting_parts` | `الحالة: بانتظار قطع` |
| `has_imei: true` | `له IMEI: نعم` |
| `2026-08-21T01:32:25Z` | `2026-08-21 04:32` (بغداد) |
| `invoice_id: 8f3a…-uuid` | `رقم الفاتورة: INV-1042` |

وانضاف:

- **ملف `اقرأني.txt`** جوّا الضغط: يشرح شنو هذا الملف، شلون ينفتح، وشنو
  يعني كل ملف سطر بسطر.
- **رسالة البوت** صارت تشرح شنو وصل بدل قائمة أسماء إنكليزية:
  `المبيعات: 35 فاتورة · 59 مادة` بدل `invoices: 35`.
- **الأعمدة التقنية مشيلة** من ملفات الإكسل (UUIDات، `client_id`،
  `user_agent`…) — تبقى بملف `_full_backup.json`.
- **رموز الدخول (`pin_hash`) مشيلة** من ملفات CSV لأن الملف يمر بتلغرام.

### بنية الملفات

| الملف | الفائدة |
|---|---|
| `labels.ts` | قاموس التعريب: أسماء الجداول، الأعمدة، والقيم |
| `backup.ts` | بناء ملفات CSV والدليل — منطق خالص وقابل للاختبار |
| `index.ts` | البوت نفسه: تلغرام، التسديدات، والمساعد الذكي |

`_full_backup.json` يبقى بالأسماء الأصلية — هو النسخة اللي تنفع للاستعادة،
والتعريب للقراءة البشرية فقط.
