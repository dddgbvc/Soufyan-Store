-- ياقوت ويب: دخول بحساب المحل ثم PIN يحدد الموظف
-- ------------------------------------------------------------------
-- 1) حساب المحل (مالك ADMIN في Supabase Auth) يفعّل المتصفح مرة واحدة:
--    يُسجَّل "جهاز محل" يحمل بصمة sha256 لسرّ عشوائي محفوظ في كوكي httpOnly.
-- 2) أي موظف نشط في نفس المحل يدخل برمز PIN فقط؛ الرمز يحدد هويته.
-- 3) الجلسة الناتجة app_sessions بطرفية web:<id> تعمل مع كل دوال web_*_list
--    الموجودة لأن web_guard صار يقبل أجهزة المحل بجانب الأجهزة المربوطة بموظف.
-- إضافة فقط: لا تُحذف بيانات، ولا يتغير سلوك أجهزة web_devices الحالية.

create table if not exists public.web_store_devices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id),
  secret_hash    text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  label          text not null default '',
  user_agent     text not null default '',
  owner_uid      uuid not null,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  revoked_at     timestamptz,
  revoked_reason text
);
comment on table public.web_store_devices is
  'متصفحات فُعّلت بحساب المحل — بصمة السرّ فقط. أي موظف نشط بالمحل يدخل منها برمز PIN.';
create index if not exists web_store_devices_tenant_active_idx
  on public.web_store_devices (tenant_id) where revoked_at is null;

alter table public.web_store_devices enable row level security;
revoke all on public.web_store_devices from public, anon, authenticated;

drop trigger if exists trg_prevent_tenant_id_change on public.web_store_devices;
create trigger trg_prevent_tenant_id_change
  before update on public.web_store_devices
  for each row execute function public.prevent_tenant_id_change_trigger();

-- ------------------------------------------------------------------
-- المحل الذي يملكه حساب Auth: موظف ADMIN نشط مربوط بالحساب، أو ملف ADMIN نشط.
create or replace function public.web_store_owner_tenant(p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select e.tenant_id
       from public.employees e
       join public.tenants t on t.id = e.tenant_id and t.status = 'active'
      where e.user_id = p_uid and e.status = 'active' and upper(e.role) = 'ADMIN'
      order by e.created_at
      limit 1),
    (select p.tenant_id
       from public.profiles p
       join public.tenants t on t.id = p.tenant_id and t.status = 'active'
      where p.id = p_uid and lower(coalesce(p.status, 'active')) = 'active'
        and upper(coalesce(p.role, '')) = 'ADMIN'
      limit 1));
$$;

