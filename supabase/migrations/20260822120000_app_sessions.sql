-- ============================================================
-- جلسات فتح البرنامج (app_sessions)
-- سجل دائم يجاوب على: شوكت انفتح البرنامج؟ منو فتحه؟ من أي جهاز؟ وشكد ضل مفتوح؟
--
-- نفس أسلوب المشروع: الجدول بدون أي صلاحية مباشرة (لا anon ولا authenticated)،
-- وكل الوصول يمر عبر دوال SECURITY DEFINER.
-- ============================================================

create table if not exists public.app_sessions (
  id            uuid primary key default gen_random_uuid(),
  terminal_id   text        not null,
  employee_id   uuid        references public.employees(id) on delete set null,
  employee_name text,
  app_version   text,
  platform      text,
  opened_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  closed_at     timestamptz,
  close_reason  text check (close_reason is null
                            or close_reason in ('normal','logout','timeout','crash')),
  meta          jsonb       not null default '{}'::jsonb
);

alter table public.app_sessions enable row level security;

create index if not exists app_sessions_opened_at_idx
  on public.app_sessions (opened_at desc);
create index if not exists app_sessions_terminal_idx
  on public.app_sessions (terminal_id, opened_at desc);
create index if not exists app_sessions_open_idx
  on public.app_sessions (last_seen_at) where closed_at is null;

comment on table public.app_sessions is
  'كل مرة ينفتح بيها البرنامج: وكت الفتح، الجهاز، الموظف، آخر نبضة، ووكت الغلق';

