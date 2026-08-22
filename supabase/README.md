# قاعدة بيانات مكتب سفيان — تتبّع فتح البرنامج + إصلاح 401

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