-- ------------------------------------------------------------------
-- تفعيل المتصفح بحساب المحل. يُستدعى برمز المستخدم (authenticated) لأن auth.uid() هو الإثبات.
create or replace function public.web_store_device_register(
  p_secret_hash text,
  p_label       text default '',
  p_user_agent  text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_id     uuid;
  v_store  text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  v_tenant := public.web_store_owner_tenant(v_uid);
  if v_tenant is null then
    perform public.log_security_event('web.store.register', 'blocked', null, null,
      jsonb_build_object('reason', 'not_owner'));
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;
  perform set_config('app.tenant_id', v_tenant::text, true);

  insert into public.web_store_devices (tenant_id, secret_hash, label, user_agent, owner_uid)
  values (v_tenant, p_secret_hash, left(coalesce(p_label, ''), 80),
          left(coalesce(p_user_agent, ''), 400), v_uid)
  returning id into v_id;

  perform public.log_security_event('web.store.register', 'ok', null, 'web:' || v_id,
    jsonb_build_object('device_id', v_id));

  select name into v_store from public.tenants where id = v_tenant;
  return jsonb_build_object('ok', true, 'device_id', v_id, 'store_name', v_store);
end
$$;

-- ------------------------------------------------------------------
-- فتح جلسة موظف من متصفح محل مفعّل: PIN وحده يحدد الموظف داخل نفس المحل.
create or replace function public.web_store_pin_open(
  p_secret_hash text,
  p_pin         text,
  p_ip          text default null,
  p_user_agent  text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions', 'pg_temp'
as $$
declare
  v_dev   public.web_store_devices;
  v_emp   public.employees;
  v_row   public.employees;
  v_count int := 0;
  v_term  text;
  v_ip    inet;
  v_ua    text := left(coalesce(p_user_agent, ''), 400);
  v_sid   uuid;
  v_store text;
begin
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'unpaired');
  end if;
  select * into v_dev from public.web_store_devices where secret_hash = p_secret_hash;
  if not found or v_dev.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'unpaired');
  end if;
  if not exists (select 1 from public.tenants t where t.id = v_dev.tenant_id and t.status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;

  v_term := 'web:' || v_dev.id;
  perform set_config('app.tenant_id', v_dev.tenant_id::text, true);
  begin v_ip := nullif(p_ip, '')::inet; exception when others then v_ip := null; end;

  if p_pin is null or p_pin !~ '^\d{4,8}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if public.pin_attempts_blocked(v_term, v_ip, null) then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', 120);
  end if;

  for v_row in
    select e.* from public.employees e
     where e.tenant_id = v_dev.tenant_id
       and e.status = 'active'
       and e.pin_hash is not null
       and public.web_pin_matches(e, p_pin)
     limit 2
  loop
    v_count := v_count + 1;
    v_emp := v_row;
  end loop;

  if v_count = 0 then
    insert into public.pin_attempts (terminal_id, ok, ip, user_agent, employee_id, tenant_id)
    values (v_term, false, v_ip, v_ua, null, v_dev.tenant_id);
    perform public.log_security_event('web.store.pin', 'fail', null, v_term, '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;
  if v_count > 1 then
    -- رمزان متطابقان لموظفين بنفس المحل: لا يمكن تحديد الهوية، يجب تغيير أحدهما.
    perform public.log_security_event('web.store.pin', 'blocked', null, v_term,
      jsonb_build_object('reason', 'ambiguous_pin'));
    return jsonb_build_object('ok', false, 'reason', 'ambiguous');
  end if;
  if public.pin_attempts_blocked(v_term, v_ip, v_emp.id) then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', 120);
  end if;

  if v_emp.pin_kdf_version = 1 then
    update public.employees
       set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
           pin_kdf_version = 2, updated_at = now()
     where id = v_emp.id;
  end if;

  insert into public.pin_attempts (terminal_id, ok, ip, user_agent, employee_id, tenant_id)
  values (v_term, true, v_ip, v_ua, v_emp.id, v_emp.tenant_id);

  -- موظف واحد نشط لكل متصفح: الدخول الجديد يُنهي جلسة من كان قبله.
  update public.app_sessions
     set closed_at = now(), close_reason = 'replaced'
   where terminal_id = v_term and closed_at is null;

  insert into public.app_sessions
    (terminal_id, employee_id, employee_name, app_version, platform, meta, ip, user_agent, device_name, tenant_id)
  values
    (v_term, v_emp.id, coalesce(v_emp.display_name, v_emp.name), 'web', 'web',
     jsonb_build_object('source', 'web-store-pin', 'store_device_id', v_dev.id),
     v_ip, v_ua, nullif(v_dev.label, ''), v_emp.tenant_id)
  returning id into v_sid;

  update public.web_store_devices set last_used_at = now() where id = v_dev.id;

  perform public.log_security_event('web.login', 'ok', v_emp.id, v_term,
    jsonb_build_object('via', 'store_pin'));

  select name into v_store from public.tenants where id = v_emp.tenant_id;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_sid,
    'employee', jsonb_build_object(
      'id', v_emp.id,
      'name', coalesce(v_emp.display_name, v_emp.name),
      'role', v_emp.role,
      'department', v_emp.department,
      'avatar_url', v_emp.avatar_url),
    'permissions', to_jsonb(public.employee_permissions(v_emp)),
    'store_name', v_store);
end
$$;

-- ------------------------------------------------------------------
-- حالة المتصفح: هل حساب المحل مفعّل؟ ومن الموظف الحالي إن وُجدت جلسة صالحة؟
create or replace function public.web_store_status(p_secret_hash text, p_session_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_dev   public.web_store_devices;
  v_s     public.app_sessions;
  v_emp   public.employees;
  v_store text;
begin
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'unpaired');
  end if;
  select * into v_dev from public.web_store_devices where secret_hash = p_secret_hash;
  if not found or v_dev.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'unpaired');
  end if;
  select name into v_store from public.tenants where id = v_dev.tenant_id and status = 'active';
  if v_store is null then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;

  if p_session_id is not null then
    select * into v_s from public.app_sessions
     where id = p_session_id
       and terminal_id = 'web:' || v_dev.id
       and tenant_id = v_dev.tenant_id
       and closed_at is null
       and last_seen_at >= now() - interval '30 minutes'
       and opened_at >= now() - interval '12 hours';
    if found then
      select * into v_emp from public.employees
       where id = v_s.employee_id and tenant_id = v_dev.tenant_id and status = 'active';
      if found then
        update public.app_sessions set last_seen_at = now() where id = v_s.id;
        return jsonb_build_object(
          'ok', true, 'store_name', v_store,
          'session', jsonb_build_object(
            'session_id', v_s.id,
            'opened_at', v_s.opened_at,
            'employee', jsonb_build_object(
              'id', v_emp.id,
              'name', coalesce(v_emp.display_name, v_emp.name),
              'role', v_emp.role,
              'department', v_emp.department,
              'avatar_url', v_emp.avatar_url),
            'permissions', to_jsonb(public.employee_permissions(v_emp))));
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'store_name', v_store, 'session', null);
end
$$;

