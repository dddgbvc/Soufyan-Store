-- ============================================================================
-- إصلاحات أمنية (٢/٢) — الجلسات وحدّ محاولات الرمز وصلاحية ضبط الرموز
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 4) app_session_start — لا تثق بمعرّف الموظف الجاي من العميل
-- ---------------------------------------------------------------------------
-- كان أي عميل يكدر يفتح جلسة باسم أي موظف، فيتلوّث سجل الحركات (activity_log)
-- بمنفّذ مزوّر. الآن يُقبل p_employee_id فقط إذا كان النداء جاي من
-- verify_employee_pin بعد تحقق ناجح من الرمز — تُعلَّم بمتغيّر محلي للمعاملة
-- ما يكدر عميل PostgREST يضبطه.
create or replace function public.app_session_start(
  p_terminal_id text,
  p_app_version text DEFAULT NULL::text,
  p_platform    text DEFAULT NULL::text,
  p_employee_id uuid DEFAULT NULL::uuid,
  p_meta        jsonb DEFAULT '{}'::jsonb,
  p_device_name text DEFAULT NULL::text,
  p_os          text DEFAULT NULL::text,
  p_mac         text DEFAULT NULL::text,
  p_local_ip    text DEFAULT NULL::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id       uuid;
  v_existing uuid;
  v_emp_id   uuid := null;
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

  -- ربط الموظف لا يُقبل إلا بعد تحقق ناجح من الرمز داخل نفس المعاملة.
  if p_employee_id is not null
     and coalesce(current_setting('app.pin_verified', true), '') = 'on' then
    select id, coalesce(display_name, name) into v_emp_id, v_name
    from public.employees where id = p_employee_id and status = 'active';
  end if;

  v_ctx     := public.request_client_info();
  v_ua      := v_ctx->>'user_agent';
  v_country := left(v_ctx->>'country', 4);

  begin v_ip := nullif(v_ctx->>'ip', '')::inet; exception when others then v_ip := null; end;

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
           employee_id   = coalesce(v_emp_id, employee_id),
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
    (p_terminal_id, v_emp_id, v_name,
     left(p_app_version, 40), left(p_platform, 60),
     case when jsonb_typeof(p_meta) = 'object' and pg_column_size(p_meta) <= 2048
          then p_meta else '{}'::jsonb end,
     v_ip, v_ua, v_country, left(p_device_name, 80), v_os, v_mac, v_local_ip)
  returning id into v_id;

  return v_id;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 5) حدّ محاولات الرمز — لا يعتمد على قيمة يرسلها العميل وحدها
-- ---------------------------------------------------------------------------
-- كان العدّ على terminal_id فقط، وهو يجي من العميل: يكفي المهاجم يبدّله كل
-- محاولة ليجرّب بلا حدود. الآن نعدّ كذلك على الـ IP اللي يشوفه الخادم نفسه،
-- ونسجّل الـ IP بكل محاولة.
create or replace function public.pin_attempts_blocked(p_terminal_id text, p_ip inet)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    (select count(*) from public.pin_attempts
      where terminal_id = p_terminal_id
        and ok = false
        and at > now() - interval '2 minutes') >= 5
    or
    (p_ip is not null and
     (select count(*) from public.pin_attempts
       where ip = p_ip
         and ok = false
         and at > now() - interval '10 minutes') >= 10);
$function$;


create or replace function public.verify_employee_pin(p_pin_hash text, p_terminal_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_emp        public.employees%rowtype;
  v_session_id uuid;
  v_term       text;
  v_info       jsonb;
  v_ip         inet;
  v_ua         text;
begin
  v_term := left(coalesce(nullif(btrim(p_terminal_id), ''), 'unknown'), 80);

  v_info := public.request_client_info();
  begin v_ip := nullif(v_info->>'ip', '')::inet; exception when others then v_ip := null; end;
  v_ua := left(v_info->>'user_agent', 400);

  if p_pin_hash is null or length(p_pin_hash) < 32 or length(p_pin_hash) > 128
     or p_pin_hash !~ '^[0-9a-fA-F]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if public.pin_attempts_blocked(v_term, v_ip) then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', 120);
  end if;

  select * into v_emp
  from public.employees
  where pin_hash = p_pin_hash and status = 'active'
  limit 1;

  if not found then
    insert into public.pin_attempts (terminal_id, ok, ip, user_agent)
    values (v_term, false, v_ip, v_ua);
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;

  insert into public.pin_attempts (terminal_id, ok, ip, user_agent)
  values (v_term, true, v_ip, v_ua);

  begin
    -- العلامة تسمح لـ app_session_start بربط الموظف بالجلسة. محلية للمعاملة
    -- ولا يكدر عميل PostgREST يضبطها.
    perform set_config('app.pin_verified', 'on', true);
    v_session_id := public.app_session_start(
      p_terminal_id  => v_term,
      p_employee_id  => v_emp.id,
      p_meta         => jsonb_build_object('source', 'pin')
    );
    perform set_config('app.pin_verified', '', true);
  exception when others then
    perform set_config('app.pin_verified', '', true);
    v_session_id := null;
  end;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'employee', jsonb_build_object(
      'id',         v_emp.id,
      'name',       coalesce(v_emp.display_name, v_emp.name),
      'role',       v_emp.role,
      'department', v_emp.department,
      'avatar_url', v_emp.avatar_url
    ),
    'permissions', to_jsonb(public.permissions_for(v_emp.role))
  );
