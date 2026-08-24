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

---

## 4. تنبيه الديون المتأخرة

عمود `customers.grace_period_days` كان موجود من الأول وماكو شي يستعمله.

| الدالة | الفائدة |
|---|---|
| `overdue_debts()` | يرجّع JSON: العدد، المجموع، وقائمة المتأخرين |
| `overdue_debts_text()` | نفس الشي كنص عربي جاهز للبوت |
| `tg_overdue_debts()` | cron كل يوم سبت ١٠ صباحاً — ما يدز شي إذا ماكو متأخرين |

وأمر `/ديون` (أو `/debts`) بالبوت يعطيك نفس القائمة بأي وكت.

**تعريف "متأخر"**: مرّت مهلة السماح من **آخر حركة** على حساب الزبون —
آخر فاتورة خلّت عليه دين، أو آخر تسديد، أيهما أحدث. مو من تاريخ تسجيله
بالنظام: زبون قديم اشترى أمس ما يعتبر متأخر.

## 5. توقيت التقرير ونظافة البيانات

- **التقرير اليومي** انتقل من `0 18 * * *` (٩ مساءً) لـ`30 19 * * *`
  (١٠:٣٠ مساءً) — كان يفوته ٣ فواتير من ٣٥ تنكتب بعد التاسعة.
- **٨ منتجات بلا قسم** انترتبت: ٥ شواحن وكوابل، سماعات، حافظة، و٢ أجهزة.
  صار ماكو ولا منتج بلا قسم.
- **نقص فايت**: «شاشة iPhone 13 بديلة» (٢ من حد ٢) ما كانت بجدول النواقص،
  لأن `notify_low_stock` يشتغل فقط وكت الكمية **تنزل** تحت الحد، وهذي
  انخلقت أصلاً عند الحد فما صار عبور. انضافت بعلامة `is_manual = true`.
  الجدول يديره البرنامج عبر `sync_push`، فما انضافت مزامنة من السيرفر
  حتى ما يصير تعارض بالملكية.

## 6. تحصين البوت

- **`loadCustomer`** كانت تبني الاستعلام كنص من `callback_data` (شي يرسله
  جهاز المستخدم). صارت تنادي `bot_get_customer(uuid)` بمعامل مكتوب، مع
  فحص شكل الـUUID بجانب البوت قبل ما يوصل لقاعدة البيانات.
- **`search_path` مثبّت** لثلاث دوال كانت متروكة: `permissions_for`،
  `touch_updated_at`، `vault_entries_immutable`.
- **pg_net بمخطط public** تُرك عمداً: نقله يخاطر بكسر `net.http_post`
  اللي يعتمد عليه `tg_send` والنسخة الاحتياطية، والخطر النظري أقل بكثير
  من خطر تعطيل البوت.

---

## 7. رسائل واتساب التلقائية

ثلاث رسائل تنبني تلقائياً بلا أي تدخل:

| النوع | متى تنبني | المشغّل |
|---|---|---|
| `welcome` | مع كل فاتورة بيع | `trg_wa_new_invoice` |
| `payment` | مع كل تسديد دين | `trg_wa_debt_payment` |
| `debt` | للزبائن المتأخرين | `wa_queue_overdue()` |

### ⚠️ الحقيقة اللي لازم تعرفها عن واتساب

واتساب **ما يسمح** بالإرسال الآلي إلا عبر **WhatsApp Cloud API** الرسمي
(حساب Meta Business + قوالب موافق عليها). أي مكتبة غير رسمية
(whatsapp-web.js، Baileys…) تعرّض رقم المحل لـ**حظر دائم**.

فالنظام يشتغل بوضعين، والقوالب والطابور والمشغّلات نفسها بالاثنين:

**وضع `link` — شغال من هسه، بلا أي إعداد**
الرسالة تنبني وتنخزن، والبوت يدزلك بتلغرام رسالة بيها زر.
ضغطة وحدة → يفتح واتساب والنص مكتوب جاهز → تدزها بنفسك.

**وضع `cloud` — تلقائي كامل**
ينفعّل لحاله أول ما تنحط هذي الأسرار بالخزنة (vault):

```sql
select vault.create_secret('<التوكن>',    'whatsapp_token');
select vault.create_secret('<رقم الهوية>', 'whatsapp_phone_id');
```

بعدها الرسائل تنرسل بلا تدخل. تنبيه: خارج نافذة الـ٢٤ ساعة من آخر رد
للزبون، Meta تطلب **قالب موافق عليه** — النظام يمسك هذا الخطأ ويكتبه
بالعربي (`خارج نافذة الـ٢٤ ساعة — يحتاج قالب موافق عليه من Meta`).