-- ------------------------------------------------------------
-- فتح جلسة
-- إذا اكو جلسة مفتوحة لنفس الجهاز ونبضتها حديثة (أقل من 15 دقيقة) نرجّعها
-- بدل ما نفتح جلسة جديدة — حتى إعادة إدخال الـPIN ما تحسب فتح جديد.
-- ------------------------------------------------------------
create or replace function public.app_session_start(
  p_terminal_id text,
  p_app_version text  default null,
  p_platform    text  default null,
  p_employee_id uuid  default null,
  p_meta        jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id       uuid;
  v_existing uuid;
  v_name     text;
begin
  if p_terminal_id is null or length(p_terminal_id) < 4 or length(p_terminal_id) > 100 then
    raise exception 'invalid terminal_id' using errcode = '22023';
  end if;

  if p_employee_id is not null then
    select coalesce(display_name, name) into v_name
    from public.employees where id = p_employee_id;
  end if;

  select id into v_existing
  from public.app_sessions
  where terminal_id = p_terminal_id
    and closed_at is null
    and last_seen_at > now() - interval '15 minutes'
  order by opened_at desc
  limit 1;

  if v_existing is not null then
    update public.app_sessions
       set last_seen_at   = now(),
           employee_id    = coalesce(p_employee_id, employee_id),
           employee_name  = coalesce(v_name, employee_name),
           app_version    = coalesce(left(p_app_version, 40), app_version),
           platform       = coalesce(left(p_platform, 60), platform)
     where id = v_existing;
    return v_existing;
  end if;

  -- جلسات قديمة مفتوحة لنفس الجهاز: البرنامج انطفأ بدون ما يبلغ
  update public.app_sessions
     set closed_at = last_seen_at, close_reason = 'timeout'
   where terminal_id = p_terminal_id and closed_at is null;

  insert into public.app_sessions
    (terminal_id, employee_id, employee_name, app_version, platform, meta)
  values
    (p_terminal_id, p_employee_id, v_name,
     left(p_app_version, 40), left(p_platform, 60),
     case when jsonb_typeof(p_meta) = 'object' and pg_column_size(p_meta) <= 2048
          then p_meta else '{}'::jsonb end)
  returning id into v_id;

  return v_id;
end;
$function$;

-- ------------------------------------------------------------
-- نبضة: البرنامج يناديها كل بضع دقائق حتى نعرف إنه لسه مفتوح
-- ------------------------------------------------------------
create or replace function public.app_session_ping(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_ok boolean;
begin
  update public.app_sessions
     set last_seen_at = now()
   where id = p_session_id and closed_at is null;

  v_ok := found;
  return jsonb_build_object('ok', v_ok, 'at', now());
end;
$function$;

-- ------------------------------------------------------------
-- ربط الموظف بالجلسة (بعد نجاح الـPIN مثلاً)
-- ------------------------------------------------------------
create or replace function public.app_session_set_employee(
  p_session_id  uuid,
  p_employee_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_name text;
begin
  select coalesce(display_name, name) into v_name
  from public.employees where id = p_employee_id;

  update public.app_sessions
     set employee_id   = p_employee_id,
         employee_name = v_name,
         last_seen_at  = now()
   where id = p_session_id and closed_at is null;

  return jsonb_build_object('ok', found, 'employee', v_name);
end;
$function$;

-- ------------------------------------------------------------
-- غلق الجلسة (عند إغلاق البرنامج أو تسجيل الخروج)
-- ------------------------------------------------------------
create or replace function public.app_session_end(
  p_session_id uuid,
  p_reason     text default 'normal'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_ok boolean;
begin
  update public.app_sessions
     set closed_at    = now(),
         last_seen_at = now(),
         close_reason = case when p_reason in ('normal','logout','timeout','crash')
                             then p_reason else 'normal' end
   where id = p_session_id and closed_at is null;

  v_ok := found;
  return jsonb_build_object('ok', v_ok, 'at', now());
end;
$function$;

-- ------------------------------------------------------------
-- تنظيف: جلسات ما وصلت منها نبضة من فترة تنغلق تلقائياً (cron)
-- ------------------------------------------------------------
create or replace function public.app_sessions_close_stale(p_minutes int default 15)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer;
begin
  update public.app_sessions
     set closed_at = last_seen_at, close_reason = 'timeout'
   where closed_at is null
     and last_seen_at < now() - make_interval(mins => greatest(coalesce(p_minutes, 15), 5));

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ------------------------------------------------------------
-- تقرير: فتحات البرنامج بآخر N يوم (بتوقيت بغداد)
-- ------------------------------------------------------------
create or replace function public.app_sessions_report(p_days int default 7)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  with s as (
    select *
    from public.app_sessions
    where opened_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
  ),
  d as (
    select (opened_at at time zone 'Asia/Baghdad')::date as day,
           count(*)                                       as opens,
           count(distinct terminal_id)                    as terminals,
           min(opened_at at time zone 'Asia/Baghdad')     as first_at,
           max(opened_at at time zone 'Asia/Baghdad')     as last_at,
           round(sum(extract(epoch from
                (coalesce(closed_at, last_seen_at) - opened_at))) / 60)::int as minutes
    from s group by 1
  )
  select jsonb_build_object(
    'days',       greatest(coalesce(p_days, 7), 1),
    'sessions',   (select count(*) from s),
    'terminals',  (select count(distinct terminal_id) from s),
    'last_open',  (select max(opened_at) from s),
    'by_day',     coalesce((
      select jsonb_agg(jsonb_build_object(
               'day',        to_char(day, 'YYYY-MM-DD'),
               'opens',      opens,
               'terminals',  terminals,
               'first_open', to_char(first_at, 'HH24:MI'),
               'last_open',  to_char(last_at,  'HH24:MI'),
               'minutes',    minutes
             ) order by day desc)
      from d), '[]'::jsonb),
    'by_employee', coalesce((
      select jsonb_agg(jsonb_build_object(
               'employee', coalesce(employee_name, 'غير معروف'),
               'opens',    opens
             ) order by opens desc)
      from (
        select employee_name, count(*) as opens
        from s group by employee_name
      ) e), '[]'::jsonb)
  );
$function$;

-- ------------------------------------------------------------
-- الصلاحيات: البرنامج يشتغل بمفتاح publishable (دور anon)
-- ------------------------------------------------------------
revoke all on function public.app_session_start(text,text,text,uuid,jsonb)  from public;
revoke all on function public.app_session_ping(uuid)                        from public;
revoke all on function public.app_session_set_employee(uuid,uuid)           from public;
revoke all on function public.app_session_end(uuid,text)                    from public;
revoke all on function public.app_sessions_close_stale(int)                 from public;
revoke all on function public.app_sessions_report(int)                      from public;

grant execute on function public.app_session_start(text,text,text,uuid,jsonb) to anon, authenticated;
grant execute on function public.app_session_ping(uuid)                       to anon, authenticated;
grant execute on function public.app_session_set_employee(uuid,uuid)          to anon, authenticated;
grant execute on function public.app_session_end(uuid,text)                   to anon, authenticated;
grant execute on function public.app_sessions_close_stale(int)                to service_role;
grant execute on function public.app_sessions_report(int)                     to service_role;