end;
$function$;


create or replace function public.purchase_login(p_pin_hash text, p_terminal_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_emp    public.employees%rowtype;
  v_token  text;
  v_ttl    int;
  v_info   jsonb;
  v_term   text;
  v_ip     inet;
  v_ua     text;
begin
  v_term := left(coalesce(nullif(btrim(p_terminal_id), ''), 'unknown'), 80);

  v_info := public.request_client_info();
  begin v_ip := nullif(v_info->>'ip', '')::inet; exception when others then v_ip := null; end;
  v_ua := left(v_info->>'user_agent', 400);

  if p_pin_hash is null or length(p_pin_hash) < 32 or length(p_pin_hash) > 128
     or p_pin_hash !~ '^[0-9a-fA-F]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'message', 'رمز غير صالح');
  end if;

  if public.pin_attempts_blocked(v_term, v_ip) then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', 120,
                              'message', 'محاولات كثيرة — انتظر شوية');
  end if;

  select * into v_emp
  from public.employees
  where pin_hash = p_pin_hash and status = 'active'
  limit 1;

  if not found then
    insert into public.pin_attempts (terminal_id, ok, ip, user_agent)
    values (v_term, false, v_ip, v_ua);
    return jsonb_build_object('ok', false, 'reason', 'wrong',
                              'message', 'الرمز غير صحيح');
  end if;

  if public.purchase_role_rank(v_emp.role) < 2 then
    insert into public.pin_attempts (terminal_id, ok, ip, user_agent)
    values (v_term, true, v_ip, v_ua);
    insert into public.purchase_audit
      (actor, employee_id, role, terminal_id, action, ref_table, ref_id, detail)
    values (coalesce(v_emp.display_name, v_emp.name), v_emp.id, v_emp.role, v_term,
            'login_denied', 'employees', v_emp.id, jsonb_build_object('role', v_emp.role));
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
                              'message', 'قسم الشراء متاح للمدير فقط');
  end if;

  insert into public.pin_attempts (terminal_id, ok, ip, user_agent)
  values (v_term, true, v_ip, v_ua);
  perform public.purchase_sessions_gc();

  v_ttl   := greatest(1, least(24, coalesce((public.purchase_setting('session_ttl_hours','8'::jsonb) #>> '{}')::int, 8)));
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.purchase_sessions
    (token, employee_id, employee_name, role, terminal_id, ip, user_agent, expires_at)
  values
    (v_token, v_emp.id, coalesce(v_emp.display_name, v_emp.name), v_emp.role, v_term,
     v_ip, v_ua, now() + make_interval(hours => v_ttl));

  perform public.purchase_log(
    (select s from public.purchase_sessions s where s.token = v_token),
    'login', 'employees', v_emp.id, jsonb_build_object('terminal', v_term));

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', now() + make_interval(hours => v_ttl),
    'employee', jsonb_build_object(
      'id', v_emp.id,
      'name', coalesce(v_emp.display_name, v_emp.name),
      'role', v_emp.role,
      'department', v_emp.department,
      'avatar_url', v_emp.avatar_url),
    'can_cancel',   public.purchase_role_rank(v_emp.role) >= 2,
    'can_settings', v_emp.role = 'ADMIN'
  );
end;
$function$;


-- ---------------------------------------------------------------------------
-- 6) set_employee_pin — تصعيد صلاحيات
-- ---------------------------------------------------------------------------
-- كان الفحص الوحيد `auth.uid() is not null`: أي مستخدم مسجّل يكدر يضبط رمز أي
-- موظف — بضمنهم ADMIN — وبعدين يدخل قسم الشراء بصلاحيته. الآن للمدير العام فقط.
create or replace function public.set_employee_pin(p_employee_id uuid, p_pin_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  if not exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'ADMIN' and status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_pin_hash is null or length(p_pin_hash) < 32 or length(p_pin_hash) > 128
     or p_pin_hash !~ '^[0-9a-fA-F]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if exists (select 1 from public.employees
             where pin_hash = p_pin_hash and id <> p_employee_id) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;

  update public.employees
     set pin_hash = p_pin_hash, pin_updated_at = now()
   where id = p_employee_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;


-- ---------------------------------------------------------------------------
-- 7) تثبيت search_path على الدوال اللي كانت متغيّرة
-- ---------------------------------------------------------------------------
alter function public."بغداد"(timestamp with time zone)     set search_path = public;
alter function public."بغداد_يوم"(timestamp with time zone) set search_path = public;
