# قاعدة البيانات — Database

كل شيء داخل مخطط `erp_auth`، منفصلاً تماماً عن جداول الـERP في `public`.
هذا يسمح بتركيب النظام على قاعدة بيانات ERP قائمة بدون أي تصادم في الأسماء.

الهجرات في `db/migrations/` وتُطبَّق بالترتيب عبر `npm run db:migrate`.
يتتبّع السكربت ما طُبِّق في `erp_auth.schema_migrations` ويرفض تعديل هجرة سبق تطبيقها
(ما عدا ملف الكتالوج، فهو مُعدّ لإعادة التطبيق).

---

## الجداول

### `employees` — الهوية

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid PK | |
| `employee_code` | text | فريد (غير حسّاس لحالة الأحرف) |
| `full_name` | text | ٢–١٢٠ حرفاً |
| `email` | text | فريد، بصيغة صحيحة، اختياري |
| `phone`, `job_title`, `avatar_url` | text | اختيارية |
| `status` | enum | `active` / `disabled` / `suspended` |
| `pin_hash` | text | scrypt للرمز المفلفَل — لا يغادر الخادم |
| `pin_lookup` | text | **فهرس أعمى** فريد: HMAC(pepper, pin) |
| `pin_set_at` | timestamptz | |
| `must_change_pin` | boolean | يفرض التغيير عند أول دخول |
| `auth_user_id` | uuid | الربط مع Supabase Auth، فريد |
| `failed_attempts`, `locked_until` | | الإيقاف المؤقت للحسابات المعروفة |
| `last_login_at`, `last_login_method` | | |
| `is_owner` | boolean | يملك كل الصلاحيات ضمنياً |
| `created_at`, `updated_at`, `created_by` | | |

**قيود جديرة بالذكر**

- `employees_pin_pair` — `num_nonnulls(pin_hash, pin_lookup, pin_set_at) in (0, 3)`.
  إمّا رمز مكتمل أو لا رمز إطلاقاً؛ لا حالة نصفية.
- فهرس فريد على `pin_lookup` — رمزان متطابقان لموظفين مختلفين مستحيلان،
  وهذا **شرط** لعمل الدخول بالرمز وحده.
- مُشغِّل `guard_last_owner` — يمنع حذف أو تعطيل آخر مالك نشط.

### `modules` و `permissions` — المفردات

`modules` صف لكل قسم في الـERP (الكاشير، المخزون، …) مع اسمه العربي ومساره وترتيبه.
`permissions` صف لكل قدرة، بمفتاح `module.action`، ويتحقق قيد أن المفتاح مطابق
لعموديه (`permissions_key_matches`) — فلا ينحرف المفتاح عن تصنيفه أبداً.

`is_dangerous` تُعلِّم القدرات الهدّامة (حذف، إلغاء، تعديل سعر) لتظهر مميّزة في محرر
الصلاحيات.

### `employee_permissions` — المنح

جدول ربط بسيط بمفتاح أساسي مركّب. لا أدوار: كل موظف يحمل مجموعته الخاصة.

### `sessions`

| العمود | ملاحظات |
|---|---|
| `token_hash` | SHA-256 للرمز، فريد. الرمز الأصلي لا يُخزَّن |
| `method` | `pin` / `password` / `qr` |
| `expires_at` | نافذة الخمول، تتحرّك مع كل طلب |
| `absolute_expires_at` | سقف صارم لا تتجاوزه مهما كان النشاط |
| `revoked_at`, `revoked_reason` | الإبطال |
| `ip`, `user_agent`, `device_label` | لعرض «أجهزتي» |
| `rotated_from` | تتبّع تدوير الجلسة بعد تغيير الرمز |

قيد `sessions_expiry_order` يضمن `expires_at <= absolute_expires_at`.

### `otp_requests`

`code_hash` (scrypt في نطاق `otp`)، `expires_at`، `attempts` / `max_attempts`،
ثم `reset_token_hash` + `reset_expires_at` للمقبض المؤقت الذي يُصدَر بعد تحقق صحيح.
`consumed_at` يجعل الاستخدام لمرة واحدة.

قيد `otp_attempts_range` يمنع تجاوز ميزانية المحاولات على مستوى قاعدة البيانات.

### `qr_login_challenges`

ثلاثة أسرار منفصلة لكل تحدٍّ:

