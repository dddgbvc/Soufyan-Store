-- ============================================================
-- معلومات الجهاز بجلسات البرنامج
--
-- شنو يمكن التقاطه من طرف السيرفر بدون أي تعديل بالبرنامج:
--   ✓ IP العام      — من ترويسة cf-connecting-ip اللي يمررها PostgREST
--   ✓ User-Agent    — منه نستنتج النظام ونسخة البرنامج و Electron
--   ✓ الدولة        — من ترويسة cf-ipcountry
--
-- شنو ما يمكن التقاطه من السيرفر أبداً:
--   ✗ MAC           — ما يطلع خارج الشبكة المحلية، ما يوصل لـSupabase إطلاقاً
--   ✗ اسم الجهاز    — ما موجود بأي ترويسة
--   ✗ IP المحلي     — نفس الشي
-- هذولا لازم البرنامج نفسه يرسلهم (p_mac, p_device_name, p_local_ip).
-- ============================================================

alter table public.app_sessions
  add column if not exists ip          inet,
  add column if not exists user_agent  text,
  add column if not exists country     text,
  add column if not exists device_name text,
  add column if not exists os          text,
  add column if not exists mac         macaddr,
  add column if not exists local_ip    inet;

comment on column public.app_sessions.ip is 'IP العام — يُلتقط تلقائياً من ترويسات الطلب';
comment on column public.app_sessions.mac is 'MAC — لازم البرنامج يرسله، مستحيل التقاطه من السيرفر';

create index if not exists app_sessions_ip_idx  on public.app_sessions (ip);
create index if not exists app_sessions_mac_idx on public.app_sessions (mac);

-- ------------------------------------------------------------
-- قراءة سياق الطلب (IP + User-Agent + الدولة) من ترويسات PostgREST
-- ترجع قيم فارغة إذا انندت من خارج REST (مثلاً من SQL editor أو cron)
-- ------------------------------------------------------------
create or replace function public.request_client_info()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  h    jsonb;
  v_ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;

  if h is null then
    return '{}'::jsonb;
  end if;

  v_ip := coalesce(
    nullif(h->>'cf-connecting-ip', ''),
    nullif(h->>'x-real-ip', ''),
    nullif(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), '')
  );

  return jsonb_build_object(
    'ip',         v_ip,
    'user_agent', left(nullif(h->>'user-agent', ''), 400),
    'country',    nullif(h->>'cf-ipcountry', '')
  );
end;
$function$;

revoke all on function public.request_client_info() from public;

-- ------------------------------------------------------------
-- app_session_start بنسخة تلتقط معلومات الجهاز
-- النسخة القديمة تنحذف حتى ما يصير تعارض بالتحميل الزائد (overload)
-- ------------------------------------------------------------
drop function if exists public.app_session_start(text, text, text, uuid, jsonb);

