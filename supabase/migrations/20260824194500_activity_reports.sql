-- ════════════════════════════════════════════════════════════════════════
--  الجزء ٤ — عرض السجل بالعربي + تقارير الأجهزة + تنظيف دوري
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.audit_table_ar(p_table text)
returns text
language sql
immutable
as $function$
  select coalesce(case p_table
    when 'products'                  then 'المنتجات'
    when 'categories'                then 'التصنيفات'
    when 'customers'                 then 'الزبائن'
    when 'invoices'                  then 'الفواتير'
    when 'invoice_items'             then 'أصناف الفواتير'
    when 'debt_payments'             then 'تسديد الديون'
    when 'expenses'                  then 'المصاريف'
    when 'repairs'                   then 'الصيانة'
    when 'shortages'                 then 'النواقص'
    when 'vault_entries'             then 'الصندوق'
    when 'returns'                   then 'المرتجعات'
    when 'return_items'              then 'أصناف المرتجعات'
    when 'employees'                 then 'الموظفين'
    when 'profiles'                  then 'الحسابات'
    when 'suppliers'                 then 'الموردين'
    when 'purchases'                 then 'فواتير الشراء'
    when 'purchase_items'            then 'أصناف الشراء'
    when 'supplier_payments'         then 'دفعات الموردين'
    when 'purchase_returns'          then 'مرتجعات الشراء'
    when 'purchase_return_items'     then 'أصناف مرتجع الشراء'
    when 'purchase_settings'         then 'إعدادات الشراء'
    when 'purchase_sessions'         then 'جلسات الشراء'
    when 'pin_attempts'              then 'محاولات الرمز السري'
    when 'app_sessions'              then 'جلسات البرنامج'
    when 'telegram_users'            then 'مستخدمي تلغرام'
    when 'telegram_unknown_attempts' then 'محاولات تلغرام مجهولة'
    when 'bot_settings'              then 'إعدادات البوت'
    when 'bot_pending_actions'       then 'طلبات البوت'
    when 'wa_messages'               then 'رسائل واتساب'
    when 'wa_inbound'                then 'ردود واتساب'
    when 'wa_templates'              then 'قوالب واتساب'
  end, p_table, '—');
$function$;

create or replace function public.audit_action_ar(p_action text)
returns text
language sql
immutable
as $function$
  select coalesce(case p_action
    when 'insert' then 'إضافة'
    when 'update' then 'تعديل'
    when 'delete' then 'حذف'
    when 'login'  then 'تسجيل دخول'
    when 'logout' then 'خروج'
  end, p_action, '—');
$function$;

-- العرض الرئيسي للسجل — يحترم صلاحيات القارئ (security_invoker)
create or replace view public.activity_feed
with (security_invoker = true) as
select
  l.id,
  l.at,
  public."بغداد"(l.at)                                        as at_baghdad,
  public.audit_action_ar(l.action) || ' ' ||
    public.audit_table_ar(l.table_name)                        as operation_ar,
  l.action,
  l.table_name,
  l.row_label,
  l.row_id,
  coalesce(l.actor, '—')                                       as actor,
  l.source,
  coalesce(l.device_type, '—')                                 as device_type,
  l.os,
  l.app,
  host(l.ip)                                                   as ip,
  l.country,
  l.terminal_id,
  l.telegram_id,
  l.employee_id,
  l.user_agent,
  l.db_role,
  l.detail
from public.activity_log l
order by l.at desc;

comment on view public.activity_feed is 'سجل الحركات بالعربي مع الـ IP ونوع الجهاز';

grant select on public.activity_feed to authenticated;

-- آخر الحركات (JSON) — للبرنامج والبوت
create or replace function public.activity_last(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(t.j order by t.at desc), '[]'::jsonb)
  from (
    select l.at, jsonb_build_object(
             'الوكت',   public."بغداد"(l.at),
             'العملية', public.audit_action_ar(l.action) || ' ' ||
                        public.audit_table_ar(l.table_name),
             'التفصيل', l.row_label,
             'المنفّذ', coalesce(l.actor, '—'),
             'المصدر',  l.source,
             'الجهاز',  coalesce(l.device_type, '—'),
             'النظام',  l.os,
             'التطبيق', l.app,
             'IP',      host(l.ip),
             'الدولة',  l.country,
             'الطرفية', l.terminal_id
           ) as j
    from public.activity_log l
    order by l.at desc
    limit greatest(1, least(coalesce(p_limit, 20), 200))
  ) t;
$function$;

-- تقرير نصّي جاهز للبوت
create or replace function public.activity_report_text(p_limit integer default 10)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    '📋 آخر ' || count(*) || ' حركة بقاعدة البيانات:' || E'\n\n' ||
    string_agg(
      '• ' || public."بغداد"(t.at) || ' — ' ||
      public.audit_action_ar(t.action) || ' ' || public.audit_table_ar(t.table_name) ||
      coalesce(' (' || t.row_label || ')', '') || E'\n' ||
      '  👤 ' || coalesce(t.actor, 'غير معروف') ||
      '  |  📡 ' || coalesce(t.source, '—') ||
      '  |  📱 ' || coalesce(t.device_type, '—') ||
      coalesce(' ' || t.os, '') || E'\n' ||
      '  🌐 IP: ' || coalesce(host(t.ip), 'غير مسجّل'),
      E'\n\n' order by t.at desc),
    'ما بيه أي حركة مسجّلة')
  from (
    select * from public.activity_log
    order by at desc
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ) t;
$function$;

-- ملخّص الأجهزة والـ IP خلال فترة
create or replace function public.activity_devices(p_days integer default 7)
returns table (
  "المصدر" text, "الجهاز" text, "النظام" text, "التطبيق" text,
  "IP" text, "الدولة" text, "المنفّذ" text,
  "عدد الحركات" bigint, "أول مرة" text, "آخر مرة" text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(l.source, '—'), coalesce(l.device_type, '—'), l.os, l.app,
         host(l.ip), l.country, coalesce(l.actor, '—'),
         count(*), public."بغداد"(min(l.at)), public."بغداد"(max(l.at))
  from public.activity_log l
  where l.at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 365)))
  group by 1, 2, 3, 4, 5, 6, 7
  order by count(*) desc;
$function$;

grant execute on function public.activity_last(integer)        to authenticated;
grant execute on function public.activity_report_text(integer) to authenticated;
grant execute on function public.activity_devices(integer)     to authenticated;

-- تنظيف دوري: نخلّي سنة كاملة، وأقل شي ١٨٠ يوم (حماية السجل)
create or replace function public.activity_log_gc(p_days integer default 365)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n    integer;
  v_days integer := greatest(coalesce(p_days, 365), 180);
begin
  delete from public.activity_log where at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

do $do$
begin
  perform cron.unschedule('activity-log-gc');
exception when others then
  null;
end
$do$;

select cron.schedule('activity-log-gc', '40 3 * * *', 'select public.activity_log_gc(365);');
