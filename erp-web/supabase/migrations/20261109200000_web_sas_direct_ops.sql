-- ربط SAS4 المباشر بالأبراج: كل برج = حساب موزع في SAS4 بدخول محفوظ دائماً، وتبديل سريع بينها من التطبيق.
-- • كلمة مرور البرج تُشفَّر في الخادم (AES-256-GCM بمفتاح سرّي في Cloudflare) قبل وصولها هنا،
--   فلا تُحفظ نصاً في قاعدة البيانات ولا ترجع للتطبيق أبداً. القاعدة لا تملك مفتاح فكها.
-- • إضافة الأبراج وتعديلها وحذفها للمدير فقط.
-- • عمليات SAS4 (تجديد، تمديد، باقة، تعديل، إعادة تسمية، إنشاء) تمر عبر web_sas_op_begin/finish:
--   فحص صلاحية، منع تكرار (client_ref)، وسجل تدقيق. نتيجة غير مؤكدة تمنع إعادة الإرسال.
-- • لا تمس جداول المال أو الديون: ترحيل الدين يبقى عبر isp_renewal_* المعتمدة.

create table if not exists public.sas_towers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  host text not null check (host ~ '^[A-Za-z0-9.-]{3,120}(:[0-9]{1,5})?$'),
  username text not null check (length(username) between 1 and 120),
  password_enc text not null check (password_enc like 'v1:%' and length(password_enc) < 1000),
  reseller_account_id uuid references public.sas_reseller_accounts(id),
  sort int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  last_error text,
  deleted_at timestamptz
);
create unique index if not exists sas_towers_login_uidx on public.sas_towers (tenant_id, lower(host), lower(username)) where deleted_at is null;
alter table public.sas_towers enable row level security;
revoke all on public.sas_towers from public, anon, authenticated;

create table if not exists public.sas_direct_ops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tower_id uuid not null references public.sas_towers(id),
  employee_id uuid not null,
  op text not null check (op in ('renew', 'extend', 'change_profile', 'edit', 'rename', 'create')),
  sas_user_id bigint,
  client_ref text not null check (client_ref ~ '^[A-Za-z0-9_-]{8,80}$'),
  transaction_id uuid not null default gen_random_uuid(),
  summary jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'unknown')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (tenant_id, client_ref)
);
create index if not exists sas_direct_ops_user_idx on public.sas_direct_ops (tower_id, sas_user_id, created_at desc);
alter table public.sas_direct_ops enable row level security;
revoke all on public.sas_direct_ops from public, anon, authenticated;

create or replace function public.web_sas__is_admin(p_s public.app_sessions)
returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
  select coalesce((select upper(coalesce(role, '')) = 'ADMIN' from public.employees where id = p_s.employee_id), false)
$$;

-- البرج المطلوب بعد فحص الصلاحية:
-- • المدير: كل الأبراج وكل العمليات.
-- • غيره: برج مربوط بحساب موزع يملك عليه الصلاحية المطلوبة (isp__reseller_guard)،
--   أو برج غير مربوط للقراءة فقط.
create or replace function public.web_sas__tower(p_s public.app_sessions, p_tower uuid, p_perm text)
returns public.sas_towers language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_t public.sas_towers;
begin
  select * into v_t from public.sas_towers where id = p_tower and tenant_id = p_s.tenant_id and deleted_at is null;
  if not found then raise exception 'البرج غير موجود. اختر برجاً آخر.' using errcode = '22023'; end if;
  if public.web_sas__is_admin(p_s) then return v_t; end if;
  if v_t.reseller_account_id is not null then
    perform public.isp__reseller_guard(p_s, v_t.reseller_account_id, p_perm);
  elsif p_perm <> 'subscribers.read' then
    raise exception 'هذه العملية للمدير فقط على هذا البرج.' using errcode = '42501';
  end if;
  return v_t;
end $$;
revoke execute on function public.web_sas__tower(public.app_sessions, uuid, text) from public, anon, authenticated;
revoke execute on function public.web_sas__is_admin(public.app_sessions) from public, anon, authenticated;

-- قائمة الأبراج (بلا أي سر).
create or replace function public.web_sas_towers(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_admin boolean;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  v_admin := public.web_sas__is_admin(v_s);
  return jsonb_build_object('ok', true, 'can_manage', v_admin, 'towers', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'host', t.host, 'username', t.username,
             'reseller_account_id', t.reseller_account_id, 'last_login_at', t.last_login_at, 'last_error', t.last_error)
             order by t.sort, t.created_at)
      from public.sas_towers t
     where t.tenant_id = v_s.tenant_id and t.deleted_at is null), '[]'::jsonb));
end $$;