create or replace function public.app_session_start(
  p_terminal_id text,
  p_app_version text  default null,
  p_platform    text  default null,
  p_employee_id uuid  default null,
  p_meta        jsonb default '{}'::jsonb,
  p_device_name text  default null,
  p_os          text  default null,
  p_mac         text  default null,
  p_local_ip    text  default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id       uuid;
  v_existing uuid;
  v_name     text;
  v_ctx      jsonb;
  v_ip       inet;
  v_local_ip inet;
  v_mac      macaddr;
  v_ua       text;
  v_country  text;
  v_os       text;
begin
  if p_terminal_id is null or length(p_terminal_id) < 4 or length(p_terminal_id) > 100 then
    raise exception 'invalid terminal_id' using errcode = '22023';
  end if;

  if p_employee_id is not null then
    select coalesce(display_name, name) into v_name
    from public.employees where id = p_employee_id;
  end if;

  -- ما يوصل من الترويسات
  v_ctx     := public.request_client_info();
  v_ua      := v_ctx->>'user_agent';
  v_country := left(v_ctx->>'country', 4);

  begin v_ip := nullif(v_ctx->>'ip', '')::inet; exception when others then v_ip := null; end;

  -- ما يرسله البرنامج
  begin v_local_ip := nullif(p_local_ip, '')::inet; exception when others then v_local_ip := null; end;
  begin v_mac      := nullif(p_mac, '')::macaddr;  exception when others then v_mac      := null; end;

  v_os := coalesce(
    left(p_os, 60),
    case
      when v_ua ilike '%windows nt 10.0%' then 'Windows 10/11'
      when v_ua ilike '%windows%'         then 'Windows'
      when v_ua ilike '%mac os x%'        then 'macOS'
      when v_ua ilike '%android%'         then 'Android'
      when v_ua ilike '%iphone%'
        or v_ua ilike '%ipad%'            then 'iOS'
      when v_ua ilike '%linux%'           then 'Linux'
    end);

  select id into v_existing
  from public.app_sessions
  where terminal_id = p_terminal_id
    and closed_at is null
    and last_seen_at > now() - interval '15 minutes'
  order by opened_at desc
  limit 1;

  if v_existing is not null then
    update public.app_sessions
       set last_seen_at  = now(),
           employee_id   = coalesce(p_employee_id, employee_id),
           employee_name = coalesce(v_name, employee_name),
           app_version   = coalesce(left(p_app_version, 40), app_version),
           platform      = coalesce(left(p_platform, 60), platform),
           ip            = coalesce(v_ip, ip),
           user_agent    = coalesce(v_ua, user_agent),
           country       = coalesce(v_country, country),
           device_name   = coalesce(left(p_device_name, 80), device_name),
           os            = coalesce(v_os, os),
           mac           = coalesce(v_mac, mac),
           local_ip      = coalesce(v_local_ip, local_ip)
     where id = v_existing;
    return v_existing;
  end if;

  update public.app_sessions
     set closed_at = last_seen_at, close_reason = 'timeout'
   where terminal_id = p_terminal_id and closed_at is null;

  insert into public.app_sessions
    (terminal_id, employee_id, employee_name, app_version, platform, meta,
     ip, user_agent, country, device_name, os, mac, local_ip)
  values
    (p_terminal_id, p_employee_id, v_name,
     left(p_app_version, 40), left(p_platform, 60),
     case when jsonb_typeof(p_meta) = 'object' and pg_column_size(p_meta) <= 2048
          then p_meta else '{}'::jsonb end,
     v_ip, v_ua, v_country, left(p_device_name, 80), v_os, v_mac, v_local_ip)
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function
  public.app_session_start(text,text,text,uuid,jsonb,text,text,text,text) from public;
grant execute on function
  public.app_session_start(text,text,text,uuid,jsonb,text,text,text,text) to anon, authenticated;

-- ------------------------------------------------------------
-- النبضة تحدّث الـIP هم — حتى ينمسك تغيّر الشبكة وسط الجلسة
-- ------------------------------------------------------------
create or replace function public.app_session_ping(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ok boolean;
  v_ip inet;
begin
  begin
    v_ip := nullif(public.request_client_info()->>'ip', '')::inet;
  exception when others then
    v_ip := null;
  end;

  update public.app_sessions
     set last_seen_at = now(),
         ip           = coalesce(v_ip, ip)
   where id = p_session_id and closed_at is null;

  v_ok := found;
  return jsonb_build_object('ok', v_ok, 'at', now());
end;
$function$;

-- ------------------------------------------------------------
-- تقرير الأجهزة: منو فتح، من أي جهاز وIP، وآخر مرة
-- ------------------------------------------------------------
create or replace function public.app_sessions_devices(p_days int default 30)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'terminal_id', terminal_id,
           'device_name', device_name,
           'os',          os,
           'ip',          host(ip),
           'local_ip',    host(local_ip),
           'mac',         mac,
           'country',     country,
           'app_version', app_version,
           'employees',   employees,
           'opens',       opens,
           'last_open',   to_char(last_open at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI')
         ) order by last_open desc), '[]'::jsonb)
  from (
    select terminal_id,
           max(device_name) as device_name,
           max(os)          as os,
           max(ip)          as ip,
           max(local_ip)    as local_ip,
           max(mac::text)   as mac,   -- macaddr ماكو له max()، فنجمعه كنص
           max(country)     as country,
           max(app_version) as app_version,
           count(*)         as opens,
           max(opened_at)   as last_open,
           array_remove(array_agg(distinct employee_name), null) as employees
    from public.app_sessions
    where opened_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
    group by terminal_id
  ) d;
$function$;

revoke all on function public.app_sessions_devices(int) from public;
grant execute on function public.app_sessions_devices(int) to service_role;
