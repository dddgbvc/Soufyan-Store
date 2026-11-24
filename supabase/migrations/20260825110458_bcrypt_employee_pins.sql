-- ============================================================================
-- الرموز السرية: من مقارنة مساواة إلى bcrypt
-- ----------------------------------------------------------------------------
-- كان `where pin_hash = p_pin_hash` مقارنة مساواة مباشرة، يعني القيمة المخزونة
-- هي نفسها ورقة الاعتماد: من يحصل على تفريغ للقاعدة يدخل بحساب أي موظف.
-- الآن تُخزن ببصمة bcrypt بملح لكل موظف، فتفريغ القاعدة ما ينفع لإعادة اللعب.
--
-- ٠ من ٤ موظفين عندهم رمز حالياً، فماكو بيانات تحتاج ترحيل. أي قيمة قديمة
-- بصيغة غير bcrypt ما راح تطابق — يفشل مغلقاً، وهذا المطلوب.
--
-- ملاحظة على القياس: كل صف بملح مختلف، فالمطابقة مسح على الموظفين النشطين
-- بدل بحث مفهرس. بكلفة 10 هذا ~100ms للصف. مناسب لعدد موظفي المحل؛ إذا كبر
-- العدد كثيراً لازم تنضاف قيمة بحث مشتقة (HMAC ثابت) للتضييق قبل bcrypt.
-- ============================================================================

-- يرجّع الموظف إذا طابق الرمز. مسح على الموظفين النشطين لأن كل صف بملح مختلف.
create or replace function public.employee_by_pin(p_pin_hash text)
returns public.employees
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_emp public.employees%rowtype;
begin
  if p_pin_hash is null or length(p_pin_hash) < 32 or length(p_pin_hash) > 128
     or p_pin_hash !~ '^[0-9a-fA-F]+$' then
    return null;
  end if;

  select * into v_emp
  from public.employees
  where status = 'active'
    and pin_hash is not null
    and pin_hash like '$2%'                          -- bcrypt فقط
    and pin_hash = extensions.crypt(p_pin_hash, pin_hash)
  limit 1;

  return v_emp;
end;
$function$;


create or replace function public.verify_employee_pin(p_pin_hash text, p_terminal_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
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

  v_emp := public.employee_by_pin(p_pin_hash);

  if v_emp.id is null then
    insert into public.pin_attempts (terminal_id, ok, ip, user_agent)
    values (v_term, false, v_ip, v_ua);
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;

  insert into public.pin_attempts (terminal_id, ok, ip, user_agent)
  values (v_term, true, v_ip, v_ua);

  begin
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

  v_emp := public.employee_by_pin(p_pin_hash);

  if v_emp.id is null then
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


-- الضبط: يخزن بصمة bcrypt، والتفرّد يُفحص بمسح لأن الملح مختلف لكل صف.
create or replace function public.set_employee_pin(p_employee_id uuid, p_pin_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_taken uuid;
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

  select id into v_taken
  from public.employees
  where id <> p_employee_id
    and pin_hash is not null
    and pin_hash like '$2%'
    and pin_hash = extensions.crypt(p_pin_hash, pin_hash)
  limit 1;

  if v_taken is not null then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;

  update public.employees
     set pin_hash       = extensions.crypt(p_pin_hash, extensions.gen_salt('bf', 10)),
         pin_updated_at = now()
   where id = p_employee_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;


create or replace function public.set_my_pin(p_pin_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_taken uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  if p_pin_hash is null or length(p_pin_hash) < 32 or length(p_pin_hash) > 128
     or p_pin_hash !~ '^[0-9a-fA-F]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select id into v_taken
  from public.profiles
  where id <> auth.uid()
    and pin_hash is not null
    and pin_hash like '$2%'
    and pin_hash = extensions.crypt(p_pin_hash, pin_hash)
  limit 1;

  if v_taken is not null then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;

  update public.profiles
     set pin_hash       = extensions.crypt(p_pin_hash, extensions.gen_salt('bf', 10)),
         pin_updated_at = now()
   where id = auth.uid();

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.employee_by_pin(text) from public, anon, authenticated;
grant execute on function public.employee_by_pin(text) to service_role;