-- إضافة برج أو تعديله (المدير). الخادم يتحقق من الدخول إلى SAS4 ويشفّر كلمة المرور قبل الاستدعاء.
create or replace function public.web_sas_tower_save(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_name text := btrim(coalesce(p_payload->>'name', ''));
  v_host text := lower(btrim(coalesce(p_payload->>'host', '')));
  v_user text := btrim(coalesce(p_payload->>'username', ''));
  v_enc text := nullif(p_payload->>'password_enc', '');
  v_acc uuid := nullif(p_payload->>'reseller_account_id', '')::uuid;
  v_n int;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  if not public.web_sas__is_admin(v_s) then raise exception 'إدارة الأبراج للمدير فقط.' using errcode = '42501'; end if;
  if v_acc is not null and not exists (select 1 from public.sas_reseller_accounts where id = v_acc and tenant_id = v_s.tenant_id and deleted_at is null) then
    raise exception 'حساب الموزع غير موجود' using errcode = '22023';
  end if;
  if v_id is null then
    if v_enc is null or v_user = '' or v_host = '' then raise exception 'بيانات الدخول ناقصة' using errcode = '22023'; end if;
    select count(*) into v_n from public.sas_towers where tenant_id = v_s.tenant_id;
    if v_name = '' then v_name := 'برج ' || (v_n + 1); end if;
    if exists (select 1 from public.sas_towers where tenant_id = v_s.tenant_id and deleted_at is null and lower(host) = v_host and lower(username) = lower(v_user)) then
      raise exception 'هذا الحساب مضاف مسبقاً كبرج.' using errcode = '23505';
    end if;
    insert into public.sas_towers (tenant_id, name, host, username, password_enc, reseller_account_id, sort, created_by, last_login_at)
    values (v_s.tenant_id, left(v_name, 60), v_host, v_user, v_enc, v_acc, v_n, v_s.employee_id, now())
    returning id into v_id;
  else
    update public.sas_towers t
       set name = case when v_name = '' then t.name else left(v_name, 60) end,
           host = case when v_enc is null then t.host else v_host end,
           username = case when v_enc is null then t.username else v_user end,
           password_enc = coalesce(v_enc, t.password_enc),
           reseller_account_id = case when p_payload ? 'reseller_account_id' then v_acc else t.reseller_account_id end,
           last_login_at = case when v_enc is null then t.last_login_at else now() end,
           last_error = case when v_enc is null then t.last_error else null end,
           updated_at = now()
     where t.id = v_id and t.tenant_id = v_s.tenant_id and t.deleted_at is null;
    if not found then raise exception 'البرج غير موجود' using errcode = '22023'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.web_sas_tower_delete(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  if not public.web_sas__is_admin(v_s) then raise exception 'إدارة الأبراج للمدير فقط.' using errcode = '42501'; end if;
  update public.sas_towers set deleted_at = now(), password_enc = 'v1:deleted', updated_at = now()
   where id = nullif(p_payload->>'id', '')::uuid and tenant_id = v_s.tenant_id and deleted_at is null;
  if not found then raise exception 'البرج غير موجود' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- للخادم فقط: بيانات دخول البرج المشفرة بعد فحص الجلسة والصلاحية.
create or replace function public.web_sas_tower_login(p_session_id uuid, p_params jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_t public.sas_towers;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  v_t := public.web_sas__tower(v_s, nullif(p_params->>'tower_id', '')::uuid, coalesce(nullif(p_params->>'perm', ''), 'subscribers.read'));
  return jsonb_build_object('ok', true, 'tower_id', v_t.id, 'name', v_t.name, 'host', v_t.host, 'username', v_t.username, 'password_enc', v_t.password_enc);
end $$;

-- للخادم فقط: نتيجة آخر دخول للبرج.
create or replace function public.web_sas_tower_mark(p_tower uuid, p_ok boolean, p_error text default null)
returns void language sql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
  update public.sas_towers
     set last_login_at = case when p_ok then now() else last_login_at end,
         last_error = case when p_ok then null else left(p_error, 300) end
   where id = p_tower and deleted_at is null
$$;

-- بدء عملية: صلاحية + منع تكرار + transaction_id، ويرجع بيانات دخول البرج المشفرة للخادم.
create or replace function public.web_sas_op_begin(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_t public.sas_towers;
  v_op text := coalesce(p_payload->>'op', '');
  v_ref text := coalesce(p_payload->>'client_ref', '');
  v_perm text;
  v_row public.sas_direct_ops;
  v_summary jsonb := coalesce(p_payload->'summary', '{}'::jsonb);
  v_login jsonb;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  v_perm := case v_op
    when 'renew' then 'subscribers.renew' when 'extend' then 'subscribers.renew'
    when 'change_profile' then 'subscribers.update' when 'edit' then 'subscribers.update' when 'rename' then 'subscribers.update'
    when 'create' then 'subscribers.create' end;
  if v_perm is null then raise exception 'عملية غير مسموحة' using errcode = '22023'; end if;
  if v_ref !~ '^[A-Za-z0-9_-]{8,80}$' then raise exception 'مرجع العملية غير صالح' using errcode = '22023'; end if;
  if jsonb_typeof(v_summary) <> 'object' or length(v_summary::text) > 4000 or v_summary ?| array['password', 'new_password', 'pin'] then
    raise exception 'ملخص العملية غير صالح' using errcode = '22023';
  end if;
  v_t := public.web_sas__tower(v_s, nullif(p_payload->>'tower_id', '')::uuid, v_perm);
  v_login := jsonb_build_object('tower_id', v_t.id, 'host', v_t.host, 'username', v_t.username, 'password_enc', v_t.password_enc);

  select * into v_row from public.sas_direct_ops where tenant_id = v_s.tenant_id and client_ref = v_ref;
  if found then
    if v_row.op <> v_op or v_row.employee_id <> v_s.employee_id or v_row.tower_id <> v_t.id then
      raise exception 'مرجع العملية مستعمل لعملية أخرى' using errcode = '22023';
    end if;
    if v_row.status = 'success' then
      return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_row.id, 'status', v_row.status,
                                'transaction_id', v_row.transaction_id, 'result', v_row.result);
    end if;
    if v_row.status = 'failed' then
      raise exception 'رُفضت هذه العملية سابقاً: %', coalesce(v_row.error, '') using errcode = 'P0001';
    end if;
    raise exception 'هذه العملية أُرسلت سابقاً ولم تتأكد نتيجتها. افتح المشترك في SAS4 وتحقق قبل إعادة المحاولة.' using errcode = 'P0001';
  end if;

  if (select count(*) from public.sas_direct_ops where tower_id = v_t.id and created_at > now() - interval '1 minute') >= 15 then
    raise exception 'عمليات كثيرة على هذا البرج. انتظر دقيقة.' using errcode = 'P0001';
  end if;
  if v_op in ('renew', 'extend') and exists (
       select 1 from public.sas_direct_ops where tower_id = v_t.id and sas_user_id = nullif(p_payload->>'sas_user_id', '')::bigint
         and op in ('renew', 'extend') and status in ('success', 'pending', 'unknown') and created_at > now() - interval '2 minutes') then
    raise exception 'هذا المشترك جُدّد قبل لحظات. تحقق قبل تجديده مرة ثانية.' using errcode = 'P0001';
  end if;

  insert into public.sas_direct_ops (tenant_id, tower_id, employee_id, op, sas_user_id, client_ref, summary)
  values (v_s.tenant_id, v_t.id, v_s.employee_id, v_op, nullif(p_payload->>'sas_user_id', '')::bigint, v_ref, v_summary)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'duplicate', false, 'id', v_row.id, 'status', v_row.status,
                            'transaction_id', v_row.transaction_id, 'login', v_login);
end $$;

create or replace function public.web_sas_op_finish(p_id uuid, p_status text, p_result jsonb default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
begin
  if p_status not in ('success', 'failed', 'unknown') then raise exception 'حالة غير صالحة' using errcode = '22023'; end if;
  update public.sas_direct_ops
     set status = p_status, result = p_result, error = left(p_error, 500), finished_at = now()
   where id = p_id and status = 'pending';
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.web_sas_ops_list(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_t public.sas_towers;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  v_t := public.web_sas__tower(v_s, nullif(p_params->>'tower_id', '')::uuid, 'subscribers.read');
  return jsonb_build_object('ok', true, 'ops', coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'op', o.op, 'sas_user_id', o.sas_user_id, 'status', o.status,
             'summary', o.summary, 'error', o.error, 'created_at', o.created_at, 'finished_at', o.finished_at,
             'employee', e.name) order by o.created_at desc)
      from (select * from public.sas_direct_ops
             where tower_id = v_t.id
               and (nullif(p_params->>'sas_user_id', '') is null or sas_user_id = (p_params->>'sas_user_id')::bigint)
             order by created_at desc limit 50) o
      left join public.employees e on e.id = o.employee_id), '[]'::jsonb));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'web_sas_towers(uuid, jsonb)', 'web_sas_tower_save(uuid, jsonb)', 'web_sas_tower_delete(uuid, jsonb)',
    'web_sas_tower_login(uuid, jsonb)', 'web_sas_tower_mark(uuid, boolean, text)',
    'web_sas_op_begin(uuid, jsonb)', 'web_sas_op_finish(uuid, text, jsonb, text)', 'web_sas_ops_list(uuid, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