### الجداول والدوال

| العنصر | الفائدة |
|---|---|
| `wa_templates` | نصوص الرسائل — عدّلها بأي وكت بلا ما تلمس الكود |
| `wa_messages` | الطابور: `pending` / `sent` / `linked` / `skipped` / `failed` |
| `normalize_iraqi_phone()` | `07701234567` أو `٠٧٧٠…` أو `+964…` → `9647701234567` |
| `wa_queue()` | يضيف رسالة (يمنع تكرار تذكير الدين قبل ٧ أيام) |
| `wa_next_batch()` | يسحب دفعة، يحترم ساعات الهدوء |
| `wa_stats()` | ملخص لأمر `/واتساب` بالبوت |
| `wa-send` | الدالة اللي تدز فعلاً — cron كل ١٠ دقائق |

### المتغيرات داخل القوالب

`{اسم}` · `{رقم_الفاتورة}` · `{المبلغ}` · `{المدفوع}` · `{سطر_الدين}` ·
`{المسدد}` · `{المتبقي}` · `{سطر_المتبقي}` · `{الدين}` · `{آخر_حركة}`

أي متغير ما ينعرف ينشال تلقائياً، فما تخرب الرسالة.

### الضمانات

- **ساعات هدوء**: ما يدز شي قبل ٩ صباحاً ولا بعد ٩ مساءً (بغداد).
- **تذكير الدين مرة كل ٧ أيام** للزبون نفسه، مهما انندت الدالة.
- **٣ محاولات كحد أقصى** لكل رسالة.
- **الأرقام الغلط** تنسجل `skipped` مع السبب، وتطلعلك بأمر `/واتساب`
  حتى تصلحها — مو تنضيع بصمت.
- **زبون سريع بلا رقم** ما ينسجلله شي إطلاقاً.
- **المشغّلات ملفوفة بـexception**: أي خلل بالواتساب ما يمنع تسجيل
  الفاتورة أو التسديد أبداً.
- بوضع `link` الرسالة تنرسل **لأول chat_id بس** — حتى ما يدزها اثنين
  للزبون نفسه.

### الإعدادات

```sql
update public.bot_settings set value = jsonb_build_object(
  'mode', 'auto',        -- 'link' يجبره على النصف تلقائي حتى لو المفاتيح موجودة
  'quiet_from', 9, 'quiet_to', 21,
  'batch_size', 10
) where key = 'whatsapp';
```

إطفاء نوع رسائل: `update wa_templates set enabled = false where kind = 'debt';`

### الويبهوك (Callback URL)

```
https://tyfidwamnlraysqrfdgb.supabase.co/functions/v1/wa-webhook
```

