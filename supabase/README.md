# سجل النشاط — تسجيل الـ IP ونوع الجهاز على كل عملية

كل عملية تصير بقاعدة البيانات (إضافة / تعديل / حذف) تنكتب تلقائيًا بجدول
`public.activity_log` ومعاها: منو سوّاها، من أي مصدر، من أي IP، ومن أي جهاز.

الملفات بمجلد `migrations/` تنطبّق بالترتيب:

| الملف | شنو يسوّي |
|---|---|
| `..._activity_log_core.sql` | قراءة ترويسات الطلب، تحليل الجهاز، جدول السجل، التريكر العام |
| `..._activity_log_triggers.sql` | ربط التريكر بـ ٣١ جدول + ختم `pin_attempts` و`app_sessions` |
| `..._activity_actor_context.sql` | تعريف الفاعل الحقيقي لعمليات بوت تلغرام وقسم الشراء |
| `..._activity_reports.sql` | عرض السجل بالعربي + تقارير + تنظيف دوري |
| `..._activity_log_hardening.sql` | منع تزوير السجل أو مسحه عبر الـ API |
| `..._activity_reports_access.sql` | قراءة التقارير للمستخدم المسجّل فقط (مو anon) |

## شنو ينحفظ بكل حركة

`at` الوكت · `source` المصدر · `action` نوع العملية · `table_name` الجدول ·
`row_id` / `row_label` الصف · `actor` المنفّذ · `employee_id` · `telegram_id` ·
`terminal_id` الطرفية · **`ip`** · `country` · `user_agent` ·
**`device_type`** (موبايل / تابلت / حاسبة / خادم-بوت / تلغرام) · `os` · `app` ·
`db_role` · `detail` (الحقول المتغيّرة قبل/بعد).

الحقول الحساسة (`pin`, `hash`, `token`, `secret`, `password`, `api_key`) تنحفظ
مخفية `•••`.

## كيف تستعلم

```sql
-- آخر ١٠ حركات جاهزة للقراءة (تصلح للبوت مباشرة)
select public.activity_report_text(10);

-- آخر ٢٠ حركة بصيغة JSON
select public.activity_last(20);

-- كل الأجهزة والـ IP الي اشتغلت آخر أسبوع
select * from public.activity_devices(7);

-- عرض مفصّل
select * from public.activity_feed order by at desc limit 50;

-- كل شغل جهاز معيّن
select * from public.activity_feed where ip = '195.7.10.81' order by at desc;
```

> عند الاستعلام من العرض `activity_feed` مع `limit`، اكتب `order by at desc`
> بالاستعلام نفسه حتى الترتيب يكون مضمون.

## حدود لازم تنعرف

- **بوت تلغرام**: تلغرام ما يمرر IP جهاز المستخدم. الحركة تنحفظ باسم المستخدم
  الحقيقي (`actor` + `telegram_id`) و`device_type = 'تلغرام'`، بينما الـ `ip`
  يكون IP الوظيفة الطرفية (خادم Supabase) — مو جهاز الموظف.
- **الوظائف المجدولة** (واتساب، النسخ الاحتياطي): تنحفظ بمصدر `النظام` وبـ UA
  `pg_net`.
- تحديثات النبض لحالها (`updated_at` / `last_seen_at`) ما تنسجّل — مو حركة حقيقية.
- التدقيق ما يوقف أي عملية: إذا صار خلل بالتسجيل، العملية الأصلية تكمل عادي.

## حماية السجل

- ما ينعدّل نهائيًا، وما ينحذف منه أي حركة أحدث من **١٨٠ يوم**.
- دوال الكتابة (`audit_write`, `audit_set_actor`, `activity_log_gc`) مسحوبة من
  `anon` و`authenticated` — يعني ما أحد يكدر يزوّر حركة أو يمسح السجل من الـ API.
- الاحتفاظ **سنة**، وينظّف تلقائيًا كل يوم الساعة ٣:٤٠ فجرًا
  (`cron job: activity-log-gc`).
