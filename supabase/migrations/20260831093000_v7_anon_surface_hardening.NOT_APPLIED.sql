-- ============================================================================
-- V7 · تضييق سطح anon  —  ⚠️ لم تُطبَّق على الإنتاج، عن قصد
-- ----------------------------------------------------------------------------
-- قرار صاحب المشروع (٣١ آب ٢٠٢٦): تبقى التغييرات المطبَّقة إضافية غير كاسرة،
-- وتُسلَّم هذه المهاجرة مراجَعةً وغير مطبَّقة مع خطة إطلاق.
--
-- لماذا هي مطلوبة:
--   المفتاح العلني (anon) موجود في كل نسخة من الواجهة، فهو معروف للجميع
--   بطبيعته. و٢٥ دالة SECURITY DEFINER ممنوحة لـ anon تعني أن أي شخص على
--   الإنترنت يستطيع استدعاءها مباشرةً عبر /rest/v1/rpc/… بلا أي حساب.
--
-- لماذا لم تُطبَّق تلقائيًا:
--   التطبيق الحيّ (نقطة البيع، وحدة المشتريات، بوت تيليغرام) لا يوجد مصدره
--   في هذا المستودع. سحب EXECUTE قد يوقف شاشة دخول الموظف أو قسم الشراء
--   فورًا وفي منتصف يوم عمل. هذا قرار تشغيلي لا يُتخذ نيابةً عن صاحب المحل.
--
-- خطة الإطلاق المقترحة:
--   1) شغّل «قبل» أدناه لمعرفة أي الدوال تُستدعى فعلًا وبأي دور.
--   2) طبّق القسم (أ) وحده — وهو الأقل خطرًا وأعلى قيمة.
--   3) راقب سجلّ الأخطاء ٢٤ ساعة، ثم طبّق (ب) و(ج).
--   4) عند أي عطل: قسم التراجع في نهاية الملف يُعيد الحال فورًا.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- قبل التطبيق: ما الذي يُستدعى فعلًا؟
-- ----------------------------------------------------------------------------
-- يحتاج pg_stat_statements. شغّله وراجع النتيجة قبل أي سحب صلاحية.
--
--   select calls, query
--     from pg_stat_statements
--    where query ilike '%verify_employee_pin%'
--       or query ilike '%purchase_%'
--       or query ilike '%sync_push%'
--    order by calls desc;
--
-- وبديل لا يحتاج امتدادًا — من سجلّ النشاط نفسه:
--
--   select action, db_role, count(*)
--     from public.activity_log
--    where at > now() - interval '30 days'
--    group by 1,2 order by 3 desc;


-- ============================================================================
-- (أ) أوّلوية عليا — وحدة المشتريات: واجهة رمز مفتوحة لـ anon
-- ----------------------------------------------------------------------------
-- purchase_login(p_pin_hash, p_terminal_id) تُصدر رمز جلسة مقابل بصمة PIN،
-- وكلّ purchase_* التالية تقبل ذلك الرمز. المجموعة كاملة ممنوحة لـ anon،
-- فهي فعليًا واجهة برمجية كاملة للمشتريات والموردين مفتوحة على الإنترنت،
-- يحرسها رمز PIN من أربعة إلى ستة أرقام.
--
-- الأثر المتوقّع: يتوقف قسم الشراء عن العمل إن كان يستدعي هذه الدوال بمفتاح
-- anon. الإصلاح في التطبيق: تسجيل دخول Supabase حقيقي ثم استدعاؤها كـ
-- authenticated.
-- ============================================================================

revoke execute on function public.purchase_login(text, text)                      from anon;
revoke execute on function public.purchase_logout(text)                           from anon;
revoke execute on function public.purchase_bootstrap(text)                        from anon;
revoke execute on function public.purchase_dashboard(text, integer)               from anon;
revoke execute on function public.purchase_get(text, uuid)                        from anon;
revoke execute on function public.purchase_list(text, text, date, date, text, integer, integer) from anon;
revoke execute on function public.purchase_post(text, jsonb)                      from anon;
revoke execute on function public.purchase_cancel(text, uuid, text)               from anon;
revoke execute on function public.purchase_audit_list(text, integer)              from anon;
revoke execute on function public.purchase_payments_list(text, uuid, integer)     from anon;
revoke execute on function public.purchase_products_search(text, text, integer)   from anon;
revoke execute on function public.purchase_return_post(text, jsonb)               from anon;
revoke execute on function public.purchase_returns_list(text, text, integer)      from anon;
revoke execute on function public.purchase_settings_save(text, jsonb)             from anon;
revoke execute on function public.purchase_shortages(text, boolean)               from anon;
revoke execute on function public.purchase_supplier_save(text, jsonb)             from anon;
revoke execute on function public.purchase_supplier_statement(text, uuid)         from anon;
revoke execute on function public.purchase_suppliers_list(text, text, boolean)    from anon;
revoke execute on function public.supplier_payment_post(text, jsonb)              from anon;


-- ============================================================================
-- (ب) مزامنة غير موثَّقة
-- ----------------------------------------------------------------------------
-- sync_push(p_session_id, p_table, p_rows) تكتب صفوفًا في جداول العمل
-- اعتمادًا على معرّف جلسة وحده. مع كون app_session_start متاحة لـ anon،
-- يستطيع أي مستدعٍ أن يفتح جلسة ثم يكتب بها.
-- ============================================================================

