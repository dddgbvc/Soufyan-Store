-- ===========================================================================
-- ISP Engine — 003 — الدوال
-- ===========================================================================
-- نمط قسم الشراء: تسجيل دخول بالرمز السري ← رمز جلسة ← كل دالة تتحقق عبر
-- isp_guard(token, min_role). كل الدوال SECURITY DEFINER مع search_path ثابت.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- الأدوار والإعدادات
-- --------------------------------------------------------------------------

create or replace function public.isp_role_rank(p_role text)
returns integer
language sql
immutable
set search_path to 'public'
as $function$
  select case p_role when 'ADMIN' then 3 when 'MANAGER' then 2 when 'CASHIER' then 1 else 0 end;
$function$;

create or replace function public.isp_setting(p_key text, p_default jsonb default null)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce((select value from public.isp_settings where key = p_key), p_default);
$function$;

-- --------------------------------------------------------------------------
-- التدقيق
-- --------------------------------------------------------------------------

create or replace function public.isp_log(
  p_session       public.isp_module_sessions,
  p_action        text,
  p_provider_id   uuid default null,
  p_table         text default null,
  p_ref           uuid default null,
  p_previous      jsonb default null,
  p_new           jsonb default null,
  p_result        text default 'ok',
  p_detail        jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.isp_audit (
    actor, employee_id, role, terminal_id, ip,
    action, provider_id, ref_table, ref_id,
    previous_state, new_state, result, detail)
  values (
    p_session.employee_name, p_session.employee_id, p_session.role,
    p_session.terminal_id, p_session.ip,
    p_action, p_provider_id, p_table, p_ref,
    -- تنظيف الأسرار قبل الكتابة، بنفس دالة النظام المستخدمة في activity_log.
    public.scrub_secrets(p_previous), public.scrub_secrets(p_new),
    p_result, public.scrub_secrets(coalesce(p_detail, '{}'::jsonb)));
$function$;

-- --------------------------------------------------------------------------
-- الجلسة: دخول / حراسة / خروج
-- --------------------------------------------------------------------------

create or replace function public.isp_sessions_gc()
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  with gone as (
    delete from public.isp_module_sessions
     where expires_at < now() - interval '1 day' or revoked
    returning 1)
  select count(*)::int from gone;
$function$;

create or replace function public.isp_login(p_pin_hash text, p_terminal_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_emp   public.employees%rowtype;
  v_token text;
  v_ttl   int;
  v_info  jsonb;
  v_term  text;
  v_ip    inet;
  v_ua    text;
begin
  v_term := left(coalesce(nullif(btrim(p_terminal_id), ''), 'unknown'), 80);

  v_info := public.request_client_info();
  begin v_ip := nullif(v_info->>'ip', '')::inet; exception when others then v_ip := null; end;
  v_ua := left(v_info->>'user_agent', 400);

  if p_pin_hash is null or length(p_pin_hash) < 32 or length(p_pin_hash) > 128
     or p_pin_hash !~ '^[0-9a-fA-F]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'message', 'رمز غير صالح');
  end if;

  -- نفس عدّاد المحاولات المشترك مع بقية النظام.
  if public.pin_attempts_blocked(v_term, v_ip) then
    perform public.log_security_event('isp_login', 'blocked', null, v_term,
      jsonb_build_object('reason', 'rate_limited'));
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', 120,
                              'message', 'محاولات كثيرة — انتظر شوية');
  end if;

  v_emp := public.employee_by_pin(p_pin_hash);

  if v_emp.id is null then
    insert into public.pin_attempts (terminal_id, ok, ip, user_agent)
    values (v_term, false, v_ip, v_ua);
    perform public.log_security_event('isp_login', 'failed', null, v_term, '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'wrong', 'message', 'الرمز غير صحيح');
  end if;

  -- وحدة الإنترنت متاحة للكاشير فما فوق: البيع اليومي يحتاجها.
  if public.isp_role_rank(v_emp.role) < 1 then
    insert into public.pin_attempts (terminal_id, ok, ip, user_agent)
    values (v_term, true, v_ip, v_ua);
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
                              'message', 'ليس لديك صلاحية لوحدة الإنترنت');
  end if;

  insert into public.pin_attempts (terminal_id, ok, ip, user_agent)
  values (v_term, true, v_ip, v_ua);
  perform public.isp_sessions_gc();

  v_ttl := greatest(1, least(24,
    coalesce((public.isp_setting('session_ttl_hours','8'::jsonb) #>> '{}')::int, 8)));
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.isp_module_sessions
    (token, employee_id, employee_name, role, terminal_id, ip, user_agent, expires_at)
  values
    (v_token, v_emp.id, coalesce(v_emp.display_name, v_emp.name), v_emp.role, v_term,
     v_ip, v_ua, now() + make_interval(hours => v_ttl));

  perform public.isp_log(
    (select s from public.isp_module_sessions s where s.token = v_token),
    'login', null, 'employees', v_emp.id, null, null, 'ok',
    jsonb_build_object('terminal', v_term));

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
    'can_mutate',   public.isp_role_rank(v_emp.role) >= 1,
    'can_settings', v_emp.role = 'ADMIN');
end;
$function$;

create or replace function public.isp_guard(p_token text, p_min_role text default 'CASHIER')
returns public.isp_module_sessions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_s public.isp_module_sessions;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]+$' then
    raise exception 'انتهت الجلسة — سجّل الدخول من جديد' using errcode = '28000';
  end if;

  select * into v_s from public.isp_module_sessions where token = p_token;

  if not found or v_s.revoked or v_s.expires_at <= now() then
    raise exception 'انتهت الجلسة — سجّل الدخول من جديد' using errcode = '28000';
  end if;

  if public.isp_role_rank(v_s.role) < public.isp_role_rank(p_min_role) then
    raise exception 'ليس لديك صلاحية لهذا الإجراء' using errcode = '42501';
  end if;

  if not exists (select 1 from public.employees
                 where id = v_s.employee_id and status = 'active') then
    update public.isp_module_sessions set revoked = true where token = p_token;
    raise exception 'الحساب موقوف' using errcode = '28000';
  end if;

  update public.isp_module_sessions set last_seen_at = now() where token = p_token;

  -- يربط سجل activity_log العام بمن ينفّذ داخل هذه الوحدة.
  perform public.audit_set_actor(jsonb_build_object(
    'source',      'وحدة الإنترنت',
    'actor',       v_s.employee_name,
    'employee_id', v_s.employee_id,
    'terminal_id', v_s.terminal_id));

  return v_s;
end;
$function$;

create or replace function public.isp_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.isp_module_sessions set revoked = true where token = p_token;
  return jsonb_build_object('ok', true);
end;
$function$;

-- --------------------------------------------------------------------------
-- اكتشاف القدرات (§43)
-- --------------------------------------------------------------------------

create or replace function public.isp_capabilities_sync(
  p_token text, p_provider_id uuid, p_manifest jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s   public.isp_module_sessions;
  v_key text;
  v_val jsonb;
  v_n   int := 0;
begin
  v_s := public.isp_guard(p_token, 'MANAGER');

  if jsonb_typeof(p_manifest) <> 'object' then
    raise exception 'بيان القدرات غير صالح' using errcode = '22023';
  end if;

  for v_key, v_val in select * from jsonb_each(p_manifest)
  loop
    insert into public.isp_provider_capabilities
      (provider_id, capability, state, note, detail, discovered_at)
    values (
      p_provider_id, v_key,
      coalesce(v_val->>'state', 'unknown'),
      v_val->>'note',
      coalesce(v_val->'detail', '{}'::jsonb),
      now())
    on conflict (provider_id, capability) do update
      set state = excluded.state,
          note = excluded.note,
          detail = excluded.detail,
          discovered_at = excluded.discovered_at;
    v_n := v_n + 1;
  end loop;

  perform public.isp_log(v_s, 'capabilities_sync', p_provider_id,
    'isp_provider_capabilities', p_provider_id, null, null, 'ok',
    jsonb_build_object('count', v_n));

  return jsonb_build_object('ok', true, 'count', v_n);
end;
$function$;

create or replace function public.isp_bootstrap(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s public.isp_module_sessions;
begin
  v_s := public.isp_guard(p_token, 'CASHIER');

  return jsonb_build_object(
    'ok', true,
    'employee', jsonb_build_object(
      'id', v_s.employee_id, 'name', v_s.employee_name, 'role', v_s.role),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'adapter_key', p.adapter_key,
        'display_name', p.display_name,
        'logo_url', p.logo_url,
        'accent_color', p.accent_color,
        'currency', p.currency,
        'status', p.status,
        'api_version', p.api_version,
        'capabilities', coalesce((
          select jsonb_object_agg(c.capability,
                   jsonb_build_object('state', c.state, 'note', c.note, 'detail', c.detail))
            from public.isp_provider_capabilities c
           where c.provider_id = p.id), '{}'::jsonb),
        'connection', (
          select jsonb_build_object(
            'status', k.status, 'health_status', k.health_status,
            'environment', k.environment,
            'last_sync_at', k.last_sync_at, 'last_success_at', k.last_success_at,
            'last_error_at', k.last_error_at, 'last_error_reason', k.last_error_reason,
            'latency_ms', k.latency_ms)
            from public.isp_provider_connections k
           where k.provider_id = p.id
           order by k.created_at limit 1)
      ) order by p.display_name)
      from public.isp_providers p), '[]'::jsonb),
    'settings', coalesce((
      select jsonb_object_agg(key, value) from public.isp_settings), '{}'::jsonb));
end;
$function$;

-- --------------------------------------------------------------------------
-- التكرار (idempotency) — أساس سلامة العمليات المالية
-- --------------------------------------------------------------------------

-- يحجز المفتاح ويعيد 'acquired'، أو يعيد النتيجة السابقة إن كان محجوزاً.
-- هذه هي النقطة التي تمنع خصم رصيد المحفظة مرتين عند ضغط زر التجديد مرتين.
create or replace function public.isp_idempotency_begin(
  p_token text, p_provider_id uuid, p_key text, p_operation text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row      public.isp_idempotency;
  v_inserted int;
begin
  perform public.isp_guard(p_token, 'CASHIER');

  if p_key is null or length(p_key) < 8 or length(p_key) > 128 then
    raise exception 'مفتاح العملية غير صالح' using errcode = '22023';
  end if;

  insert into public.isp_idempotency (key, provider_id, operation)
  values (p_key, p_provider_id, p_operation)
  on conflict (key) do nothing;

  get diagnostics v_inserted = row_count;

  -- نحن من حجز المفتاح ⇒ لنا حق التنفيذ.
  if v_inserted = 1 then
    return jsonb_build_object('ok', true, 'status', 'acquired');
  end if;

  select * into v_row from public.isp_idempotency where key = p_key;

  if not found then
    -- سباق نادر: حُذف الصف بين الإدراج والقراءة.
    raise exception 'تعذر حجز مفتاح العملية' using errcode = '40001';
  end if;

  -- المفتاح مكتمل ⇒ أعِد النتيجة الأصلية حرفياً بدل تنفيذها ثانية.
  if v_row.completed_at is not null then
    return jsonb_build_object('ok', true, 'status', 'replayed',
                              'state', v_row.state, 'result', v_row.result);
  end if;

  -- محجوز ولم يكتمل ⇒ نسخة أخرى من الطلب قيد التنفيذ الآن.
  return jsonb_build_object('ok', true, 'status', 'in_flight', 'state', v_row.state);
end;
$function$;

create or replace function public.isp_idempotency_finish(
  p_token text, p_key text, p_state text, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.isp_guard(p_token, 'CASHIER');

  if p_state not in ('SUCCESS','FAILED','REQUIRES_RECONCILIATION') then
    raise exception 'حالة غير صالحة' using errcode = '22023';
  end if;

  update public.isp_idempotency
     set state = p_state,
         result = public.scrub_secrets(p_result),
         completed_at = now()
   where key = p_key;

  return jsonb_build_object('ok', true);
end;
$function$;