| العمود | من يملكه | ما يثبته |
|---|---|---|
| `token_hash` | الهاتف (من الصورة) | أن الهاتف رأى هذه الشاشة فعلاً |
| `poll_secret_hash` | التبويب الأصلي | أنه صاحب التحدي |
| `device_binding_hash` | كوكي المتصفح الأصلي | أنه نفس المتصفح |

`status` يمرّ في `pending → approved → consumed`، مع `expired` و`revoked`.
قيود `qr_approved_state` و`qr_consumed_state` تمنع حالة موافَق عليها بلا موظف أو بلا
وقت — أي أن آلة الحالة نفسها مفروضة في المخطط، لا في الكود فقط.

### `audit_logs`

جدول **إضافة فقط**: مُشغِّل `deny_mutation` يرفض أي `UPDATE` أو `DELETE`، حتى من مالك
الجدول.

لذلك `employee_id` و`actor_employee_id` و`session_id` **ليست مفاتيح أجنبية**: لو كانت
كذلك لاحتاج حذف موظف إلى `UPDATE` على السجل — وهو ما يمنعه المُشغِّل، فيصبح حذف أي
موظف مستحيلاً. الاحتفاظ بالمعرّفات الخام يبقي تاريخ الموظف المحذوف سليماً.

### `rate_limits`

عدّاد نافذة ثابتة: `bucket` (مفتاح أساسي)، `window_start`، `hits`، `strikes`،
`blocked_until`.

---

## الدوال

| الدالة | الغرض |
|---|---|
| `consume_rate_limit(bucket, limit, window, block)` | استهلاك ذرّي مع تصعيد العقوبة |
| `reset_rate_limit(bucket)` | تصفير بعد نجاح مشروع |
| `employee_permission_keys(uuid)` | مفاتيح الموظف الممنوحة |
| `has_permission(uuid, key)` | **المرجع الوحيد** لقرار الصلاحية |
| `current_employee_id()` | الموظف الحالي من Supabase Auth JWT حصراً |
| `current_has_permission(key)` | نسخة RLS من `has_permission` |
| `public.erp_auth_can(key)` | خطّاف الدمج لجداول الـERP في `public` |
| `purge_expired(days)` | صيانة: إنهاء التحديات القديمة وحذف الصفوف الميتة |

### `consume_rate_limit` ولماذا هي في قاعدة البيانات

العدّ في الذاكرة لا ينفع مع أكثر من نسخة خادم، والقراءة ثم الكتابة من الكود يخلق
سباقاً يسمح لعشر محاولات متوازية بالمرور من حد خمس محاولات.

الدالة تقفل الصف (`SELECT … FOR UPDATE`) وتتخذ القرار كاملاً داخل استدعاء واحد.
اختبار `holds the limit under concurrent load` يطلق ١٢ طلباً متوازياً على حدّ ٥
ويؤكد مرور ٥ بالضبط.

عند تجاوز الحدّ يتضاعف زمن الحظر (١×، ٢×، ٤×، ٨×، ١٦×) بحدٍّ أقصى ساعة، وتتناقص
العقوبة تدريجياً مع مرور النوافذ الهادئة.

---

## الفهارس

| الفهرس | يخدم |
|---|---|
| `employees_pin_lookup_key` | الدخول بالرمز — بحث واحد بدل مسح الجدول |
| `employees_email_key`, `employees_code_key` | التفرّد والبحث |
| `sessions_token_unique` | التحقق من الجلسة في كل طلب |
| `sessions_live_idx` (جزئي) | الجلسات غير المُبطَلة |
| `qr_challenges_status_idx` | الاستطلاع والتنظيف |
| `audit_logs_created_idx`, `_event_idx`, `_failure_idx` (جزئي) | استعراض السجل |
| `otp_reset_token_key` (جزئي) | استهلاك مقبض إعادة التعيين |

---

## الصيانة الدورية

```sql
select * from erp_auth.purge_expired(30);
```

تُنهي التحديات المنتهية، وتحذف الجلسات الميتة الأقدم من ٣٠ يوماً، ورموز OTP
المستهلكة، ودلاء التحديد الخاملة. سجل التدقيق لا يُمسّ.

على Supabase يمكن جدولتها بـ`pg_cron`:

```sql
select cron.schedule('erp-auth-purge', '0 3 * * *', $$select erp_auth.purge_expired(30)$$);
```
