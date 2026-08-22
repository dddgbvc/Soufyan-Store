-- ============================================================
-- تحصين البوت
--
-- ١) دالة loadCustomer بالبوت كانت تبني الاستعلام كنص:
--       select ... from customers where id = '${cid}'::uuid
--    و cid يجي من callback_data — وهذا شي يرسله جهاز المستخدم،
--    يعني ينكدر ينتحل. الكتابة ممنوعة أصلاً (ai_query يلفّ الاستعلام
--    داخل FROM فما ينفع insert/update)، بس القراءة تبقى مفتوحة:
--    موظف عنده صلاحية يكدر يقرا صفوف مو من حقه.
--    الحل: دالة بمعامل مكتوب (uuid) بدل بناء النص.
--
-- ٢) ثلاث دوال بدون search_path مثبّت — تحذير أمان بالـadvisors.
--    ALTER كافية، ما نحتاج نعيد كتابة أجسامها.
-- ============================================================

create or replace function public.bot_get_customer(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('id', c.id, 'name', c.name, 'balance', c.balance)
  from public.customers c
  where c.id = p_customer_id;
$function$;

revoke all on function public.bot_get_customer(uuid) from public;
grant execute on function public.bot_get_customer(uuid) to service_role;

-- تثبيت search_path
alter function public.permissions_for(text)       set search_path to 'public';
alter function public.touch_updated_at()          set search_path to 'public';
alter function public.vault_entries_immutable()   set search_path to 'public';

-- ملاحظة: امتداد pg_net مسجّل بمخطط public وهذا تحذير بالـadvisors،
-- بس نقله (ALTER EXTENSION … SET SCHEMA) يخاطر بكسر net.http_post
-- اللي يعتمد عليه tg_send والنسخة الاحتياطية. تركناه عمداً —
-- الخطر النظري أقل بكثير من خطر تعطيل البوت.