revoke execute on function public.sync_push(uuid, text, jsonb) from anon;
-- sync_ping() قراءة محضة بلا بيانات — تُترك متاحة عمدًا.


-- ============================================================================
-- (ج) دخول الموظف بالـPIN
-- ----------------------------------------------------------------------------
-- verify_employee_pin متاحة لـ anon، فهي مِعراف PIN عالميّ مفتوح على
-- الإنترنت: لا اسم مستخدم، والفضاء ١٠⁴–١٠⁶ فقط. حدّ المحاولات شُدِّد في
-- المهاجرة 20260831090000 (أُضيف سقف ساعيّ لكل IP وسقف لعدد معرّفات
-- الأجهزة من IP واحد)، لكن الإصلاح الجذري أن تُستدعى بجلسة موثَّقة.
--
-- ⚠️ لا تُطبَّق هذه إلا بعد تحديث شاشة دخول الموظف في التطبيق الحيّ،
--     وإلا توقّف دخول الموظفين بالـPIN فورًا.
-- ============================================================================

-- revoke execute on function public.verify_employee_pin(text, text) from anon;


-- ============================================================================
-- (د) جلسات التشغيل المجهولة
-- ----------------------------------------------------------------------------
-- app_session_start متاحة لـ anon فيستطيع أي أحد إنشاء صفوف جلسات بلا حدّ.
-- الجلسة الناتجة لا تمنح هوية (تحقّقنا: app_session_whoami تردّ
-- reason:"anonymous")، فالأثر إغراق جدول لا تجاوز صلاحية. الحدّ الزمني
-- أنسب من سحب الصلاحية لأن الدالة جزء من الإقلاع الطبيعي.
-- ============================================================================

-- خيار ألطف من سحب EXECUTE: حدّ إنشاء الجلسات لكل IP.
-- (يحتاج نقل نداء rate_limit_hit إلى داخل app_session_start.)


-- ============================================================================
-- (هـ) عمود بصمة PIN على profiles
-- ----------------------------------------------------------------------------
-- profiles.pin_hash فارغ تمامًا على هذا المشروع (٠ صفوف غير فارغة) والتحقق
-- الفعلي يستعمل employees.pin_hash. سحب صلاحية العمود صحيح دفاعيًا لكنه
-- يكسر أي نداء profiles?select=* في التطبيق الحيّ.
--
-- ملاحظة: anon و authenticated لا يملكان أصلًا أي GRANT على public.profiles
-- (تُحقّق منه: postgres وحده يملك صلاحيات الجدول)، فسياسات profiles_self_*
-- غير قابلة للوصول عبر PostgREST اليوم. السطر أدناه دفاع في العمق لا أكثر.
-- ============================================================================

-- revoke select (pin_hash) on public.profiles from anon, authenticated;


-- ============================================================================
-- (و) إعدادات لوحة التحكم — ليست SQL
-- ----------------------------------------------------------------------------
--  • Authentication ← Providers ← Email:
--      فعّل "Leaked password protection" (advisor: auth_leaked_password_protection).
--  • Authentication ← URL Configuration:
--      أضف نطاق التشغيل إلى Redirect URLs وإلا لم يعمل استرجاع كلمة المرور.
--  • Database ← Extensions:
--      انقل pg_net خارج schema public (advisor: extension_in_public).
--  • Edge Functions ← Secrets:
--      اضبط SETUP_ALLOWED_ORIGINS بنطاق التشغيل الحقيقي
--      (setup-invoice و setup-provision يقرآنه؛ بدونه تُسمح عناوين التطوير وحدها).
-- ============================================================================


-- ============================================================================
-- التراجع — إن أوقف أيٌّ مما سبق التطبيق الحيّ
-- ============================================================================
-- grant execute on function public.purchase_login(text, text)                    to anon;
-- grant execute on function public.purchase_logout(text)                         to anon;
-- grant execute on function public.purchase_bootstrap(text)                      to anon;
-- grant execute on function public.purchase_dashboard(text, integer)             to anon;
-- grant execute on function public.purchase_get(text, uuid)                      to anon;
-- grant execute on function public.purchase_list(text, text, date, date, text, integer, integer) to anon;
-- grant execute on function public.purchase_post(text, jsonb)                    to anon;
-- grant execute on function public.purchase_cancel(text, uuid, text)             to anon;
-- grant execute on function public.purchase_audit_list(text, integer)            to anon;
-- grant execute on function public.purchase_payments_list(text, uuid, integer)   to anon;
-- grant execute on function public.purchase_products_search(text, text, integer) to anon;
-- grant execute on function public.purchase_return_post(text, jsonb)             to anon;
-- grant execute on function public.purchase_returns_list(text, text, integer)    to anon;
-- grant execute on function public.purchase_settings_save(text, jsonb)           to anon;
-- grant execute on function public.purchase_shortages(text, boolean)             to anon;
-- grant execute on function public.purchase_supplier_save(text, jsonb)           to anon;
-- grant execute on function public.purchase_supplier_statement(text, uuid)       to anon;
-- grant execute on function public.purchase_suppliers_list(text, text, boolean)  to anon;
-- grant execute on function public.supplier_payment_post(text, jsonb)            to anon;
-- grant execute on function public.sync_push(uuid, text, jsonb)                  to anon;
