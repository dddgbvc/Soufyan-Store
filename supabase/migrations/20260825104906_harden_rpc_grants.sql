-- ============================================================================
-- تضييق سطح الـ RPC المكشوف للعميل
-- ----------------------------------------------------------------------------
-- PostgREST ينشر أي دالة في schema public يكدر الدور ينفّذها. وبما إن
-- PostgreSQL يعطي EXECUTE لـ PUBLIC تلقائياً على كل دالة جديدة، كان كل شي
-- مكشوف: دوال triggers، دوال داخلية، ودوال بلا مصادقة مثل sync_push.
--
-- المبدأ هنا: امنع كل شي، وبعدين اسمح بقائمة محدّدة فقط.
--   service_role → كل شي (مفتاح الخادم، موثوق)
--   anon         → قائمة الدوال اللي تحرس نفسها بتوكن أو تفتح جلسة
--   authenticated→ نفس قائمة anon + دوال لوحة الإدارة
--   PUBLIC       → لا شي
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) امنع كل شي
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    -- سحب EXECUTE عن PUBLIC يسحبه ضمناً عن service_role، فنعيده صراحة.
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 2) اسمح بقائمة العميل
-- ---------------------------------------------------------------------------

-- بدء الجلسة والتحقق من الرمز — نقطة الدخول، تحرس نفسها بحدّ المحاولات.
grant execute on function public.purchase_login(text, text)                to anon, authenticated;
grant execute on function public.verify_employee_pin(text, text)           to anon, authenticated;

-- جلسة الطرفية: معرّف الجلسة UUID عشوائي يلعب دور التوكن الحامل.
grant execute on function public.app_session_start(text, text, text, uuid, jsonb, text, text, text, text)
                                                                           to anon, authenticated;
grant execute on function public.app_session_ping(uuid)                    to anon, authenticated;
grant execute on function public.app_session_end(uuid, text)               to anon, authenticated;

-- المزامنة: النسخة اللي تتطلّب جلسة موثّقة فقط.
grant execute on function public.sync_ping()                               to anon, authenticated;
grant execute on function public.sync_push(uuid, text, jsonb)              to anon, authenticated;

-- قسم الشراء: كل هذي تنادي purchase_guard(p_token) بأول سطر، فهي محروسة.
grant execute on function public.purchase_bootstrap(text)                              to anon, authenticated;
grant execute on function public.purchase_logout(text)                                 to anon, authenticated;
grant execute on function public.purchase_dashboard(text, integer)                     to anon, authenticated;
grant execute on function public.purchase_list(text, text, date, date, text, integer, integer)
                                                                                       to anon, authenticated;
grant execute on function public.purchase_get(text, uuid)                              to anon, authenticated;
grant execute on function public.purchase_post(text, jsonb)                            to anon, authenticated;
grant execute on function public.purchase_cancel(text, uuid, text)                     to anon, authenticated;
grant execute on function public.purchase_audit_list(text, integer)                    to anon, authenticated;
grant execute on function public.purchase_products_search(text, text, integer)         to anon, authenticated;
grant execute on function public.purchase_shortages(text, boolean)                     to anon, authenticated;
grant execute on function public.purchase_settings_save(text, jsonb)                   to anon, authenticated;
grant execute on function public.purchase_suppliers_list(text, text, boolean)          to anon, authenticated;
grant execute on function public.purchase_supplier_save(text, jsonb)                   to anon, authenticated;
grant execute on function public.purchase_supplier_statement(text, uuid)               to anon, authenticated;
grant execute on function public.purchase_payments_list(text, uuid, integer)           to anon, authenticated;
grant execute on function public.purchase_returns_list(text, text, integer)            to anon, authenticated;
grant execute on function public.purchase_return_post(text, jsonb)                     to anon, authenticated;
grant execute on function public.supplier_payment_post(text, jsonb)                    to anon, authenticated;

-- لوحة الإدارة: تحتاج مستخدماً مسجّلاً في Supabase Auth.
grant execute on function public.set_my_pin(text)                          to authenticated;
grant execute on function public.set_employee_pin(uuid, text)              to authenticated;
grant execute on function public.activity_last(integer)                    to authenticated;
grant execute on function public.activity_devices(integer)                 to authenticated;
grant execute on function public.activity_report_text(integer)             to authenticated;

-- دوال تنسيق بحتة يحتاجها العرض activity_feed (security_invoker=true).
-- ما تلمس أي بيانات، تحوّل قيمة إلى نص عربي فقط.
grant execute on function public."بغداد"(timestamp with time zone)         to authenticated;
grant execute on function public.audit_action_ar(text)                     to authenticated;
grant execute on function public.audit_table_ar(text)                      to authenticated;


-- ---------------------------------------------------------------------------
-- 3) الدوال الجديدة مغلقة افتراضياً
-- ---------------------------------------------------------------------------
-- بدون هذا، أي دالة تُضاف مستقبلاً ترجع مكشوفة لـ anon تلقائياً.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;


-- ---------------------------------------------------------------------------
-- 4) سياسة ميتة على categories
-- ---------------------------------------------------------------------------
-- سياسة `using (true)` لـ anon بلا GRANT مقابل: ما تشتغل اليوم، بس تنفتح
-- بالكامل أول ما ينضاف GRANT. نشيلها بدل ما نترك لغماً. للتأكد من الاتصال
-- استعمل sync_ping().
drop policy if exists categories_probe_read on public.categories;