رمز التحقق محفوظ بالخزنة باسم `whatsapp_verify_token` — اقراه بـ:

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_verify_token';
```

> ⚠️ لا تكتب الرمز بالمستودع — المستودع عام.

**الحقول المطلوبة بلوحة Meta** → WhatsApp → Configuration → Webhook:

| الحقل | القيمة |
|---|---|
| Callback URL | الرابط أعلاه |
| Verify token | من الخزنة |
| Webhook fields | `messages` (يكفي) |

**للتحقق من التوقيع** (اختياري بس مفضّل) ضيف سرّ التطبيق:

```sql
select vault.create_secret('<App Secret من Meta>', 'whatsapp_app_secret');
```

إذا انضاف، أي طلب بتوقيع غلط ينرفض. إذا مو موجود، الدالة تكمل وتكتب
تنبيه بالسجل — حتى الضبط الأولي ما ينعطل.

**شنو يسوي الويبهوك:**

- `GET` — فحص ملكية الرابط: يرجّع `hub.challenge` إذا الرمز طابق (اختُبر ✅).
- `POST statuses` — تقارير التسليم تنكتب بـ`wa_messages`:
  `delivered_at` · `read_at` · والفشل ينعلّم `failed` مع السبب.
- `POST messages` — رد الزبون ينسجل بـ`wa_inbound` **وينربط تلقائياً
  بالزبون عبر رقمه** (اختُبر: `9647701234567` ← أحمد الجبوري ✅).

رد الزبون مهم لأنه **يفتح نافذة ٢٤ ساعة** تسمح بإرسال نص حر — بدونها
Meta تطلب قالب موافق عليه لكل رسالة.

---

## 8. سيناريو الاختبار المتكامل (`wa-demo`)

```
doc_invoice → buildInvoice → buildDocumentPdf → Storage → Cloud API
```

يشغّل بأمر واحد:

```sql
select net.http_post(
  url := 'https://tyfidwamnlraysqrfdgb.supabase.co/functions/v1/wa-demo',
  headers := jsonb_build_object('Content-Type','application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                       where name='telegram_webhook_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 120000);
```

`'{"dry_run":true}'` يبني الـPDF ويرفعه بلا إرسال · وتكدر تمرر
`invoice` و `to` و `caption` و `filename` لتغيير أي شي.

### درس مهم: ممنوع الكتابة المباشرة على الجداول

جداول المشروع **بلا أي GRANT عمداً** — كل شي يمر عبر `SECURITY DEFINER`.
يعني حتى بمفتاح `service_role`:

```ts
await db.from("wa_messages").insert({...})   // ❌ يفشل بـ42501 بصمت
await db.rpc("wa_record_sent", {...})        // ✅
```

هاي بالضبط نفس جذر مشكلة الـ401 بالقسم ٢. انلكزت بالديمو: الرسالة
انرسلت بنجاح بس ما انسجلت بالطابور. الدوال المضافة للتصليح:

| الدالة | الفائدة |
|---|---|
| `wa_record_sent(...)` | يسجل رسالة مرسلة مع معرّف Meta |
| `wa_set_wamid(id, wamid)` | يربط معرّف Meta برسالة موجودة |

### تسجيل الرقم على الـCloud API

رقم متحقق منه **مو كافي** للإرسال. لازم خطوة `register`، وبدونها
كل إرسال يرجع `(#133010) Account not registered`:

```sql
select net.http_post(
  url := 'https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/register',
  headers := jsonb_build_object('Content-Type','application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret
       from vault.decrypted_secrets where name='whatsapp_token')),
  body := jsonb_build_object('messaging_product','whatsapp','pin','<٦ أرقام>'));
```

الـPIN محفوظ بالخزنة باسم `whatsapp_2fa_pin`. لفحص حالة الرقم:

```sql
select net.http_get(url := 'https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>'
  || '?fields=display_phone_number,verified_name,code_verification_status,status,platform_type',
  headers := jsonb_build_object('Authorization','Bearer ' || (select decrypted_secret
    from vault.decrypted_secrets where name='whatsapp_token')));
```

`status: PENDING` + `platform_type: NOT_APPLICABLE` = الرقم ما مسجّل بعد.
بعد التسجيل الناجح يرجع `{"success": true}`.

---

## 9. ربط القوالب بالنظام التلقائي

كل رسالة بالطابور صارت تحمل **مسارين**، و`wa-send` تختار وقت الإرسال:

| الحالة | المسار | ليش |
|---|---|---|
| الزبون راسلنا خلال ٢٤ ساعة | `body` نص حر | أرخص، أمرن، وما يحتاج اعتماد |
| برّا النافذة | `template_name` + `template_params` | Meta ما تسمح بغيره |

كشف النافذة من جدول `wa_inbound`:
`wa_window_open(phone)` → آخر رد من الزبون خلال ٢٤ ساعة.

### الأعمدة الجديدة بـ`wa_messages`

| العمود | الفائدة |
|---|---|
| `template_name` | اسم القالب المعتمد |
| `template_params` | معاملاته بالترتيب `{{1}},{{2}},{{3}}` |
| `media_url` | رابط الفاتورة PDF المرفقة بترويسة القالب |

### القوالب

| القالب | النوع | المعاملات |
|---|---|---|
| `invoice_thanks` | welcome | الاسم · رقم الفاتورة · المبلغ |
| `payment_received` | payment | الاسم · المسدّد · المتبقي |
| `debt_reminder` | debt | الاسم · الدين · آخر حركة |

كلها `UTILITY` وبالعربي. `invoice_thanks` بترويسة `DOCUMENT` —
`wa-send` تبني الفاتورة PDF وترفعها لـStorage وتمرر رابطها بالترويسة،
فالزبون يستلم الشكر والفاتورة **برسالة وحدة**.

إنشاؤها: دالة `wa-templates` (تتخطى الموجود، و`{"list":true}` تعرض بلا إنشاء).
ترويسة الوسائط تحتاج عيّنة وقت الإنشاء تنرفع عبر Resumable Upload API —
الدالة تبني فاتورة حقيقية وترفعها وتاخذ الـ`header_handle`.

### قيود معاملات القوالب

Meta ترفض المعامل إذا كان فارغاً، أو بيه سطر جديد، أو أكثر من ٤ فراغات
متتالية. المشغّلات تستعمل `coalesce(..., '—')` لكل معامل لهذا السبب.

### أخطاء Meta المترجمة

`132000` عدد المعاملات ما يطابق · `132001` القالب مو معتمد بهذي اللغة ·
`132015` القالب متوقف · `131047` برّا النافذة · `133010` الرقم مو مسجّل

---

## 10. نظام الأقسام والهرم داخل Supabase

**الفكرة**: Postgres عنده `schemas` وهي بالضبط «الأقسام»، وSupabase يعرضها
بقائمة منسدلة بالـTable Editor. بدل ما تدور بين ٢٠ جدول بأسماء إنكليزية،
تختار القسم وتشوف محتواه بالعربي.

### الأقسام الخمسة

| القسم | المحتوى |
|---|---|
| `مبيعات` | الملخص · القائمة · التفاصيل · ملخص_يومي · المرتجعات |
| `زبائن` | الملخص · القائمة · المدينون · التفاصيل |
| `مخزن` | الملخص · القائمة · النواقص · التفاصيل |
| `صيانة` | الملخص · القائمة |
| `مالية` | الملخص · القائمة · التفاصيل |

### الهرم — ثلاث طبقات ثابتة الأسماء بكل قسم

```
الملخص    ← أرقام القسم بسطر واحد        (قمة الهرم)
القائمة   ← الصفوف الرئيسية
التفاصيل  ← أدق مستوى
```

نفس الأسماء بكل قسم، فتتعلمها مرة وتنطبق على الكل.

**شلون تستعملها**: Supabase → Table Editor → القائمة المنسدلة فوق (schema)
→ اختار القسم. أو من محرر SQL مباشرة، والأسماء العربية تشتغل **بلا اقتباس**:

```sql
select * from مبيعات.الملخص;
select * from مخزن.النواقص;
select * from زبائن.المدينون;
```

### البحث

```sql
-- بحث شامل بكل الأقسام: رقم فاتورة، تاريخ، زبون، هاتف،
-- منتج، باركود، رقم وصل تصليح، أو IMEI
select * from بحث.شامل('علي');
select * from بحث.شامل('2026-08-21');
select * from بحث.شامل('ايفون');

-- بحث الفواتير مع فلاتر
select * from بحث.فواتير('ايفون');                    -- يلكاه بالمواد هم
select * from بحث.فواتير(null, '2026-08-01', '2026-08-24');
```

`بحث.شامل` يرجّع: القسم · النوع · المرجع · التفاصيل · المبلغ · التاريخ —
مرتّبة بالأحدث. والأرقام العربية (٠١٢٣) تنحوّل تلقائياً.

### ملاحظات

- كلها **views للقراءة فقط** — الجداول الأصلية ما تنلمس إطلاقاً
- الأوقات محوّلة لتوقيت بغداد، والقيم معرّبة (`CASH` ← `نقد`)
- الدالتان `public.بغداد()` و `public.بغداد_يوم()` اختصارات للتحويل
- الوصول ممنوح لـ`service_role` فقط — ما تنكشف للعامة

### تعريب القيم + قسم النظام

القيم الإنكليزية المخزّنة بالجداول تنعرّب **بالعرض فقط** عبر
`public.عرّب(نوع, قيمة)` — والقيمة الأصلية تبقى بالجدول مثل ما هي
حتى البرنامج والبوت ما ينكسرون:

| قبل | بعد |
|---|---|
| `cat_rent` · `cat_salary` · `cat_utilities` | إيجار · رواتب · خدمات (كهرباء وماء) |
| `ADMIN` · `MANAGER` · `CASHIER` | مدير عام · مدير · كاشير |
| `sale` · `active` | بيع · فعّال |
| `welcome` · `payment` · `debt` | شكر بعد الشراء · تأكيد تسديد · تذكير دين |

**قسم `نظام` الجديد**: الموظفين · جلسات_البرنامج · محاولات_الدخول ·
مستخدمي_البوت · رسائل_واتساب · قوالب_واتساب · ردود_الزبائن · إعدادات_البوت

وانضاف `مخزن.الأقسام` و `مبيعات.مواد_المرتجعات`.

### ليش أسماء الجداول الأصلية بقت إنكليزية

جداول `public` (`invoices`, `customers`, …) **ما تنعاد تسميتها**، لأن
اسمها مكتوب حرفياً بعشرات الأماكن:

- برنامج الكاشير (Electron) — `sync_push` وكل استعلاماته
- دوال البوت الأربعين — `doc_invoice`, `bot_find_customer`, `ai_query`…
- مولّد المستندات `docgen` ونظام واتساب كامل
- النسخة الاحتياطية اليومية

تغيير اسم جدول واحد يكسر السلسلة كلها بلحظة. الـviews تعطيك نفس
الفائدة (تصفّح عربي بالكامل) **بمخاطرة صفر** — والجداول الأصلية تبقى
طبقة تقنية ما تشوفها إلا إذا دخلت `public` قصداً.