-- ------------------------------------------------------------------
-- قفل الشاشة: تُغلق جلسة الموظف ويبقى المتصفح مفعّلاً على حساب المحل.
create or replace function public.web_store_lock(p_secret_hash text, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_dev public.web_store_devices;
begin
  select * into v_dev from public.web_store_devices where secret_hash = p_secret_hash;
  if not found then return jsonb_build_object('ok', true); end if;
  update public.app_sessions
     set closed_at = now(), close_reason = 'locked'
   where id = p_session_id and terminal_id = 'web:' || v_dev.id and closed_at is null;
  return jsonb_build_object('ok', true);
end
$$;

-- ------------------------------------------------------------------
-- الخروج من حساب المحل: يُلغى تفعيل المتصفح وتُغلق جلساته.
create or replace function public.web_store_forget(p_secret_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_dev public.web_store_devices;
begin
  select * into v_dev from public.web_store_devices
   where secret_hash = p_secret_hash and revoked_at is null for update;
  if not found then return jsonb_build_object('ok', true); end if;
  perform set_config('app.tenant_id', v_dev.tenant_id::text, true);
  update public.web_store_devices
     set revoked_at = now(), revoked_reason = 'store_signout'
   where id = v_dev.id;
  update public.app_sessions
     set closed_at = now(), close_reason = 'store_signout'
   where terminal_id = 'web:' || v_dev.id and closed_at is null;
  perform public.log_security_event('web.store.signout', 'ok', null, 'web:' || v_dev.id, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$$;

-- ------------------------------------------------------------------
-- web_guard: نفس الفحوص السابقة، مع قبول طرفيات أجهزة المحل.
create or replace function public.web_guard(p_session_id uuid, p_module text default null, p_action text default null)
returns public.app_sessions
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_row  public.app_sessions;
  v_s    public.app_sessions;
  v_dev  public.web_devices;
  v_sdev public.web_store_devices;
begin
  select * into v_row from public.app_sessions where id = p_session_id;
  if not found or v_row.terminal_id is null or v_row.terminal_id !~ '^web:[0-9a-f-]{36}$' then
    raise exception 'انتهت الجلسة — سجّل الدخول من جديد' using errcode = '28000';
  end if;
  if v_row.closed_at is null
     and (v_row.last_seen_at < now() - interval '30 minutes' or v_row.opened_at < now() - interval '12 hours') then
    raise exception 'انتهت الجلسة — أدخل رمزك من جديد' using errcode = '28000';
  end if;

  select * into v_dev from public.web_devices where id = substr(v_row.terminal_id, 5)::uuid;
  if found then
    if v_dev.revoked_at is not null
       or v_dev.employee_id is distinct from v_row.employee_id
       or v_dev.tenant_id is distinct from v_row.tenant_id then
      raise exception 'هذا الجهاز لم يعد مربوطاً' using errcode = '28000';
    end if;
  else
    select * into v_sdev from public.web_store_devices where id = substr(v_row.terminal_id, 5)::uuid;
    if not found
       or v_sdev.revoked_at is not null
       or v_sdev.tenant_id is distinct from v_row.tenant_id then
      raise exception 'هذا الجهاز لم يعد مربوطاً' using errcode = '28000';
    end if;
  end if;

  if p_action is not null then
    v_s := public.intent_guard_action(p_session_id, p_module, p_action);
  else
    v_s := public.intent_guard(p_session_id, p_module);
  end if;

  perform public.audit_set_actor(jsonb_build_object(
    'source', 'تطبيق الويب',
    'actor', (select coalesce(e.display_name, e.name) from public.employees e where e.id = v_s.employee_id),
    'employee_id', v_s.employee_id,
    'terminal_id', v_s.terminal_id,
    'tenant_id', v_s.tenant_id));
  return v_s;
end
$$;

-- ------------------------------------------------------------------
-- الصلاحيات: الخادم وحده (service_role) يستدعي الدوال، عدا التفعيل الذي يحتاج رمز حساب المحل.
revoke execute on function public.web_store_owner_tenant(uuid) from public, anon, authenticated;
revoke execute on function public.web_store_device_register(text, text, text) from public, anon;
revoke execute on function public.web_store_pin_open(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.web_store_status(text, uuid) from public, anon, authenticated;
revoke execute on function public.web_store_lock(text, uuid) from public, anon, authenticated;
revoke execute on function public.web_store_forget(text) from public, anon, authenticated;
revoke execute on function public.web_guard(uuid, text, text) from public, anon, authenticated;

grant execute on function public.web_store_device_register(text, text, text) to authenticated, service_role;
grant execute on function public.web_store_owner_tenant(uuid) to service_role;
grant execute on function public.web_store_pin_open(text, text, text, text) to service_role;
grant execute on function public.web_store_status(text, uuid) to service_role;
grant execute on function public.web_store_lock(text, uuid) to service_role;
grant execute on function public.web_store_forget(text) to service_role;
grant execute on function public.web_guard(uuid, text, text) to service_role;
grant select, insert, update on public.web_store_devices to service_role;
