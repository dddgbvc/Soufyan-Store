-- ربط SAS4 الموجود في البرنامج: التطبيق يضع أوامر قراءة في نفس طابور البرنامج (sas_remote_commands)،
-- ووكيل SAS4 في برنامج المكتب (الذي يملك بيانات دخول الموزع المشفرة) ينفذها ويكتب النتيجة.
-- • أوامر القراءة فقط وبنفس أنواع البرنامج: auth_check، get_users، get_user، get_activation_data.
-- • الصلاحية عبر isp__reseller_guard (نفس حساب الموزع وصلاحيات الموظف عليه).
-- • لا تُنشأ أوامر تفعيل أو تجديد من الهاتف: التجديد يحرّك رصيد الموزع والمال ويبقى في البرنامج.

create or replace function public.web_sas_command(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_acc public.sas_reseller_accounts;
  v_type text := coalesce(p_payload->>'command_type', '');
  v_args jsonb := coalesce(p_payload->'payload', '{}'::jsonb);
  v_clean jsonb;
  v_id uuid;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  if v_type not in ('auth_check', 'get_users', 'get_user', 'get_activation_data') then
    raise exception 'أمر غير مسموح من التطبيق' using errcode = '22023';
  end if;
  v_acc := public.isp__reseller_guard(v_s, nullif(p_payload->>'account_id', '')::uuid,
                                      case when v_type = 'auth_check' then 'accounts.read' else 'subscribers.read' end);
  v_clean := case v_type
    when 'get_users' then jsonb_build_object('search', left(btrim(coalesce(v_args->>'search', '')), 60))
    when 'auth_check' then '{}'::jsonb
    else jsonb_build_object('user_id', (v_args->>'user_id')::bigint) end;
  if v_type in ('get_user', 'get_activation_data') and (v_clean->>'user_id') is null then
    raise exception 'رقم المشترك لدى المزوّد مطلوب' using errcode = '22023';
  end if;
  if (select count(*) from public.sas_remote_commands
       where reseller_account_id = v_acc.id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'طلبات كثيرة على حساب الموزع. انتظر دقيقة.' using errcode = 'P0001';
  end if;
  -- نفس الأمر المعلّق لا يتكرر (إعادة الضغط أو انقطاع الشبكة).
  select id into v_id from public.sas_remote_commands
   where reseller_account_id = v_acc.id and command_type = v_type and payload = v_clean
     and status in ('pending', 'running') and created_at > now() - interval '10 minutes'
   order by created_at desc limit 1;
  if v_id is null then
    insert into public.sas_remote_commands (user_id, command_type, payload, status, reseller_account_id)
    values (v_acc.owner_user_id, v_type, v_clean, 'pending', v_acc.id)
    returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.web_sas_command_result(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_c public.sas_remote_commands;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  select c.* into v_c from public.sas_remote_commands c
    join public.sas_reseller_accounts a on a.id = c.reseller_account_id and a.tenant_id = v_s.tenant_id
   where c.id = nullif(p_params->>'id', '')::uuid;
  if not found then raise exception 'الطلب غير موجود' using errcode = '22023'; end if;
  perform public.isp__reseller_guard(v_s, v_c.reseller_account_id, 'subscribers.read');
  return jsonb_build_object('ok', true, 'id', v_c.id, 'status', v_c.status, 'command_type', v_c.command_type,
    'result', v_c.result, 'error', v_c.error, 'created_at', v_c.created_at, 'finished_at', v_c.finished_at);
end $$;

-- حالة وكيل SAS4 في البرنامج وحسابات الموزع المتاحة للموظف.
create or replace function public.web_sas_status(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_admin boolean;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  select upper(coalesce(role, '')) = 'ADMIN' into v_admin from public.employees where id = v_s.employee_id;
  return jsonb_build_object('ok', true, 'accounts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'provider', a.provider, 'last_login_at', a.last_login_at, 'last_error', a.last_error,
      'permissions', case when v_admin then to_jsonb(array['*']) else to_jsonb(x.permissions) end,
      'agent_last_done', (select max(finished_at) from public.sas_remote_commands c where c.reseller_account_id = a.id),
      'pending', (select count(*) from public.sas_remote_commands c where c.reseller_account_id = a.id and c.status = 'pending'))
      order by a.created_at)
    from public.sas_reseller_accounts a
    left join public.sas_employee_account_access x
      on x.reseller_account_id = a.id and x.tenant_id = a.tenant_id and x.employee_id = v_s.employee_id and x.is_active
    where a.tenant_id = v_s.tenant_id and a.deleted_at is null and a.is_active and (v_admin or x.id is not null)), '[]'::jsonb));
end $$;

revoke execute on function public.web_sas_command(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_sas_command_result(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_sas_status(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.web_sas_command(uuid, jsonb) to service_role;
grant execute on function public.web_sas_command_result(uuid, jsonb) to service_role;
grant execute on function public.web_sas_status(uuid, jsonb) to service_role;
